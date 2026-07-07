// Pluggable SMS sender. Configure Twilio via env to send real texts; otherwise
// the code is logged to the console (and returned in dev responses) so the OTP
// flow is testable without a paid gateway.
//   TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM
export const isSmsReady = Boolean(process.env.TWILIO_SID && process.env.TWILIO_TOKEN && process.env.TWILIO_FROM);

export async function sendSms({ to, body }) {
  if (!isSmsReady) {
    console.log(`\n📱 [DEV SMS — no provider configured]\n  to: ${to}\n  ${body}\n`);
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
