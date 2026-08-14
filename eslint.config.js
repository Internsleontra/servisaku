import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginUnusedImports from "eslint-plugin-unused-imports";

export default [
  // Global ignores: generated builds + the separate native app/mobile projects.
  { ignores: ["dist/**", "servisaku-app/**", "servisaku-mobile/**", "**/android/**", "**/ios/**"] },
  {
    files: [
      "src/components/**/*.{js,mjs,cjs,jsx}",
      "src/pages/**/*.{js,mjs,cjs,jsx}",
      // The consumer and partner shells: both layouts, both route tables, the
      // navigation chrome and the notification context. Previously unmatched,
      // which meant `eslint src/` walked straight past them — 136 files
      // reported, none of them here, exit code 0, and no "file ignored"
      // warning to hint at it (that warning only appears when a skipped file
      // is named explicitly). `no-undef` exists to catch identifiers left
      // behind by a refactor, so leaving the shell outside its reach defeated
      // the rule where a ReferenceError takes the whole app down rather than
      // one page. See docs/15-tooling-debt.md §15.1.
      "src/apps/**/*.{js,mjs,cjs,jsx}",
      "src/Layout.jsx",
    ],
    ignores: ["src/lib/**/*", "src/components/ui/**/*"],
    ...pluginJs.configs.recommended,
    ...pluginReact.configs.flat.recommended,
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    plugins: {
      react: pluginReact,
      "react-hooks": pluginReactHooks,
      "unused-imports": pluginUnusedImports,
    },
    rules: {
      // Catches identifiers that no longer exist — including inside JSX
      // expression containers, e.g. `fill={BRAND}` left behind after the
      // `const BRAND` declaration was deleted. That shipped a ReferenceError
      // past a clean build AND a clean lint.
      //
      // It is declared explicitly rather than inherited: the two spreads above
      // (`pluginJs.configs.recommended`, `pluginReact.configs.flat.recommended`)
      // each set a `rules` key, and this object's own `rules` key overwrites
      // both, so NEITHER recommended set contributes anything. Only the rules
      // listed here are live. Adopting the recommended sets properly is a
      // separate change — it would turn on ~60 rules at once.
      "no-undef": "error",
      "no-unused-vars": "off",
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react/no-unknown-property": [
        "error",
        { ignore: ["cmdk-input-wrapper", "toast-close"] },
      ],
      "react-hooks/rules-of-hooks": "error",
    },
  },
];
