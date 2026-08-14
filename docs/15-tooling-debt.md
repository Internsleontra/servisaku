# 15 — Tooling debt

Repository-level tooling gaps found during the partner website migration. Each
is a **separate** task: none was fixed in the phase that discovered it, because
fixing them touches shared configuration rather than the page under migration.

---

## 15.1 `src/apps/**` was not covered by the ESLint file globs

**Status: RESOLVED** · Found 2026-08-14 (shared foundation focus pass) ·
Fixed 2026-08-15 (`chore(tooling): cover partner app code in eslint`)

### The problem

`eslint.config.js` selects files with an explicit `files` array. Before the fix
it read:

```js
files: [
  "src/components/**/*.{js,mjs,cjs,jsx}",
  "src/pages/**/*.{js,mjs,cjs,jsx}",
  "src/Layout.jsx",
],
```

`src/apps/**` matched none of these, so the consumer and partner shells were
never linted — both layouts, both route tables, the navigation chrome, the
partner-only guard and the notification context.

### Why exit code 0 was misleading

Two different silent failures were in play, and the second is the dangerous one.

**Naming a skipped file explicitly** produces a warning, not an error:

```
src/apps/partner/PartnerSidebar.jsx
  0:0  warning  File ignored because no matching configuration was supplied
✖ 2 problems (0 errors, 2 warnings)
```

Exit code `0`. A gate that checks only the exit code passes while linting
nothing.

**Running the normal command over a directory said nothing at all.** Before the
fix, `eslint src/` reported **136 files, none of them under `src/apps/`, and
zero "file ignored" warnings** — the shell was absent from the output entirely.
There was no signal to notice.

That mattered because `no-undef` is the rule this project added specifically to
catch identifiers left behind by a refactor — the class of bug that survives a
clean build and ships a `ReferenceError` (see the comment in
`eslint.config.js`). A `ReferenceError` in a layout or route table takes the
whole app down, not one page, so the shell was the worst place to leave
unguarded.

### The fix

One glob added to the existing `files` array; every rule, plugin and setting
left as it was. The plugin *recommended* configs were deliberately **not**
adopted — that remains a separate task (see 15.2).

```js
"src/apps/**/*.{js,mjs,cjs,jsx}",
```

`src/apps/` currently contains only `.jsx`, but the brace list covers
`.js`/`.mjs`/`.cjs` too so a future non-JSX module there is caught on arrival
rather than silently skipped again.

### Now covered

All 10 files under `src/apps/`, with `no-undef` active on each:

```
src/apps/consumer/ConsumerLayout.jsx    src/apps/partner/PartnerNotifications.jsx
src/apps/consumer/index.jsx             src/apps/partner/PartnerOnly.jsx
src/apps/consumer/routes.jsx            src/apps/partner/PartnerSidebar.jsx
src/apps/partner/PartnerLayout.jsx      src/apps/partner/PartnerTopNav.jsx
src/apps/partner/index.jsx              src/apps/partner/routes.jsx
```

`eslint --print-config src/apps/partner/PartnerSidebar.jsx` now resolves
`no-undef` to `[2, { "typeof": false }]` — error severity, active.

### How it was verified

1. **Before:** `eslint src/` reported 136 files, 0 from `src/apps/`.
2. A temporary probe was added at `src/apps/__lint_probe.jsx` returning an
   identifier that does not exist. The normal lint command still exited **0** —
   the gap, demonstrated rather than assumed.
3. The glob was added.
4. **After, probe still present:** the normal command reported
   `'THIS_IDENTIFIER_DOES_NOT_EXIST' is not defined  no-undef` and exited **1**.
5. The probe was deleted.
6. **After, probe removed:** `eslint src/` reports **146 files** (+10, exactly
   the shell), **0 errors**, exit **0**. The 4 remaining warnings are
   pre-existing `unused-imports` notices unrelated to this change.
7. Existing consumer and partner source continued to lint clean throughout;
   both builds and the full 440-test suite passed after the change.

---

## 15.2 `no-undef` still does not reach 43 of 155 files under `src/`

**Status:** open · Found 2026-08-15 while verifying 15.1

Fixing 15.1 raised an obvious question — how much of `src/` is *actually*
protected? The answer is 112 of 155 files. Being listed in ESLint's output is
**not** the same as being checked: a file can be traversed, match no
rule-carrying config, and pass against an empty ruleset. Of the 27 `src/lib`
files ESLint reports, `--print-config` shows `no-undef` **absent** on every one.

| Area | Files | `no-undef` |
|---|---|---|
| `src/pages/` | 52 | active |
| `src/components/` (excl. `ui/`) | 50 | active |
| `src/apps/` | 10 | active — fixed in 15.1 |
| `src/lib/` | 31 | **not active** — in the config's `ignores` |
| `src/components/ui/` | 4 | **not active** — in the config's `ignores` |
| `src/hooks/` | 4 | **not active** — matches no glob |
| `src/api/` | 3 | **not active** — matches no glob |
| `src/main.jsx` | 1 | **not active** — only `src/Layout.jsx` is listed |

`src/lib/` and `src/components/ui/` are excluded deliberately (vendored shadcn
components and a large lib surface). `src/hooks/` and `src/api/` appear to be
oversights: `src/api/apiClient.js` is the client every page calls, and
`src/hooks/` holds shared hooks — both are exactly the kind of code an
undefined-identifier check should cover.

Nothing outside `src/` is covered by the normal command either: `server/**` and
`scripts/**` carry no rules under the repo config. The financial phases linted
them with a temporary `no-undef` config instead.

**This item is not a claim that the repository is fully linted — it is not.**

### Suggested next step

Add `src/hooks/**` and `src/api/**` to the `files` array and re-run the probe
procedure from 15.1 against each. Extending to `server/**` needs a second config
object with Node globals rather than browser ones.

---

## 15.3 Only ~9 lint rules are actually live

**Status:** open · Pre-existing, documented in `eslint.config.js`

The config object spreads `pluginJs.configs.recommended` and
`pluginReact.configs.flat.recommended`, but each of those sets a `rules` key and
the object's own `rules` key overwrites both — so **neither recommended set
contributes anything**. Only the rules listed explicitly are live.

Adopting them properly would enable roughly 60 rules at once and is its own
task, with its own fallout to triage. It was not attempted here.
