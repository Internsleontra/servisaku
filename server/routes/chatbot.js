import { Router } from 'express';
import { z } from 'zod';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { prisma } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler, ApiError, isAdmin } from '../lib/access.js';
import {
  handleMessage, escalate, greeting, publicFaqs, isChatbotReady,
} from '../lib/chatbot/index.js';

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
  res.json({ available: isChatbotReady(), faqs: publicFaqs(audience) });
}));

const startSchema = z.object({
  session_id: z.string().min(8).max(100),
  locale: z.enum(['en', 'ms']).default('en'),
});
router.post('/conversations', validate(startSchema), asyncHandler(async (req, res) => {
  const role = req.user?.role === 'partner' ? 'partner' : 'consumer';
  const conversation = await prisma.chatbotConversation.create({
    data: {
      userId: req.user?.id ?? null,
      sessionId: req.body.session_id,
      role,
      locale: req.body.locale,
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

  const result = await handleMessage(conversation, req.body.message, req.user ?? null);
  res.json({
    reply: result.reply,
    confidence: result.confidence,
    sources: result.sources,
    escalate_suggested: result.escalate,
    escalate_reason: result.escalateReason,
    // Escalation needs an account to attach the ticket to.
    can_escalate: Boolean(req.user?.id),
  });
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
