// ─────────────────────────────────────────────────────────────────────────────
// Chatbot orchestrator: retrieve → guard → answer → decide escalation.
//
// Every answer is grounded in retrieved reference material. When the model is
// unavailable — no API key, an outage, a timeout — the bot degrades to serving
// the best-matching FAQ entry directly rather than erroring, so a provider
// problem never leaves a customer with a broken support channel.
// ─────────────────────────────────────────────────────────────────────────────
import { prisma } from '../../db.js';
import { retrieve } from './knowledge.js';
import { ask, isChatbotReady } from './provider.js';
import { buildUserContext } from './context.js';
import { resolveLocale } from './locale.js';
import { getTree } from './trees/index.js';
import { selectTree, startTree, continueTree } from './support.js';
import { retrieveClauses, validateCitations } from './legal.js';
import {
  sanitizeInput, frameUserContent, redactOutput, looksLikeInjection, shouldEscalate,
  wantsHuman,
} from './guardrails.js';

export { publicFaqs, retrieve } from './knowledge.js';
export { isChatbotReady, setChatbotProvider } from './provider.js';
export { resolveLocale, detectLocale, LOCALES } from './locale.js';

const GREETING = {
  en: "Hi! I'm the ServisAku assistant. Ask me about bookings, payments, refunds or anything else — I'll connect you to a human if I can't help.",
  ms: 'Hai! Saya pembantu ServisAku. Tanya saya tentang tempahan, pembayaran, bayaran balik atau apa sahaja — saya akan hubungkan anda kepada pasukan kami jika saya tidak dapat membantu.',
};

const CANT_HELP = {
  en: "I don't have a confident answer for that. Would you like me to connect you to our support team?",
  ms: 'Saya tidak pasti tentang itu. Mahukah anda saya hubungkan anda kepada pasukan sokongan kami?',
};

export function greeting(locale = 'en') {
  return GREETING[locale] || GREETING.en;
}

/**
 * Greetings and pleasantries.
 *
 * Without this, "hi" retrieves nothing and lands on "I don't have a confident
 * answer for that" — which is technically true and completely wrong as a first
 * impression. Someone opening a chat with a greeting is the most common opening
 * move there is.
 */
const SMALLTALK = [
  /^\s*(hi|hey|hello|yo|hai|helo|salam|assalamualaikum|morning|good\s*(morning|afternoon|evening))\b[\s!.?]*$/i,
  /^\s*(thanks|thank\s*you|thx|ty|terima\s*kasih|tq)\b[\s!.?]*$/i,
  /^\s*(ok|okay|okey|baik|noted|got\s*it|alright)\b[\s!.?]*$/i,
  /^\s*(bye|goodbye|see\s*you|selamat\s*tinggal)\b[\s!.?]*$/i,
];

const isSmalltalk = (text) => SMALLTALK.some((p) => p.test(text));

const SMALLTALK_REPLY = {
  consumer: {
    en: 'Hi! I can help with bookings, payments, refunds, or finding the right service. What do you need?',
    ms: 'Hai! Saya boleh bantu dengan tempahan, pembayaran, bayaran balik, atau mencari perkhidmatan yang sesuai. Apa yang anda perlukan?',
  },
  partner: {
    en: 'Hi! I can help with your schedule, earnings, commission, or drafting a message to a customer. What do you need?',
    ms: 'Hai! Saya boleh bantu dengan jadual, pendapatan, komisen, atau merangka mesej kepada pelanggan. Apa yang anda perlukan?',
  },
};

/** Openers offered as chips, so a greeting turns into a usable next step. */
const SMALLTALK_CHIPS = {
  consumer: {
    en: [
      { value: 'how do I book a service', label: 'Book a service' },
      { value: 'where is my booking', label: 'My bookings' },
      { value: 'how can I pay', label: 'Payments' },
    ],
    ms: [
      { value: 'bagaimana tempah', label: 'Tempah servis' },
      { value: 'di mana tempahan saya', label: 'Tempahan saya' },
      { value: 'cara bayar', label: 'Pembayaran' },
    ],
  },
  partner: {
    en: [
      { value: 'what do I have today', label: "Today's jobs" },
      { value: 'when do I get paid', label: 'Payouts' },
      { value: 'how much commission do you take', label: 'Commission' },
    ],
    ms: [
      { value: 'apa jadual saya hari ini', label: 'Kerja hari ini' },
      { value: 'bila saya dapat bayaran', label: 'Bayaran' },
      { value: 'berapa komisen', label: 'Komisen' },
    ],
  },
};

/**
 * Handle one user turn.
 *
 * @param {object} conversation  a ChatbotConversation row
 * @param {string} rawMessage
 * @param {object|null} user     the authenticated user, or null
 * @returns {Promise<{ reply, escalate, escalateReason, confidence, sources, flagged }>}
 */
export async function handleMessage(conversation, rawMessage, user, { acceptLanguage } = {}) {
  const started = Date.now();
  const role = conversation.role || 'consumer';

  const message = sanitizeInput(rawMessage);
  const flagged = looksLikeInjection(message);

  // Locale is resolved PER TURN. Malaysian users code-switch inside a single
  // sentence, so the reply follows the latest message rather than the language
  // the conversation opened in. `conversation.locale` is the explicit choice
  // from the language switcher and still outranks detection.
  const locale = resolveLocale({
    explicit: conversation.locale,
    userPreferred: user?.preferredLocale,
    message,
    acceptLanguage,
  });

  // Persist the user turn first, so an incident is recorded even if the answer
  // path fails afterwards.
  await prisma.chatbotMessage.create({
    data: {
      conversationId: conversation.id, sender: 'user', content: message, flagged, locale,
    },
  });

  // ── Support mode: the troubleshooting tree owns the turn ───────────────────
  // Checked before retrieval, because someone working through a checklist is
  // answering the last question, not asking a new one. "yes" retrieves nothing
  // useful and would look like a failed answer.
  const tree = await treeTurn(conversation, message, locale, role);
  if (tree) {
    await prisma.chatbotMessage.create({
      data: {
        conversationId: conversation.id,
        sender: 'bot',
        content: tree.reply,
        intent: tree.treeId,
        confidence: 1, // deterministic: a tree answer is not a retrieval guess
        sources: tree.sources,
        model: 'tree',
        latencyMs: Date.now() - started,
        locale,
        treeNode: tree.node,
        quickReplies: tree.quickReplies ?? null,
      },
    });
    await prisma.chatbotConversation.update({
      where: { id: conversation.id },
      data: {
        messageCount: { increment: 2 },
        lastMessageAt: new Date(),
        lastLocale: locale,
        treeState: tree.treeState,
        ...(tree.topic ? { topic: tree.topic } : {}),
        ...(tree.priority ? { priority: tree.priority } : {}),
      },
    });
    return {
      reply: tree.reply,
      escalate: Boolean(tree.escalate),
      escalateReason: tree.escalateReason ?? null,
      confidence: 1,
      sources: tree.sources,
      flagged,
      locale,
      quickReplies: tree.quickReplies ?? null,
      action: tree.action ?? null,
      // Shape per docs/11 §I1: { id, node, step, of }. The id and node matter to
      // the client for resuming a diagnostic after a reload — progress alone
      // renders the bar but cannot restore where the customer was.
      tree: tree.progress ? { id: tree.treeId, node: tree.node, ...tree.progress } : null,
    };
  }

  // ── Smalltalk ─────────────────────────────────────────────────────────────
  // After the tree turn on purpose: "ok" mid-checklist is an answer to the last
  // question, not a pleasantry. Before retrieval because "hi" matches nothing
  // and would otherwise land on "I don't have a confident answer for that".
  if (isSmalltalk(message)) {
    const reply = SMALLTALK_REPLY[role]?.[locale] || SMALLTALK_REPLY.consumer.en;
    const chips = SMALLTALK_CHIPS[role]?.[locale] || SMALLTALK_CHIPS.consumer.en;
    await prisma.chatbotMessage.create({
      data: {
        conversationId: conversation.id,
        sender: 'bot',
        content: reply,
        intent: 'smalltalk',
        confidence: 1, // canned, not a retrieval guess
        model: 'canned:smalltalk',
        latencyMs: Date.now() - started,
        locale,
        quickReplies: chips,
      },
    });
    await prisma.chatbotConversation.update({
      where: { id: conversation.id },
      data: { messageCount: { increment: 2 }, lastMessageAt: new Date(), lastLocale: locale },
    });
    return {
      reply,
      escalate: false,
      escalateReason: null,
      confidence: 1,
      sources: [],
      flagged,
      locale,
      quickReplies: chips,
      action: null,
      tree: null,
    };
  }

  // The T&C is the LEGAL source of truth, so a matching clause outranks the
  // operational corpus. Returns [] while the source is gated (default) and
  // filters out any clause the platform does not currently honour, so nothing
  // here can quote a disputed figure. See lib/chatbot/legal.js.
  const [clauses, retrieved] = await Promise.all([
    retrieveClauses(prisma, message, { locale, audience: role }),
    retrieve(message, { audience: role, locale }),
  ]);

  // An entry whose policy value is under dispute keeps its rank but cannot be
  // spoken. If the BEST match is blocked, the honest move is to decline and
  // offer a human — serving the second-best answer would answer a question the
  // customer did not ask.
  const topBlocked = clauses.length === 0 && retrieved[0]?.blocked === true;
  const knowledge = [
    // Clause text is prefixed so the model can tell the binding document from
    // the operational explanation, and cite accordingly.
    ...clauses.map((c) => ({
      key: `terms:${c.clauseNo}`,
      topic: 'terms',
      a: `[TERMS clause ${c.clauseNo}${c.heading ? ` — ${c.heading}` : ''}]\n${c.text}`,
      blocked: false,
      source: 'terms',
      score: c.score + 5, // the contract outranks the explanation of it
    })),
    ...retrieved.filter((k) => !k.blocked),
  ];

  // Retrieval strength is a usable confidence proxy here: no match means the
  // corpus does not cover the question, whatever the model might improvise.
  const confidence = topBlocked || knowledge.length === 0
    ? 0
    : Math.min(1, knowledge[0].score / 6);

  const priorUnresolved = await prisma.chatbotMessage.count({
    where: { conversationId: conversation.id, sender: 'bot', confidence: { lt: 0.4 } },
  });

  const verdict = shouldEscalate({ message, confidence, unresolvedTurns: priorUnresolved });

  let reply;
  let model = null;
  let tokensIn = 0;
  let tokensOut = 0;

  if (topBlocked) {
    // Deliberately before the model call: there is nothing to ground an answer
    // in, and inventing one is exactly the failure this guards against.
    reply = CANT_HELP[locale] || CANT_HELP.en;
    model = 'blocked:policy';
  } else if (verdict.escalate && verdict.reason === 'user_requested') {
    // Don't spend a model call to say "sure, connecting you".
    reply = locale === 'ms'
      ? 'Baik — saya akan hubungkan anda kepada pasukan sokongan kami sekarang.'
      : "Of course — I'll connect you to our support team now.";
  } else if (isChatbotReady() && knowledge.length > 0) {
    try {
      const history = await prisma.chatbotMessage.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: 'asc' },
        take: 20,
        select: { sender: true, content: true },
      });
      const userContext = await buildUserContext(user);
      const result = await ask({
        message: frameUserContent(message),
        history: history.slice(0, -1), // exclude the turn we just wrote
        knowledge,
        userContext,
        role,
        locale,
      });
      // A classifier refusal is not an error — hand to a human rather than
      // showing the customer nothing.
      reply = result.refused ? CANT_HELP[locale] || CANT_HELP.en : result.text;

      // A fabricated clause number looks authoritative and cannot be checked by
      // the customer, so an answer citing one is replaced by the clause text
      // itself rather than trusted.
      if (!result.refused && clauses.length > 0) {
        const citations = validateCitations(reply, clauses);
        if (!citations.ok) {
          console.warn('[chatbot] invalid citation(s) dropped:', citations.invalid.join(', '));
          reply = clauses[0].text;
          model = 'fallback:clause';
        }
      }
      model = model === 'fallback:clause' ? model : result.model;
      tokensIn = result.tokensIn;
      tokensOut = result.tokensOut;
    } catch (err) {
      console.error('[chatbot] provider call failed:', err?.message || err);
      // Degrade to the best-matching FAQ verbatim rather than failing.
      reply = knowledge[0].a;
      model = 'fallback:knowledge';
    }
  } else if (knowledge.length > 0) {
    reply = knowledge[0].a;
    model = 'fallback:knowledge';
  } else {
    reply = CANT_HELP[locale] || CANT_HELP.en;
  }

  reply = redactOutput(reply);

  await prisma.chatbotMessage.create({
    data: {
      conversationId: conversation.id,
      sender: 'bot',
      content: reply,
      intent: knowledge[0]?.topic ?? null,
      confidence,
      sources: knowledge.map((k) => k.key),
      model,
      tokensIn,
      tokensOut,
      latencyMs: Date.now() - started,
      locale,
    },
  });

  // Set the topic once, from the first turn that actually matched something.
  // Writing it on every turn let a later low-confidence question (no match)
  // null it out, which then miscategorised the support ticket on escalation.
  const firstTopic = knowledge[0]?.topic;
  await prisma.chatbotConversation.update({
    where: { id: conversation.id },
    data: {
      messageCount: { increment: 2 },
      lastMessageAt: new Date(),
      lastLocale: locale,
      ...(conversation.topic || !firstTopic ? {} : { topic: firstTopic }),
    },
  });

  return {
    reply,
    escalate: verdict.escalate,
    escalateReason: verdict.reason,
    confidence,
    sources: knowledge.map((k) => k.key),
    flagged,
    locale,
  };
}

/**
 * Run one turn of a troubleshooting tree, or decide there isn't one.
 *
 * Returns null when the turn is not a tree turn, so the caller falls through to
 * ordinary retrieval. Never throws — a tree problem degrades to normal Q&A
 * rather than breaking a support conversation.
 */
async function treeTurn(conversation, message, locale, role) {
  try {
    const state = conversation.treeState;

    // Asking for a human always wins, at any point in a checklist. Trapping
    // someone inside a questionnaire they have asked to leave is the single
    // most resented chatbot behaviour there is.
    if (wantsHuman(message)) {
      if (state) await prisma.chatbotConversation.update({ where: { id: conversation.id }, data: { treeState: null } });
      return null;
    }

    if (state?.treeId) {
      const active = getTree(state.treeId);
      if (!active) return null;
      const step = continueTree(active, state, message, locale);

      if (step.aborted) {
        await prisma.chatbotConversation.update({ where: { id: conversation.id }, data: { treeState: null } });
        return null;
      }
      if (!step.done) {
        return {
          reply: step.question,
          quickReplies: step.quickReplies,
          progress: step.progress,
          treeState: step.treeState,
          treeId: active.id,
          node: step.treeState.node,
          sources: [`tree:${active.id}`],
        };
      }

      // Terminal. Clear the tree either way — a finished checklist must not
      // capture the next question the customer asks.
      const base = {
        treeState: null, treeId: active.id, node: state.node, sources: [`tree:${active.id}`],
      };
      if (step.escalate) {
        return {
          ...base,
          reply: step.text || escalationLine(locale),
          escalate: true,
          escalateReason: step.unavailable ? 'policy_unavailable' : 'tree_exhausted',
          priority: step.priority,
          topic: step.category,
        };
      }
      // A leaf may hand off to another tree (login → OTP).
      const next = step.nextTree ? getTree(step.nextTree) : null;
      if (next) {
        const started = startTree(next, locale);
        return {
          reply: `${step.text}\n\n${started.question}`,
          quickReplies: started.quickReplies,
          progress: started.progress,
          treeState: started.treeState,
          treeId: next.id,
          node: started.treeState.node,
          sources: [`tree:${active.id}`, `tree:${next.id}`],
        };
      }
      return { ...base, reply: step.text, action: step.action };
    }

    // No tree running: does this message start one?
    const picked = selectTree(message, { role });
    if (!picked) return null;
    const started = startTree(picked, locale);
    return {
      reply: started.question,
      quickReplies: started.quickReplies,
      progress: started.progress,
      treeState: started.treeState,
      treeId: picked.id,
      node: started.treeState.node,
      topic: picked.group || picked.id,
      sources: [`tree:${picked.id}`],
    };
  } catch (err) {
    console.error('[chatbot] tree turn failed:', err?.message || err);
    return null;
  }
}

const ESCALATION_LINE = {
  en: "I've taken this as far as I can — let me get a person onto it.",
  ms: 'Saya sudah cuba sedaya upaya — biar saya hubungkan anda dengan pasukan kami.',
};
const escalationLine = (locale) => ESCALATION_LINE[locale] || ESCALATION_LINE.en;

/**
 * A two-sentence statement of the problem, for the top of the ticket.
 *
 * An agent should read one line, not forty turns. Falls back to the first user
 * message when the model is unavailable — a worse summary is fine, a failed
 * escalation is not.
 */
async function summariseForAgent(messages, locale) {
  const firstUser = messages.find((m) => m.sender === 'user')?.content || 'Chat escalation';
  if (!isChatbotReady() || messages.length < 2) return firstUser.slice(0, 300);

  const transcript = messages
    .map((m) => `${m.sender === 'user' ? 'Customer' : 'Assistant'}: ${m.content}`)
    .join('\n');

  try {
    const result = await ask({
      message: `Summarise this support conversation for the agent picking it up. Two sentences maximum: what the person needs, and what has already been tried. No preamble, no greeting.\n\n${transcript}`,
      history: [],
      knowledge: [],
      role: 'consumer',
      locale,
    });
    const text = (result.text || '').trim();
    return text ? text.slice(0, 500) : firstUser.slice(0, 300);
  } catch (err) {
    console.error('[chatbot] escalation summary failed:', err?.message || err);
    return firstUser.slice(0, 300);
  }
}

/**
 * Hand the conversation to a human by opening a support ticket carrying the
 * full transcript — the agent starts with context instead of asking again.
 */
export async function escalate(conversation, user, reason) {
  if (conversation.supportTicketId) {
    // Already escalated — link to the existing ticket rather than opening a
    // duplicate for the same conversation.
    return prisma.supportTicket.findUnique({ where: { id: conversation.supportTicketId } });
  }

  const messages = await prisma.chatbotMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });
  const transcript = messages
    .map((m) => `${m.sender === 'user' ? 'Customer' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  const firstUserMessage = messages.find((m) => m.sender === 'user')?.content || 'Chat escalation';
  const reference = `TKT-${Math.random().toString(36).slice(2, 8).toUpperCase()}${Date.now().toString(36).slice(-3).toUpperCase()}`;

  const summary = await summariseForAgent(messages, conversation.lastLocale || conversation.locale || 'en');
  const context = await collectEscalationContext(conversation, user);
  const priority = conversation.priority === 'urgent' ? 'urgent'
    : (reason === 'money_dispute' ? 'high' : conversation.priority || 'normal');

  const ticket = await prisma.supportTicket.create({
    data: {
      userId: user.id,
      category: mapTopicToCategory(conversation.topic),
      subject: firstUserMessage.slice(0, 140),
      // Summary first: an agent reads one line, then has the transcript and the
      // context underneath if they need it.
      message: [
        `Escalated from the assistant (${reason || 'requested'}).`,
        '',
        `SUMMARY: ${summary}`,
        '',
        context,
        '',
        '--- Transcript ---',
        transcript,
      ].join('\n').slice(0, 6000),
      reference,
      channel: 'chatbot',
      priority,
      tags: { intent: conversation.intent ?? null, tree: conversation.treeState?.treeId ?? null, locale: conversation.lastLocale ?? conversation.locale },
      chatbotConversationId: conversation.id,
      slaFirstResponseAt: new Date(Date.now() + (priority === 'urgent' ? 1 : 12) * 3600_000),
      slaResolutionAt: new Date(Date.now() + 72 * 3600_000),
    },
  });

  await prisma.chatbotConversation.update({
    where: { id: conversation.id },
    data: { status: 'escalated', escalatedAt: new Date(), supportTicketId: ticket.id },
  });

  return ticket;
}

/**
 * The structured facts an agent would otherwise have to ask for: the booking
 * this is probably about, the last payment, device and app version, and any
 * files the customer attached.
 *
 * Every lookup is scoped to the caller's own id, same rule as context.js.
 */
async function collectEscalationContext(conversation, user) {
  const lines = [];
  try {
    const isPartner = user.role === 'partner';
    const [booking, payment, attachments] = await Promise.all([
      prisma.booking.findFirst({
        where: isPartner ? { partnerId: user.id } : { consumerId: user.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, serviceType: true, status: true, date: true, price: true },
      }),
      prisma.payment.findFirst({
        where: { booking: isPartner ? { partnerId: user.id } : { consumerId: user.id } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, method: true, amount: true },
      }).catch(() => null),
      prisma.chatbotMessage.findMany({
        where: { conversationId: conversation.id, NOT: { attachments: { equals: null } } },
        select: { attachments: true },
        take: 10,
      }),
    ]);

    lines.push('--- Context ---');
    if (booking) lines.push(`Latest booking: ${booking.id} — ${booking.serviceType}, ${booking.status}, RM ${Number(booking.price || 0).toFixed(2)}`);
    if (payment) lines.push(`Latest payment: ${payment.id} — ${payment.status} via ${payment.method}`);
    const device = conversation.deviceInfo;
    if (device) {
      lines.push(`Device: ${[device.platform, device.model, device.os_version].filter(Boolean).join(' / ') || 'unknown'}`);
      if (device.app_version) lines.push(`App version: ${device.app_version}`);
    }
    const files = attachments.flatMap((m) => (Array.isArray(m.attachments) ? m.attachments : []));
    if (files.length) lines.push(`Attachments: ${files.map((f) => f.url || f.uploadId).filter(Boolean).join(', ')}`);
    if (conversation.treeState?.treeId) lines.push(`Troubleshooting: ${conversation.treeState.treeId} (stopped at "${conversation.treeState.node}")`);
  } catch (err) {
    // Context is an enhancement. A failure here must not block an escalation —
    // the person still needs their ticket.
    console.error('[chatbot] escalation context failed:', err?.message || err);
  }
  return lines.join('\n');
}

function mapTopicToCategory(topic) {
  switch (topic) {
    case 'refund': return 'refund';
    case 'damage': return 'damage';
    case 'payment': case 'commission': case 'earnings': return 'payment';
    case 'booking': return 'booking';
    default: return 'other';
  }
}
