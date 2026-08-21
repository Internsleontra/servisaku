// zod request validation middleware.
// Parsed/coerced data replaces req.body so handlers only ever see validated input.
import { localeOf } from '../lib/locale.js';

export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      // Only the headline is localized. `details` keeps its existing shape —
      // an array of "path: zod message" strings — because clients read it as a
      // field map, and zod's own text is English library output aimed at
      // developers, not a sentence a customer is meant to be shown.
      return res.status(400).json({
        error: localeOf(req) === 'ms'
          ? 'Maklumat yang dihantar tidak lengkap atau tidak sah'
          : 'Validation failed',
        details: result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`),
      });
    }
    req.body = result.data;
    next();
  };
}
