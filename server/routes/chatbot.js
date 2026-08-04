import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { prisma } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, ApiError, isAdmin } from '../lib/access.js';
import {
  handleMessage, escalate, greeting, publicFaqs, isChatbotReady,
} from '../lib/chatbot/index.js';
import {
  ACTION_TYPES, STATUS, canConfirm, loadOwnedAction, settleAction, toCard,
} from '../lib/chatbot/actions.js';
import { classifyImage, routeFor } from '../lib/chatbot/vision.js';
import { transcribe } from '../lib/chatbot/audio.js';
import { validateUpload, uploadBuffer, isUploadReady } from '../lib/uploads/index.js';

// Files are held in memory and streamed straight to storage — they never touch
// this server's disk. Same pattern as routes/uploads.js.
const attachment = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const voice = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const router = Router();

// LLM calls cost money, so the limiter is tighter than the global one — and
// tighter still for anonymous callers, who are keyed by IP.
const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: (req) => (req.user ? 120 : 30),
  // ipKeyGenerator normalises IPv6 to its /64 prefix. Using req.ip raw would
  // let an IPv6 client hop addresses within its own prefix and bypass the
  // limit entirely — the library refuses to start without it.
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip),
  standardHeaders: true,
  legacyHeaders: false,
});

// Authentication is OPTIONAL here: an anonymous visitor can ask FAQ questions
// before signing up. They simply get no account context (see chatbot/context.js).
async function optionalAuth(req, res, next) {
  if (!req.headers.authorization?.startsWith('Bearer ')) return next();
  return authenticate(req, res, (err) => (err ? next() : next()));
}

router.use(optionalAuth);
router.use(chatLimiter);

const MAX_MESSAGES = 50;

function mapConversation(c, messages) {
  return {
    id: c.id,
    role: c.role,
    locale: c.locale,
    status: c.status,
    topic: c.topic,
    message_count: c.messageCount,
    escalated_at: c.escalatedAt,
    support_ticket_id: c.supportTicketId,
    was_helpful: c.wasHelpful,
    created_date: c.createdAt,
    last_message_at: c.lastMessageAt,
    ...(messages ? { messages: messages.map(mapMessage) } : {}),
  };
}

function mapMessage(m) {
  return {
    id: m.id,
    sender: m.sender,
    content: m.content,
    intent: m.intent,
    // Confidence and sources are diagnostic; harmless to expose and useful
    // for a "was this helpful" prompt in the UI.
    confidence: m.confidence,
    sources: m.sources ?? null,
    created_date: m.createdAt,
  };
}

async function getConversationFor(req, id) {
  const conversation = await prisma.chatbotConversation.findUnique({ where: { id } });
  if (!conversation) throw new ApiError(404, 'Conversation not found');
  // A logged-in user owns their conversations; an anonymous one is held by its
  // session id, which the client must present.
  const owns = conversation.userId
    ? conversation.userId === req.user?.id
    : conversation.sessionId === (req.headers['x-session-id'] || req.query.session_id);
  if (!owns && !isAdmin(req.user)) throw new ApiError(403, 'Forbidden');
  return conversation;
}

// GET /api/chatbot/faqs — public FAQ corpus; also feeds the Help page.
router.get('/faqs', asyncHandler(async (req, res) => {
  const audience = req.query.audience === 'partner' ? 'partner' : 'consumer';
  const locale = ['en', 'ms'].includes(req.query.locale) ? req.query.locale : 'en';
  res.json({ available: isChatbotReady(), faqs: publicFaqs(audience, locale) });
}));

const startSchema = z.object({
  session_id: z.string().min(8).max(100),
  locale: z.enum(['en', 'ms']).default('en'),
  // Support is not a separate bot — it is this conversation running a
  // troubleshooting tree instead of answering a question.
  mode: z.enum(['assistant', 'support']).default('assistant'),
  device: z.object({
    platform: z.string().max(40).optional(),
    os_version: z.string().max(40).optional(),
    app_version: z.string().max(40).optional(),
    model: z.string().max(60).optional(),
  }).optional(),
});
router.post('/conversations', validate(startSchema), asyncHandler(async (req, res) => {
  const role = req.user?.role === 'partner' ? 'partner' : 'consumer';
  const conversation = await prisma.chatbotConversation.create({
    data: {
      userId: req.user?.id ?? null,
      sessionId: req.body.session_id,
      role,
      locale: req.body.locale,
      mode: req.body.mode,
      // Captured at the start rather than at escalation: by the time someone is
      // reporting a crash, asking them for their app version is one more thing
      // to do while already frustrated.
      deviceInfo: req.body.device ?? null,
    },
  });
  res.status(201).json({ ...mapConversation(conversation), greeting: greeting(req.body.locale) });
}));

router.get('/conversations', asyncHandler(async (req, res) => {
  if (!req.user?.id) throw new ApiError(401, 'Sign in to see your conversation history');
  const items = await prisma.chatbotConversation.findMany({
    where: { userId: req.user.id },
    orderBy: { lastMessageAt: 'desc' },
    take: 50,
  });
  res.json(items.map((c) => mapConversation(c)));
}));

router.get('/conversations/:id', asyncHandler(async (req, res) => {
  const conversation = await getConversationFor(req, req.params.id);
  const messages = await prisma.chatbotMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
  });
  res.json(mapConversation(conversation, messages));
}));

const messageSchema = z.object({ message: z.string().min(1).max(2000) });
router.post('/conversations/:id/messages', validate(messageSchema), asyncHandler(async (req, res) => {
  const conversation = await getConversationFor(req, req.params.id);
  if (conversation.status === 'escalated') {
    throw new ApiError(409, 'This conversation has been handed to our support team — please continue in the ticket');
  }
  if (conversation.messageCount >= MAX_MESSAGES * 2) {
    throw new ApiError(429, 'This conversation has reached its limit — please start a new one');
  }

  const result = await handleMessage(conversation, req.body.message, req.user ?? null, {
    acceptLanguage: req.headers['accept-language'],
  });
  res.json({
    reply: result.reply,
    confidence: result.confidence,
    sources: result.sources,
    locale: result.locale,
    escalate_suggested: result.escalate,
    escalate_reason: result.escalateReason,
    // Escalation needs an account to attach the ticket to.
    can_escalate: Boolean(req.user?.id),
    // Present only on a troubleshooting turn. `tree` drives the "step 2 of 4"
    // display — a diagnostic sequence with no visible end feels like an
    // interrogation.
    quick_replies: result.quickReplies ?? null,
    action: result.action ?? null,
    tree: result.tree ?? null,
  });
}));

// ─── Multimodal ──────────────────────────────────────────────────────────────

// POST /conversations/:id/attachments — a photo of the problem.
// The classifier is closed-set (see lib/chatbot/vision.js), so an unrecognised
// image asks a question rather than guessing at a service.
router.post('/conversations/:id/attachments', attachment.single('file'), asyncHandler(async (req, res) => {
  if (!req.user?.id) throw new ApiError(401, 'Sign in to attach a photo');
  const conversation = await getConversationFor(req, req.params.id);
  if (!req.file?.buffer?.length) throw new ApiError(400, 'No file was received');

  // Type is proven from the bytes, never from the filename or Content-Type.
  const check = validateUpload(req.file.buffer, { allow: ['image'] });
  if (!check.ok) throw new ApiError(400, check.error?.message || 'That file type is not supported');

  const result = await classifyImage(req.file.buffer, { mime: check.mime });

  let stored = null;
  if (isUploadReady()) {
    try {
      stored = await uploadBuffer(req.file.buffer, {
        filename: req.file.originalname || `chat-${Date.now()}.${check.ext}`,
        type: check.mime,
        ownerId: req.user.id,
      });
    } catch (err) {
      // Storage being down should not lose the classification — the diagnosis is
      // the useful part, the file is evidence for later.
      console.error('[chatbot] attachment upload failed:', err?.message || err);
    }
  }

  await prisma.chatbotMessage.create({
    data: {
      conversationId: conversation.id,
      sender: 'user',
      content: '[photo]',
      locale: conversation.lastLocale || conversation.locale,
      attachments: [{
        uploadId: stored?.id ?? null,
        url: stored?.url ?? null,
        mimeType: check.mime,
        kind: 'image',
        classifiedAs: result.symptom,
      }],
    },
  });

  const route = routeFor(result.symptom);
  res.status(201).json({
    symptom: result.symptom,
    confident: result.confident,
    // A photo containing an identifiable person is flagged and not diagnosed.
    contains_person: result.containsPerson,
    upload_id: stored?.id ?? null,
    // Where the conversation goes next: a tree to enter at the branch the photo
    // already answered, or a safety path, or nothing — in which case the client
    // asks a clarifying question.
    route: route ? { tree_id: route.treeId, answers: route.answers ?? [], safety: Boolean(route.safety) } : null,
  });
}));

// POST /conversations/:id/transcribe — a voice note.
// Returns text for the COMPOSER; it is never sent as a message on the user's
// behalf (docs/11 §L2).
router.post('/conversations/:id/transcribe', voice.single('audio'), asyncHandler(async (req, res) => {
  if (!req.user?.id) throw new ApiError(401, 'Sign in to use voice input');
  const conversation = await getConversationFor(req, req.params.id);

  const result = await transcribe(req.file?.buffer, {
    locale: conversation.lastLocale || conversation.locale || 'en',
  });

  if (!result.available) {
    // An absent capability is a normal state the UI handles by asking the person
    // to type, not an error to surface as a failure.
    return res.status(503).json({ available: false, error: result.error });
  }
  if (result.error) throw new ApiError(400, result.error.message);

  return res.json({ available: true, text: result.text, editable: true });
}));

// ─── Action cards (Class W) ──────────────────────────────────────────────────
// The assistant proposes; the user confirms here; the EXISTING endpoint executes.
// See server/lib/chatbot/actions.js for why the model is never the thing that acts.

router.get('/conversations/:id/actions', asyncHandler(async (req, res) => {
  const conversation = await getConversationFor(req, req.params.id);
  const actions = await prisma.chatbotAction.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  res.json(actions.map(toCard));
}));

router.post('/conversations/:id/actions/:actionId/confirm', asyncHandler(async (req, res) => {
  if (!req.user?.id) throw new ApiError(401, 'Sign in to confirm this');
  await getConversationFor(req, req.params.id);

  const action = await loadOwnedAction(prisma, { id: req.params.actionId, userId: req.user.id });
  const verdict = canConfirm(action);

  // A repeated confirm is a double tap or a network retry, not an error. Return
  // the original outcome rather than executing twice or showing a failure.
  if (!verdict.ok && verdict.code === 'replay') {
    return res.json({ status: STATUS.CONFIRMED, result_ref: verdict.resultRef, replayed: true });
  }
  if (!verdict.ok) throw new ApiError(verdict.code === 'not_found' ? 404 : 409, verdict.message);

  // Execution is deliberately NOT implemented in this layer. The confirmation
  // hands off to the existing REST endpoint with the caller's own auth, so
  // authorisation, validation and audit stay in one place. Wiring the handoff
  // is the next slice; until then a confirmed card records intent and returns
  // the endpoint the client should call.
  const settled = await settleAction(prisma, {
    id: action.id, status: STATUS.CONFIRMED, resultRef: null,
  });
  const target = ACTION_TYPES[action.type].endpoint;
  return res.json({
    status: settled.status,
    execute: {
      method: target.method,
      path: target.path.replace(':id', action.payload.bookingId || action.payload.settlementId || ''),
    },
    payload: action.payload,
  });
}));

router.post('/conversations/:id/actions/:actionId/decline', asyncHandler(async (req, res) => {
  if (!req.user?.id) throw new ApiError(401, 'Sign in first');
  await getConversationFor(req, req.params.id);
  const action = await loadOwnedAction(prisma, { id: req.params.actionId, userId: req.user.id });
  if (!action) throw new ApiError(404, 'That action has expired or was never created');
  if (action.status !== STATUS.PENDING) {
    return res.json({ status: action.status });
  }
  const settled = await settleAction(prisma, { id: action.id, status: STATUS.DECLINED });
  return res.json({ status: settled.status });
}));

const escalateSchema = z.object({ reason: z.string().max(200).optional() });
router.post('/conversations/:id/escalate', validate(escalateSchema), asyncHandler(async (req, res) => {
  if (!req.user?.id) throw new ApiError(401, 'Sign in so we can create a support ticket for you');
  const conversation = await getConversationFor(req, req.params.id);
  const ticket = await escalate(conversation, req.user, req.body.reason);
  res.status(201).json({
    ticket_id: ticket.id,
    reference: ticket.reference,
    status: ticket.status,
    message: 'Our support team has your conversation and will be in touch.',
  });
}));

const feedbackSchema = z.object({ helpful: z.boolean() });
router.post('/conversations/:id/feedback', validate(feedbackSchema), asyncHandler(async (req, res) => {
  const conversation = await getConversationFor(req, req.params.id);
  const updated = await prisma.chatbotConversation.update({
    where: { id: conversation.id },
    data: { wasHelpful: req.body.helpful },
  });
  res.json(mapConversation(updated));
}));

router.post('/conversations/:id/close', asyncHandler(async (req, res) => {
  const conversation = await getConversationFor(req, req.params.id);
  const updated = await prisma.chatbotConversation.update({
    where: { id: conversation.id },
    data: { status: conversation.status === 'escalated' ? 'escalated' : 'resolved' },
  });
  res.json(mapConversation(updated));
}));

// ─── Admin ───────────────────────────────────────────────────────────────────

router.get('/admin/conversations', asyncHandler(async (req, res) => {
  if (!isAdmin(req.user)) throw new ApiError(403, 'Forbidden');
  const where = {};
  if (req.query.status) where.status = String(req.query.status);
  const items = await prisma.chatbotConversation.findMany({
    where, orderBy: { lastMessageAt: 'desc' }, take: 200,
  });
  res.json(items.map((c) => mapConversation(c)));
}));

// GET /api/chatbot/admin/stats — deflection rate, top intents, and the list
// that actually drives improvement: questions the corpus could not answer.
router.get('/admin/stats', asyncHandler(async (req, res) => {
  if (!isAdmin(req.user)) throw new ApiError(403, 'Forbidden');
  const [conversations, botMessages, unanswered, flagged] = await Promise.all([
    prisma.chatbotConversation.findMany({ take: 5000 }),
    prisma.chatbotMessage.findMany({ where: { sender: 'bot' }, select: { intent: true, confidence: true, tokensIn: true, tokensOut: true }, take: 5000 }),
    prisma.chatbotMessage.findMany({
      where: { sender: 'user', conversation: { messages: { some: { sender: 'bot', confidence: { lt: 0.3 } } } } },
      select: { content: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.chatbotMessage.count({ where: { flagged: true } }),
  ]);

  const escalated = conversations.filter((c) => c.status === 'escalated').length;
  const rated = conversations.filter((c) => c.wasHelpful != null);
  const byIntent = botMessages.reduce((a, m) => {
    if (m.intent) a[m.intent] = (a[m.intent] || 0) + 1;
    return a;
  }, {});

  res.json({
    conversations: conversations.length,
    escalated,
    deflection_rate: conversations.length ? Number(((1 - escalated / conversations.length) * 100).toFixed(1)) : null,
    helpful_rate: rated.length ? Number((rated.filter((c) => c.wasHelpful).length / rated.length * 100).toFixed(1)) : null,
    flagged_messages: flagged,
    total_tokens_in: botMessages.reduce((s, m) => s + (m.tokensIn || 0), 0),
    total_tokens_out: botMessages.reduce((s, m) => s + (m.tokensOut || 0), 0),
    by_intent: byIntent,
    unanswered_questions: unanswered.map((m) => ({ question: m.content, at: m.createdAt })),
  });
}));

export default router;
