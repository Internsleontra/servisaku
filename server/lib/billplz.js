// Back-compat shim. The Billplz client moved to ./payments/billplz.js when the
// provider registry was introduced (see ./payments/index.js). Existing importers
// keep working; new code should import from './payments/index.js' instead.
export * from './payments/billplz.js';
