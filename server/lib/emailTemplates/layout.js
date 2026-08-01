// Shared email shell and building blocks.
//
// Constraints these obey, because email clients are not browsers:
//   • table-based layout, inline CSS (Gmail strips <style> blocks)
//   • 600px max width, absolute URLs on every link
//   • a plain-text alternative is always produced alongside
//   • output stays well under Gmail's 102 KB clipping threshold
//
// Brand values are literals here rather than imported from src/lib/design/ —
// the server must not depend on front-end code.

const BRAND = '#F97316';
const INK = '#111111';
const MUTED = '#6B7280';
const SURFACE = '#FFFFFF';
const BG = '#F8F9FA';
const HAIRLINE = '#E5E7EB';

const APP_URL = (process.env.APP_WEB_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');

/**
 * Escape HTML in interpolated content.
 *
 * This matters now that user-supplied text reaches emails — a support ticket
 * subject, a dispute description, a damage claim item. The previous generic
 * builder interpolated unescaped, which was safe only while every string came
 * from the catalog.
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function button(href, label) {
  return `<tr><td style="padding:24px 0 4px;">
    <a href="${escapeHtml(href)}" style="display:inline-block;background:${BRAND};color:#fff;
       text-decoration:none;padding:13px 30px;border-radius:14px;font-weight:600;font-size:14px;">
      ${escapeHtml(label)}</a>
  </td></tr>`;
}

/** Label/value rows — booking details, references, dates. */
export function lineItems(rows) {
  const cells = rows.map(([label, value]) => `
    <tr>
      <td style="padding:7px 0;color:${MUTED};font-size:14px;">${escapeHtml(label)}</td>
      <td style="padding:7px 0;color:${INK};font-size:14px;font-weight:600;text-align:right;">${escapeHtml(value)}</td>
    </tr>`).join('');
  return `<tr><td style="padding:8px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="border-collapse:collapse;border-top:1px solid ${HAIRLINE};border-bottom:1px solid ${HAIRLINE};margin:8px 0;">
      ${cells}
    </table>
  </td></tr>`;
}

/** A single emphasised money figure. */
export function amountRow(label, amount) {
  return `<tr><td style="padding:14px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        <td style="color:${INK};font-size:15px;font-weight:700;">${escapeHtml(label)}</td>
        <td style="color:${BRAND};font-size:20px;font-weight:800;text-align:right;">${escapeHtml(amount)}</td>
      </tr>
    </table>
  </td></tr>`;
}

export function infoBox(text, tone = 'info') {
  const palette = tone === 'warning'
    ? { bg: '#FEF3C7', border: '#FDE68A', fg: '#92400E' }
    : { bg: '#EFF6FF', border: '#DBEAFE', fg: '#1E40AF' };
  return `<tr><td style="padding:12px 0;">
    <div style="background:${palette.bg};border:1px solid ${palette.border};border-radius:12px;
                padding:13px 15px;color:${palette.fg};font-size:13px;line-height:1.55;">
      ${escapeHtml(text)}
    </div>
  </td></tr>`;
}

/**
 * Wrap content in the branded shell.
 * `intro` and `title` are escaped; `body` is pre-built markup from the helpers
 * above, each of which escapes its own inputs.
 */
export function layout({ title, intro, body = '', locale = 'en' }) {
  const footer = locale === 'ms'
    ? 'Anda menerima e-mel ini kerana aktiviti pada akaun ServisAku anda.'
    : 'You received this because of activity on your ServisAku account.';
  const prefsLabel = locale === 'ms' ? 'Urus keutamaan pemberitahuan' : 'Manage notification preferences';

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${BG};font-family:Inter,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};border-collapse:collapse;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
             style="max-width:600px;width:100%;border-collapse:collapse;">
        <tr><td style="background:${SURFACE};border-radius:16px;padding:32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr><td style="font-size:20px;font-weight:800;color:${BRAND};padding-bottom:22px;">ServisAku</td></tr>
            <tr><td style="font-size:20px;font-weight:700;color:${INK};padding-bottom:10px;">${escapeHtml(title)}</td></tr>
            <tr><td style="font-size:15px;line-height:1.6;color:#444;">${escapeHtml(intro)}</td></tr>
            ${body}
          </table>
        </td></tr>
        <tr><td style="padding:18px 8px;text-align:center;color:#9aa0a6;font-size:12px;line-height:1.6;">
          ${escapeHtml(footer)}<br>
          <a href="${APP_URL}/notification-settings" style="color:#9aa0a6;">${escapeHtml(prefsLabel)}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
