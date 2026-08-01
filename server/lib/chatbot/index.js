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
import {
  sanitizeInput, frameUserContent, redactOutput, looksLikeInjection, shouldEscalate,
} from './guardrails.js';

export { publicFaqs, retrieve } from './knowledge.js';
export { isChatbotReady, setChatbotProvider } from './provider.js';

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
 * Handle one user turn.
 *
 * @param {object} conversation  a ChatbotConversation row
 * @param {string} rawMessage
 * @param {object|null} user     the authenticated user, or null
 * @returns {Promise<{ reply, escalate, escalateReason, confidence, sources, flagged }>}
 */
export async function handleMessage(conversation, rawMessage, user) {
  const started = Date.now();
  const locale = conversation.locale || 'en';
  const role = conversation.role || 'consumer';

  const message = sanitizeInput(rawMessage);
  const flagged = looksLikeInjection(message);

  // Persist the user turn first, so an incident is recorded even if the answer
  // path fails afterwards.
  await prisma.chatbotMessage.create({
    data: { conversationId: conversation.id, sender: 'user', content: message, flagged },
  });

  const knowledge = await retrieve(message, { audience: role });
  // Retrieval strength is a usable confidence proxy here: no match means the
  // corpus does not cover the question, whatever the model might improvise.
  const confidence = knowledge.length === 0 ? 0 : Math.min(1, knowledge[0].score / 6);

  const priorUnresolved = await prisma.chatbotMessage.count({
    where: { conversationId: conversation.id, sender: 'bot', confidence: { lt: 0.4 } },
  });

  const verdict = shouldEscalate({ message, confidence, unresolvedTurns: priorUnresolved });

  let reply;
  let model = null;
  let tokensIn = 0;
  let tokensOut = 0;

  if (verdict.escalate && verdict.reason === 'user_requested') {
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
      model = result.model;
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
  };
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

  const ticket = await prisma.supportTicket.create({
    data: {
      userId: user.id,
      category: mapTopicToCategory(conversation.topic),
      subject: firstUserMessage.slice(0, 140),
      message: `Escalated from the assistant (${reason || 'requested'}).\n\n--- Transcript ---\n${transcript}`.slice(0, 4000),
      reference,
      channel: 'chatbot',
      priority: reason === 'money_dispute' ? 'high' : 'normal',
      chatbotConversationId: conversation.id,
      slaFirstResponseAt: new Date(Date.now() + 12 * 3600_000),
      slaResolutionAt: new Date(Date.now() + 72 * 3600_000),
    },
  });

  await prisma.chatbotConversation.update({
    where: { id: conversation.id },
    data: { status: 'escalated', escalatedAt: new Date(), supportTicketId: ticket.id },
  });

  return ticket;
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
