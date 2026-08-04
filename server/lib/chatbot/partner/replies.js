// ─────────────────────────────────────────────────────────────────────────────
// Communication assistant — drafts a partner sends to a customer.
//
// THREE RULES, all enforced in code rather than asked for in a prompt:
//
//   1. IT IS A DRAFT. Nothing here sends. The partner reads it, edits it if they
//      want, and sends it themselves. A message that goes out under someone's
//      name without them reading it is not an assistant, it is a liability.
//
//   2. IT FOLLOWS THE CUSTOMER'S LANGUAGE, not the partner's. That is the whole
//      point of the feature — an English-speaking partner messaging a
//      Malay-preferring customer is exactly the gap it closes.
//
//   3. IT CANNOT LEAK OFF-PLATFORM. Partner Terms 11.11 keeps customer
//      communication on the platform and 7.19 makes off-platform diversion a
//      material breach. A generator that helpfully produced a phone number or a
//      bank account would be the worst possible place for that to happen, so
//      every draft is scanned before it is returned — including drafts assembled
//      from the partner's own free text.
//
// Pure — no DB, no model. The templates are authored because they are short,
// finite and high-traffic, and because a generated apology is worse than a
// written one.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The situations a partner actually needs a message for.
 *
 * `slots` are the values the caller must supply; anything missing falls back to
 * a vaguer but still correct sentence rather than emitting "undefined".
 */
export const SITUATIONS = {
  on_the_way: {
    slots: ['minutes'],
    text: {
      en: ({ name, minutes }) => `Hi${name ? ` ${name}` : ''}, this is your ServisAku professional. I'm on my way and should be with you in about ${minutes ?? 15} minutes.`,
      ms: ({ name, minutes }) => `Salam${name ? ` ${name}` : ''}, saya profesional ServisAku anda. Saya dalam perjalanan dan akan tiba dalam lebih kurang ${minutes ?? 15} minit.`,
    },
  },
  running_late: {
    slots: ['minutes'],
    text: {
      en: ({ name, minutes }) => `Hi${name ? ` ${name}` : ''}, apologies — the previous job ran over and I'm about ${minutes ?? 20} minutes behind. I'll be with you as soon as I can.`,
      ms: ({ name, minutes }) => `Salam${name ? ` ${name}` : ''}, maaf — kerja sebelum ini mengambil masa lebih lama dan saya lewat lebih kurang ${minutes ?? 20} minit. Saya akan tiba secepat mungkin.`,
    },
  },
  arrived: {
    slots: [],
    text: {
      en: ({ name }) => `Hi${name ? ` ${name}` : ''}, I've arrived and I'm at the entrance. Let me know when it's convenient to come up.`,
      ms: ({ name }) => `Salam${name ? ` ${name}` : ''}, saya sudah tiba di pintu masuk. Beritahu saya bila sesuai untuk naik.`,
    },
  },
  cannot_access: {
    slots: [],
    text: {
      en: ({ name }) => `Hi${name ? ` ${name}` : ''}, I'm outside but I can't get access. Could you let me know how to get in, or let the guard know I'm expected?`,
      ms: ({ name }) => `Salam${name ? ` ${name}` : ''}, saya berada di luar tetapi tidak dapat masuk. Boleh beritahu saya cara masuk, atau maklumkan pengawal bahawa saya dijangka?`,
    },
  },
  additional_work: {
    slots: ['finding'],
    text: {
      en: ({ name, finding }) => `Hi${name ? ` ${name}` : ''}, I've found ${finding || 'something outside the booked scope'}. I've sent you a quote in the app — I'll only start once you've approved it.`,
      ms: ({ name, finding }) => `Salam${name ? ` ${name}` : ''}, saya menemui ${finding || 'sesuatu di luar skop tempahan'}. Saya telah hantar sebut harga dalam aplikasi — saya hanya akan mula selepas anda meluluskannya.`,
    },
  },
  completed: {
    slots: ['summary'],
    text: {
      en: ({ name, summary }) => `The work is complete. ${summary || 'Everything in the booked scope has been done and tested.'} Please have a look and let me know if anything needs attention. Thank you for choosing ServisAku.`,
      ms: ({ name, summary }) => `Kerja telah siap. ${summary || 'Semua dalam skop tempahan telah dilakukan dan diuji.'} Sila periksa dan beritahu saya jika ada yang perlu diperhatikan. Terima kasih kerana memilih ServisAku.`,
    },
  },
  needs_reschedule: {
    slots: ['reason'],
    text: {
      en: ({ name, reason }) => `Hi${name ? ` ${name}` : ''}, I'm very sorry — ${reason || 'something has come up'} and I won't be able to make today's booking. I've let ServisAku know so they can arrange a replacement or a new time for you.`,
      ms: ({ name, reason }) => `Salam${name ? ` ${name}` : ''}, saya benar-benar minta maaf — ${reason || 'ada sesuatu berlaku'} dan saya tidak dapat hadir untuk tempahan hari ini. Saya telah maklumkan ServisAku untuk aturkan pengganti atau masa baharu.`,
    },
  },
};

export const SITUATION_IDS = Object.keys(SITUATIONS);

// ─── The leakage guard ───────────────────────────────────────────────────────

/**
 * Patterns that would take the conversation off-platform.
 *
 * Phone numbers are matched loosely on purpose: "zero one two, three four five"
 * is not caught, but every ordinary way of writing a Malaysian mobile is, and
 * the cost of a false positive is a partner rewording a sentence.
 */
const LEAK_PATTERNS = [
  // Malaysian mobile / landline, with or without separators or country code
  { code: 'phone_number', re: /(?:\+?6?0)[\s-]?1\d[\s-]?\d{3,4}[\s-]?\d{4}/ },
  { code: 'phone_number', re: /\b\d{3}[\s-]\d{3,4}[\s-]\d{4}\b/ },
  { code: 'email', re: /[\w.+-]+@[\w-]+\.[\w.]{2,}/ },
  { code: 'social_handle', re: /\b(?:whatsapp|wechat|telegram|instagram|facebook|fb|ig)\b/i },
  { code: 'off_platform_contact', re: /\b(?:call|text|message|contact|reach)\s+me\s+(?:directly|on|at)\b/i },
  { code: 'off_platform_payment', re: /\b(?:pay|transfer|bank[\s-]?in|duitnow|tng|touch\s?'?n\s?go|cash)\s+(?:me|直接|directly|to\s+my)\b/i },
  { code: 'off_platform_payment', re: /\b(?:my|akaun)\s+(?:bank\s+)?account\s+(?:number|no)\b/i },
  { code: 'bank_account', re: /\b\d{10,16}\b/ },
  { code: 'off_platform_booking', re: /\bnext\s+time\s+(?:just\s+)?(?:call|contact|book)\s+me\b/i },
];

/**
 * Scan a draft for anything that would breach the platform-communication rules.
 *
 * @param {string} text
 * @returns {{ ok: boolean, violations: string[] }}
 */
export function scanForLeakage(text) {
  const s = String(text || '');
  const violations = [...new Set(LEAK_PATTERNS.filter((p) => p.re.test(s)).map((p) => p.code))];
  return { ok: violations.length === 0, violations };
}

const REFUSAL = {
  en: "I can't put that in a message — customer contact has to stay on the platform (Partner Terms 11.11), and taking a booking off-platform is a material breach. Everything you need is in the app's chat.",
  ms: 'Saya tidak boleh memasukkan itu dalam mesej — komunikasi pelanggan mesti kekal dalam platform (Terma Rakan Kongsi 11.11). Semua yang anda perlukan ada dalam sembang aplikasi.',
};

// ─── Generation ──────────────────────────────────────────────────────────────

/**
 * Draft a message.
 *
 * @param {string} situation
 * @param {object} [params]
 * @param {string} [params.customerLocale]  the CUSTOMER's language, not the partner's
 * @param {string} [params.name]
 * @param {number} [params.minutes]
 * @param {string} [params.finding]   free text from the partner — scanned
 * @param {string} [params.summary]   free text from the partner — scanned
 * @param {string} [params.reason]    free text from the partner — scanned
 * @param {string} [params.partnerLocale]  used only for a refusal message
 * @returns {{ ok, draft?, locale?, editable?, error? }}
 */
export function draftMessage(situation, params = {}) {
  const def = SITUATIONS[situation];
  if (!def) {
    return { ok: false, error: { code: 'unknown_situation', message: `"${situation}" is not a message I can draft` } };
  }

  const partnerLocale = params.partnerLocale === 'ms' ? 'ms' : 'en';

  // Free text the partner supplied is scanned BEFORE it is placed in a template
  // — the template is safe, what they typed is not.
  for (const field of ['finding', 'summary', 'reason', 'name']) {
    const value = params[field];
    if (value && !scanForLeakage(value).ok) {
      return {
        ok: false,
        error: {
          code: 'off_platform_content',
          message: REFUSAL[partnerLocale],
          violations: scanForLeakage(value).violations,
        },
      };
    }
  }

  const locale = params.customerLocale === 'ms' ? 'ms' : 'en';
  const draft = def.text[locale](params).replace(/\s+/g, ' ').trim();

  // Belt and braces: a template that ever grows a slot which slips through the
  // field scan is still caught here before the draft is returned.
  const final = scanForLeakage(draft);
  if (!final.ok) {
    return { ok: false, error: { code: 'off_platform_content', message: REFUSAL[partnerLocale], violations: final.violations } };
  }

  return {
    ok: true,
    draft,
    locale,
    // Always. The partner sends it, not us.
    editable: true,
    sent: false,
  };
}

/** The situations offered as quick replies, in the partner's own language. */
export function situationOptions(locale = 'en') {
  const labels = {
    on_the_way: { en: "I'm on my way", ms: 'Saya dalam perjalanan' },
    running_late: { en: "I'm running late", ms: 'Saya lewat' },
    arrived: { en: "I've arrived", ms: 'Saya sudah tiba' },
    cannot_access: { en: "I can't get in", ms: 'Saya tidak dapat masuk' },
    additional_work: { en: 'Extra work needed', ms: 'Kerja tambahan diperlukan' },
    completed: { en: 'Work is complete', ms: 'Kerja telah siap' },
    needs_reschedule: { en: "I can't make it", ms: 'Saya tidak dapat hadir' },
  };
  return SITUATION_IDS.map((id) => ({ value: id, label: labels[id][locale] || labels[id].en }));
}
