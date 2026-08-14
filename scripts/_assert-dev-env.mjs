/**
 * Environment guard for the mutating financial scripts.
 *
 * MUST BE THE FIRST IMPORT in any script that writes financial rows.
 *
 * Why a separate module rather than a check inside main():
 * importing `@prisma/client` (directly, or transitively via
 * server/lib/wallet/index.js -> server/db.js) loads `.env` into `process.env`.
 * The repo's .env contains `NODE_ENV=development`, so by the time a function
 * body runs, NODE_ENV has been set from a FILE ON DISK rather than by the
 * operator. A guard evaluated at that point cannot tell the two apart, and on
 * any machine carrying a stray .env — including production — it would pass.
 *
 * ES modules evaluate their imports in source order before the importing
 * module's own body, so importing this first captures NODE_ENV as the operator
 * actually set it, before dotenv has a chance to fill it in.
 *
 * Contract: NODE_ENV must be exactly "development" or "test". Everything else
 * refuses — unset, empty string, "production", "staging", "preview", anything.
 */
const env = process.env.NODE_ENV;

if (env !== 'development' && env !== 'test') {
  const shown = env === undefined ? '(unset)' : JSON.stringify(env);
  console.error(
    `\nRefusing to run: NODE_ENV=${shown}.\n\n` +
    `This script mutates financial rows and runs only with NODE_ENV set\n` +
    `explicitly to "development" or "test". An unset value is refused on\n` +
    `purpose: .env is loaded by Prisma and would otherwise supply one for you.\n\n` +
    `  NODE_ENV=development node <script>            # dry run\n` +
    `  NODE_ENV=development node <script> --apply    # write\n`,
  );
  process.exit(1);
}

/** The validated value, for callers that want to log it. */
export const NODE_ENV = env;
