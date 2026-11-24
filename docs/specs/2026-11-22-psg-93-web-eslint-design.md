# PSG-93 web/ lint script, eslint config and devDependencies: design

Status: draft for review. Branch `psg-93`. Mirrors PSG-48 (commit 635bd01, e2e/). Plan:
`docs/plans/2026-11-22-psg-93-web-eslint.md`.

## 1. Goal

`web/` (SvelteKit, Svelte 5 runes) has no `lint` script and no eslint config. The style rules
in the global CLAUDE.md (explicit return types, braces, no unused vars, `prefer-const`,
`no-console`) are unchecked for the 41 `.svelte` and 58 `.ts` files under `web/src`
(about 11 500 lines). Done when:

- `web/package.json` has `lint`, with eslint devDependencies pinned exact.
- The config covers `.ts` and `.svelte`.
- Existing violations are fixed or explicitly ratcheted.
- Lint runs in the same gates as root lint.

## 2. Findings

### 2.1 What "the gate" is

| Gate | Today | Covers web? |
|---|---|---|
| CI `checks` job (`.github/workflows/ci.yml`) | `npm ci`, `typecheck`, `lint`, `lint:deps`, `test`, `build` at repo root | No. Root `lint` is `eslint "src/**/*.ts" "scripts/**/*.ts"`. |
| CI `e2e` job | `npm ci` in root, `web/`, `e2e/`; typechecks e2e only | `web/` deps are installed here, but only to build. No lint. |
| husky `pre-commit` | `npx lint-staged` | Partly, wrongly (see below). |
| husky `pre-push` | `typecheck`, `lint:deps` (root) | No. |
| `.lintstagedrc` | `*.ts` -> `prettier --write`, `eslint --max-warnings 0` | Matches staged `web/**/*.ts` and runs them against the ROOT eslint config (node globals, sonarjs only for src/scripts). `.svelte` is not matched at all. |

Consequences:

- Web `.ts` files already get linted at commit time, but with the wrong config. Once
  `web/eslint.config.mjs` exists it is not picked up automatically: ESLint 9 resolves the
  config from the cwd (repo root) when lint-staged calls `eslint`. The gate must be changed
  or `web/` files will keep using the root config.
- PSG-48 added `e2e/` lint script and config but wired nothing. CI does not lint e2e and
  `e2e/*.ts` staged files also fall under the root config. This is a gap in PSG-48, not in
  scope here. It should become its own ticket (section 7).

### 2.2 Packaging

- Not an npm workspace. Root has no `workspaces`; `web/` and `e2e/` each have their own
  `package.json` and `package-lock.json`. New devDependencies mean `npm install` inside
  `web/` and a lockfile diff there. Root lockfile is untouched.
- CI `e2e` job already runs `npm ci` in `web/` (and caches `web/package-lock.json`). The
  `checks` job does not, and its `setup-node` cache only keys on the root lockfile.
- TS 6: eslint and typescript-eslint need no `@types/*` package and do not change the
  tsconfig `types` array. `typescript-eslint@8.70.0` peer range is `typescript >=4.8.4 <6.1.0`,
  web has `typescript@6.0.3`. OK. Recommended config is not type-aware, so no `parserOptions.project`,
  no dependency on `svelte-kit sync` having run, and lint is fast.
- Versions matching root and e2e exactly (so the three packages stay aligned):
  `eslint 9.17.0`, `@eslint/js 9.17.0`, `typescript-eslint 8.70.0`, `globals 15.13.0`.
  New for web: `eslint-plugin-svelte 3.24.1` (peers: eslint ^9, svelte ^5, both satisfied) and
  `svelte-eslint-parser 1.11.0` (peer svelte ^5). The parser is a transitive dep of the
  plugin but the config imports it directly, so it is pinned as a direct devDependency to
  avoid a phantom dependency.
- Prettier is not set up in web (root `format` covers `src/**/*.ts` only). Not added here.
  No `eslint-config-prettier` is needed.

## 3. Dry run

Throwaway config (removed after) = e2e config shape plus `eslint-plugin-svelte`
`flat/recommended`, the svelte parser with `typescript-eslint` parser for `<script lang="ts">`,
`globals.browser + node`, and the three e2e rules (`no-console`, `prefer-const`,
`explicit-function-return-type` with `allowTypedFunctionExpressions`). Run with
`eslint .` after temporarily installing the packages with `--no-save`.

First pass, 226 violations in 42 files:

| Rule | Count | Verdict |
|---|---|---|
| `prefer-const` (core) | 125 | False positive. Svelte 5 `let { a, b } = $props()` is never reassigned. Fix with config, see D2. |
| `@typescript-eslint/no-unused-vars` | 4 | `{#each Array(n) as _}` index placeholders. Fix with config, see D3. |
| `@typescript-eslint/explicit-function-return-type` | 50 | Real. Inline handlers and helpers in `.svelte`. Fix. |
| `svelte/no-navigation-without-resolve` | 37 | Rule wants `resolve()` from `$app/paths` on every internal `href`. App has no `base` path. Ratchet off, see D4. |
| `svelte/prefer-svelte-reactivity` | 6 | `new Map` and `new URLSearchParams` used as local transient values, never read reactively. False positive. Ratchet off, see D5. |
| `svelte/prefer-writable-derived` | 2 | Real. `$state` plus seeding `$effect` in `AskCard.svelte` and `sales/new/+page.svelte`. Fix. |
| `svelte/no-unused-svelte-ignore` | 6 | Same two spots (3 reports each). The `svelte-ignore state_referenced_locally` comments sit on the `$state` seeds that D6 removes. Disappears with the fix. |

Second pass with D2 and D3 applied: 101 violations in 26 files (`.ts` and `.svelte`), plus 2
in `scripts/generate-icons.mjs` when linting `.` (`.mjs` is picked up by default). Breakdown:
50 return types, 37 navigation, 6 reactivity, 2 writable-derived, 6 svelte-ignore.

After the decisions below, real code changes remain for 52 + the 2 mjs findings (check what
they are during implementation; if they are `no-undef` on `process` the `globals.node` entry
covers it, and if still present they are fixed in place).

## 4. Decisions

- D1 Config shape. `web/eslint.config.mjs`, flat config, same style as `e2e/eslint.config.mjs`
  (4-space indent, same three rules, same ignore of nothing but build output). Adds the
  svelte plugin. Reuses root's "recommended + three rules" so web and e2e behave alike.
  No `sonarjs` (root applies it only to `src/**` and `scripts/**` backend code).
- D2 `prefer-const` in `.svelte`: turn the core rule off and turn on `svelte/prefer-const`
  for `**/*.svelte` and `**/*.svelte.ts`. It is the rune-aware version and understands
  `$props` / `$derived`. Must come last in the config array, else the global rule block
  re-enables the core rule (verified in the dry run).
- D3 `no-unused-vars`: `varsIgnorePattern: '^_$'`, `argsIgnorePattern: '^_'`. Only `_` is
  allowed as an intentionally unused name. This is a deviation from "no single-letter
  names" but is the existing placeholder convention in 3 templates and the only way to
  iterate `{#each Array(n)}` without an index var. Alternative: rename to `_index` and
  use `argsIgnorePattern: '^_'` only. Open question Q1.
- D4 `svelte/no-navigation-without-resolve`: off. The rule protects apps deployed under a
  `kit.paths.base`; this one deploys at the Cloudflare root and `svelte.config.js` sets no
  base. Fixing means touching 37 sites and adding `resolve` imports with zero behaviour
  gain (about 80 lines). Pushback on blindly satisfying the recommended preset. Turn
  back on if a base path is ever introduced. Open question Q2.
- D5 `svelte/prefer-svelte-reactivity`: off. All six hits are non-reactive scratch values
  (`new Map` grouped in a loop, `new URLSearchParams(page.url.searchParams)` to build an
  href). `SvelteMap` / `SvelteURLSearchParams` would add reactivity machinery for nothing.
  Alternative is six `eslint-disable-next-line` lines. Off is simpler; disable-lines are
  more precise for future real misuse. Open question Q3.
- D6 Fix for real: 50 return types (add `: void` / explicit types; mechanical) and 2
  `$state` + `$effect` seeds converted to writable `$derived` (Svelte 5.56 supports it).
  These two have a behaviour risk (local edits to the derived value must still override
  until `data` changes). Verify with the existing web tests and by running the sales
  flows manually; e2e covers `/sales/new`.
- D7 Ratchet policy: "ratcheted" here means the rule is `off` in the config with a one-line
  reason comment, never a blanket `warn` (the lint script uses `--max-warnings 0`, so warn
  would fail the gate). No violation baseline file.
- D8 Script: `"lint": "eslint . --max-warnings 0"` in `web/package.json`. Differs from e2e
  (`"**/*.ts"`) because `.svelte` must be included and the config's `ignores` excludes
  `.svelte-kit`, `build`, `.wrangler`, `node_modules`. Also add `"lint:fix": "eslint . --fix"`? No.
  Root has it, e2e does not; keep to the ticket (YAGNI).
- D9 Gate wiring:
  1. CI `checks` job: add `npm ci` and `npm run lint` with `working-directory: web`, and add
     `web/package-lock.json` to `cache-dependency-path`. Cost: one extra install (web deps
     include wrangler/workerd, roughly 30 to 60 s cold, cached warm). Alternative: a new
     parallel `lint-web` job, faster wall clock but more YAML. Recommend adding to `checks`
     (same gate as root lint, ticket wording).
  2. lint-staged: add `web/.lintstagedrc` with `"*.{ts,svelte}": "eslint --max-warnings 0"`.
     lint-staged 15 picks the nearest config file per staged file and runs the commands
     with that directory as cwd, so web files then use `web/eslint.config.mjs`. Root
     `.lintstagedrc` stays unchanged. Verify with a dry run (`lint-staged --debug`) because
     if lint-staged instead applies both configs, web `.ts` would be linted twice against
     two configs (root one would fail on `.svelte` imports?). Fallback: add
     `"!(web)/**/*.ts"`-style negation in the root config and a `web/**` entry that does
     `npm --prefix web run lint --` with filenames. Prettier is not run on web files (never
     was; root `prettier --write` on staged web `.ts` would be dropped by the move, a small
     behaviour change, see Q4).
  3. husky `pre-push`: no change. Lint-staged covers commits and CI is the hard gate.
- D10 Dependency pinning: install with `--save-exact`, then verify `package.json` has no
  `^` or `~` (per global rule).

## 5. Size estimate

| Part | Hand-written lines changed |
|---|---|
| `web/eslint.config.mjs` | about 45 new |
| `web/package.json` (script, 6 devDeps) | about 8 |
| `web/.lintstagedrc` | 3 new |
| `.github/workflows/ci.yml` | about 8 |
| 50 return types (`: void` etc., some multi-line reformat) | about 60 to 90 |
| 2 writable `$derived` conversions | about 20 |
| `scripts/generate-icons.mjs` and misc | about 5 |
| Docs (tech-debt note if applicable) | about 10 |
| Subtotal hand-written | about 160 to 190 |
| `web/package-lock.json` (generated) | about 1 500 to 2 000 (PSG-48 e2e lockfile: +1 482) |

Hand-written is far under the 800-line cap. The lockfile alone exceeds it, but it is
generated output, same as PSG-48 where the PR was 1 517 insertions. Assumption: the cap
excludes lockfiles. If the coordinator counts lockfiles, split into two tickets: A)
tooling and config with deps and lockfile only, no gate wiring (does not satisfy done
criteria on its own because existing violations break the lint script); B) fixes plus
gate wiring. Not recommended: A cannot merge a passing `npm run lint` without B, so the
natural unit is one PR in two commits (`build(web): add eslint ...` then `fix(web): resolve
lint violations ...`).

## 6. Layer and actor

Frontend tooling only (`web/`, plus CI and lint-staged config). No backend, schema or
contract work. No actor. Single layer, single PR.

## 7. Follow-ups (own tickets, not footnotes)

1. Wire `e2e/` lint into CI and lint-staged (PSG-48 left it unwired). Same two edits as D9.
   About 15 lines.
2. Optional: root `lint-staged` runs `prettier --write` on `*.ts`; decide whether web gets
   prettier at all (no `.prettierrc` scope for `web/`, svelte needs `prettier-plugin-svelte`).

## 8. Open questions

- Q1 Allow `_` as unused placeholder (D3), or rename the three `{#each Array(n) as _}` to
  `_index`? Default: allow `_`.
- Q2 Confirm `no-navigation-without-resolve` off (D4). Default: off.
- Q3 `prefer-svelte-reactivity`: off (D5) or six inline disables? Default: off.
- Q4 Accept that web `.ts` loses `prettier --write` on commit when moved to its own
  lint-staged config? Alternative: keep `"*.ts": "prettier --write"` in `web/.lintstagedrc`
  too. Default: keep prettier for `.ts` to preserve behaviour.
- Q5 Add lint to the existing `checks` job (default) or a separate `lint-web` job?
