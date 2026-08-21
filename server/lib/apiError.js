// ApiError lives in its own module so that lib/errors.js (the localized message
// catalog) and lib/access.js (the authorization helpers, which need to raise
// localized errors) can both depend on it without depending on each other.
//
// It was previously defined in access.js; that re-exports it, so every existing
// `import { ApiError } from './access.js'` keeps working unchanged.
export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {string} message  customer-facing, already localized by the caller
   * @param {Array}  [details] optional stable machine-readable causes, e.g.
   *   [{ code: 'required', questionId: 'size', label: 'Saiz rumah' }]. Emitted
   *   only when present, so the `{ error }` shape existing clients rely on is
   *   unchanged — this is additive, not a new contract.
   */
  constructor(status, message, details) {
    super(message);
    this.status = status;
    if (details && details.length) this.details = details;
  }
}
