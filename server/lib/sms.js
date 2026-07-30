// Pluggable SMS sender. Configure Twilio via env to send real texts; otherwise
// the code is logged to the console (and returned in dev responses) so the OTP
// flow is testable without a paid gateway.
//   TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM
//
// SMS_DEV_MODE=true forces the console/dev path even when Twilio *is* configured.
// That matters because a Twilio trial can only text pre-verified numbers, and
// Malaysian carriers reject international long codes outright — so a real send
// to a +60 number fails and takes the whole OTP request down with it. Demo mode
// keeps the full OTP machinery (hashed codes, TTL, cooldown, lockout) and simply
// skips the carrier.
//
// Deliberately inert when NODE_ENV=production: a live deployment must never be
// able to hand out verification codes in an API response.
const demoMode = process.env.SMS_DEV_MODE === 'true' && process.env.NODE_ENV !== 'production';

export const isSmsReady = !demoMode
  && Boolean(process.env.TWILIO_SID && process.env.TWILIO_TOKEN && process.env.TWILIO_FROM);

export async function sendSms({ to, body }) {
  if (!isSmsReady) {
    const why = demoMode ? 'SMS_DEV_MODE=true' : 'no provider configured';
    console.log(`\n📱 [DEV SMS — ${why}]\n  to: ${to}\n  ${body}\n`);
    return { delivered: false };
  }
  const sid = process.env.TWILIO_SID;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_TOKEN}`).toString('base64');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM, Body: body }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`SMS send failed: ${t.slice(0, 200)}`);
  }
  return { delivered: true };
}
