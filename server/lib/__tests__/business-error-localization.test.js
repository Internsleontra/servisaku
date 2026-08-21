// Business-rule error localization.
//
// Every assertion below checks the ACTUAL wording in both languages. A test
// that only asserts "an error came back" passes just as happily against an
// English string served under ?locale=ms, which is the whole bug class this
// file exists to catch.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  localizedError, localizedMessage, refundPolicyReason,
  ERROR_CODES, REFUND_POLICY_CODES, ERROR_MESSAGES,
} from '../errors.js';
import { POLICIES } from '../refunds/policy.js';

/* code → [args, English, Malay]. Kept explicit rather than generated: the point
   is to pin the wording, and a generated table would only re-assert itself. */
const CASES = [
  ['booking_not_found', [], 'Booking not found', 'Tempahan tidak dijumpai'],
  ['partner_unavailable', [], 'Selected partner is not available', 'Rakan kongsi yang dipilih tidak tersedia'],
  ['booking_already_paid', [], 'This booking is already paid', 'Tempahan ini telah pun dibayar'],
  ['refund_own_bookings_only', [], 'You can only request refunds for your own bookings',
    'Anda hanya boleh meminta bayaran balik untuk tempahan anda sendiri'],
  ['refund_already_exists', [], 'A refund request already exists for this booking',
    'Permintaan bayaran balik untuk tempahan ini telah pun wujud'],
  ['dispute_too_early', [], 'A dispute can only be raised once the service has started or finished',
    'Pertikaian hanya boleh dibuat setelah perkhidmatan bermula atau selesai'],
  ['dispute_already_open', [], 'An open dispute already exists for this booking',
    'Pertikaian yang masih terbuka telah pun wujud untuk tempahan ini'],
  ['claim_before_completion', [], 'A damage claim can only be filed after the job is completed',
    'Tuntutan kerosakan hanya boleh difailkan setelah kerja selesai'],
  ['claim_already_decided', [], 'This claim has already been decided', 'Tuntutan ini telah pun diputuskan'],
  ['review_completed_only', [], 'You can only review completed bookings',
    'Anda hanya boleh mengulas tempahan yang telah selesai'],
  ['review_already_exists', [], 'This booking has already been reviewed', 'Tempahan ini telah pun diulas'],
  ['ticket_not_found', [], 'Ticket not found', 'Tiket tidak dijumpai'],
  ['invoice_not_found', [], 'Invoice not found', 'Invois tidak dijumpai'],
  ['coupon_expired', [], 'Coupon expired', 'Kupon telah tamat tempoh'],
  // Access guards. Both languages stay vague on purpose — a customer who
  // reaches someone else's booking must not learn whether it exists.
  ['forbidden', [], 'You do not have access to this', 'Anda tiada akses kepada ini'],
  ['not_found', [], 'Not found', 'Tidak dijumpai'],
  ['no_permitted_fields', [], 'No permitted fields to update',
    'Tiada medan yang dibenarkan untuk dikemas kini'],
  ['ticket_rate_owner_only', [], 'Only the ticket owner can rate it',
    'Hanya pemilik tiket boleh memberi penilaian'],
  ['ticket_already_rated', [], 'You have already rated this ticket',
    'Anda telah pun menilai tiket ini'],
  ['ticket_rate_after_resolved', [], 'Rate the ticket once it has been resolved',
    'Nilai tiket setelah ia diselesaikan'],
  ['callback_window_order', [], 'The end of the window must be after its start',
    'Waktu tamat mestilah selepas waktu mula'],
  ['callback_window_past', [], 'Pick a window in the future',
    'Sila pilih waktu pada masa hadapan'],
];

/* Interpolated codes, checked separately so placement is asserted, not just presence. */
const INTERPOLATED = [
  ['cannot_confirm_status', ['pending'], 'Cannot confirm a booking that is "pending"',
    'Tempahan berstatus "pending" tidak boleh disahkan'],
  ['refund_cannot_cancel', ['approved'], 'A approved refund cannot be cancelled',
    'Bayaran balik berstatus approved tidak boleh dibatalkan'],
  ['ticket_limit_reached', [3], 'You already have 3 open tickets — please continue in one of those',
    'Anda sudah mempunyai 3 tiket terbuka — sila teruskan dalam salah satu daripadanya'],
  ['coupon_min_order', [200], 'Coupon requires a minimum order of RM200',
    'Kupon memerlukan pesanan minimum RM200'],
  ['unknown_service', ['x-1'], 'Unknown service: x-1', 'Perkhidmatan tidak dikenali: x-1'],
  ['invalid_status_change', ['pending', 'completed'],
    'Cannot change status from "pending" to "completed"',
    'Status tidak boleh ditukar daripada "pending" kepada "completed"'],
  ['status_not_allowed', ['completed'], 'You are not allowed to set status "completed"',
    'Anda tidak dibenarkan menetapkan status "completed"'],
  ['callback_window_too_far', [30], 'Callbacks can be scheduled up to 30 days ahead',
    'Panggilan balik boleh dijadualkan sehingga 30 hari lebih awal'],
  ['ticket_reopen_limit', [14],
    'This ticket can no longer be reopened (limit 14 days and 3 reopens) — please raise a new one',
    'Tiket ini tidak boleh dibuka semula (had 14 hari dan 3 kali) — sila buka tiket baharu'],
  ['not_dynamic_service', ['aircond-service'],
    'Service "aircond-service" is not a dynamic-engine service',
    'Perkhidmatan "aircond-service" tidak menggunakan enjin harga dinamik'],
  ['unknown_property_size', ['4br', 'house-cleaning'],
    'Unknown property size "4br" for house-cleaning',
    'Saiz hartanah "4br" tidak dikenali untuk house-cleaning'],
  ['unknown_package', ['deluxe', 'house-cleaning'],
    'Unknown package "deluxe" for service "house-cleaning"',
    'Pakej "deluxe" tidak dikenali untuk perkhidmatan "house-cleaning"'],
  ['unknown_addon', ['fridge', 'house-cleaning'],
    'Unknown addon "fridge" for service "house-cleaning"',
    'Perkhidmatan tambahan "fridge" tidak dikenali untuk "house-cleaning"'],
  // The gateway's own words survive verbatim after the colon; only the frame
  // around them is ours.
  ['payment_gateway_error', ['card declined'], 'Gateway error: card declined',
    'Ralat pintu pembayaran: card declined'],
];

describe('exact wording in both languages', () => {
  for (const [code, args, en, ms] of CASES) {
    test(`${code}`, () => {
      assert.equal(localizedMessage(code, 'en', ...args), en);
      assert.equal(localizedMessage(code, 'ms', ...args), ms);
      assert.notEqual(ms, en, 'Malay is identical to English');
    });
  }
});

describe('interpolation lands where intended', () => {
  for (const [code, args, en, ms] of INTERPOLATED) {
    test(`${code}`, () => {
      assert.equal(localizedMessage(code, 'en', ...args), en);
      assert.equal(localizedMessage(code, 'ms', ...args), ms);
      for (const a of args) {
        assert.ok(String(localizedMessage(code, 'ms', ...args)).includes(String(a)),
          `${a} missing from the Malay message`);
      }
    });
  }

  test('a stored enum value is passed through untranslated', () => {
    // "pending" is the stored booking status — the sentence is localized, the
    // value is not, or a client could no longer match it.
    assert.ok(localizedMessage('cannot_confirm_status', 'ms', 'pending').includes('"pending"'));
    assert.ok(localizedMessage('refund_cannot_cancel', 'ms', 'approved').includes('approved'));
  });
});

describe('every catalog entry is complete and genuinely bilingual', () => {
  test('both languages defined for every code', () => {
    const broken = ERROR_CODES.filter((c) => !ERROR_MESSAGES[c].en || !ERROR_MESSAGES[c].ms);
    assert.deepEqual(broken, []);
  });

  test('no code renders identically in both languages', () => {
    const probe = ['x', 'y'];
    const same = ERROR_CODES.filter((c) =>
      localizedMessage(c, 'en', ...probe) === localizedMessage(c, 'ms', ...probe));
    assert.deepEqual(same, [], 'these are untranslated');
  });

  test('no message renders undefined, null or a broken placeholder', () => {
    const probe = ['x', 'y'];
    const broken = [];
    for (const c of ERROR_CODES) {
      for (const locale of ['en', 'ms']) {
        const m = localizedMessage(c, locale, ...probe);
        if (!m || !String(m).trim()) broken.push(`${locale}:${c} empty`);
        if (/undefined|\[object |\bNaN\b/.test(String(m))) broken.push(`${locale}:${c} → ${m}`);
      }
    }
    assert.deepEqual(broken, []);
  });
});

describe('localizedError preserves the contract', () => {
  test('HTTP status is untouched by language', () => {
    for (const locale of ['en', 'ms']) {
      assert.equal(localizedError(404, 'booking_not_found', locale).status, 404);
      assert.equal(localizedError(409, 'dispute_already_open', locale).status, 409);
      assert.equal(localizedError(403, 'review_own_bookings_only', locale).status, 403);
    }
  });

  test('the stable code travels in details, identically in both languages', () => {
    const en = localizedError(409, 'claim_already_decided', 'en');
    const ms = localizedError(409, 'claim_already_decided', 'ms');
    assert.equal(en.details[0].code, 'claim_already_decided');
    assert.equal(ms.details[0].code, 'claim_already_decided');
    assert.notEqual(ms.message, en.message);
  });

  test('an unknown code still produces a message rather than a blank', () => {
    const e = localizedError(400, 'no_such_code', 'ms');
    assert.equal(e.message, 'no_such_code');
    assert.equal(e.status, 400);
  });
});

describe('locale fallback', () => {
  test('missing or unknown locale yields English', () => {
    for (const locale of [undefined, null, '', 'zz', 'MS', 'id']) {
      assert.equal(localizedMessage('booking_not_found', locale), 'Booking not found');
    }
  });
});

describe('refund policy explanations', () => {
  test('every policy the engine can return has a translation', () => {
    const engine = Object.values(POLICIES);
    const missing = engine.filter((p) => !REFUND_POLICY_CODES.includes(p));
    assert.deepEqual(missing, [], 'policies the engine returns but we cannot explain in Malay');
  });

  test('exact wording, both languages', () => {
    assert.equal(refundPolicyReason('not_eligible', 'en'),
      'Not eligible for an automatic refund at this stage — please raise a dispute');
    assert.equal(refundPolicyReason('not_eligible', 'ms'),
      'Tidak layak untuk bayaran balik automatik pada peringkat ini — sila buat pertikaian');
    assert.equal(refundPolicyReason('cancel_gt_48h', 'ms'),
      'Bayaran balik penuh — notis lebih daripada 48 jam');
  });

  test('percentages and notice periods survive translation', () => {
    // A mistranslated number here is a commercial commitment, not a typo.
    assert.ok(refundPolicyReason('cancel_4_to_48h', 'ms').includes('75%'));
    assert.ok(refundPolicyReason('cancel_4_to_48h', 'ms').includes('48'));
    assert.ok(refundPolicyReason('cancel_lt_4h', 'ms').includes('50%'));
    assert.ok(refundPolicyReason('cancel_lt_4h', 'ms').includes('4'));
  });

  test('an unmapped policy falls back to the engine prose, not to blank', () => {
    assert.equal(refundPolicyReason('brand_new_policy', 'ms', 'Engine prose'), 'Engine prose');
  });

  test('no policy renders identically in both languages', () => {
    const same = REFUND_POLICY_CODES.filter((p) => refundPolicyReason(p, 'en') === refundPolicyReason(p, 'ms'));
    assert.deepEqual(same, []);
  });
});
