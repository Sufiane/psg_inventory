# PSG-93 web eslint implementation plan

Spec: `docs/specs/2026-11-22-psg-93-web-eslint-design.md`. Branch `psg-93`.

**Size and split:** one ticket, one PR, two commits. About 160 to 190 hand-written lines,
plus a generated `web/package-lock.json` diff (about 1 500 to 2 000 lines, same as PSG-48).
Under the ~800 line cap excluding the lockfile. Single layer (frontend tooling), no
actor, no backend work. Tasks are strictly sequential (config must exist before fixes can
be verified); there is nothing to parallelise.

**Conventions for the builder:** conventional commits (`build(web): ...`, `fix(web): ...`)
ending with the Co-Authored-By line. Stage and stop for `/crit`, do not commit before the
user's go-ahead. Move Linear PSG-93 to In Progress first; In Review only once staged.
Confirm branch name is `psg-93` before any push. Pull main first. Exact version pins only.
Open questions Q1 to Q5 in the spec carry the stated defaults unless the coordinator says
otherwise.

---

## Task 1. Install pinned devDependencies

Files: `web/package.json`, `web/package-lock.json`.

- [ ] In `web/`: `npm install --save-dev --save-exact eslint@9.17.0 @eslint/js@9.17.0 typescript-eslint@8.70.0 globals@15.13.0 eslint-plugin-svelte@3.24.1 svelte-eslint-parser@1.11.0`.
- [ ] Verify `web/package.json` has no `^` or `~` anywhere in the new entries; fix by hand
  if present, then `npm install` again so the lockfile matches.
- [ ] Verify the lockfile still pins `typescript@6.0.3`, `svelte@5.56.0`, `vite@8.0.16`
  unchanged (`git diff web/package-lock.json | grep -E '"(typescript|svelte|vite)"'` shows nothing
  surprising).
- [ ] Add script `"lint": "eslint . --max-warnings 0"` to `web/package.json`, after `typecheck`.
- [ ] Do NOT touch `tsconfig.json` `types`; none of these packages need an `@types` entry.

## Task 2. Add `web/eslint.config.mjs`

File: `web/eslint.config.mjs` (new, 4-space indent like e2e).

```js
import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';

export default [
    { ignores: ['.svelte-kit/**', 'build/**', '.wrangler/**', 'node_modules/**'] },
    pluginJs.configs.recommended,
    ...tseslint.configs.recommended,
    ...svelte.configs['flat/recommended'],
    {
        languageOptions: {
            globals: { ...globals.browser, ...globals.node },
        },
    },
    {
        files: ['**/*.svelte', '**/*.svelte.ts'],
        languageOptions: {
            parser: svelteParser,
            parserOptions: {
                parser: tseslint.parser,
                extraFileExtensions: ['.svelte'],
            },
        },
    },
    {
        rules: {
            'no-console': 'error',
            'prefer-const': 'error',
            '@typescript-eslint/no-unused-vars': [
                'error',
                { varsIgnorePattern: '^_$', argsIgnorePattern: '^_' },
            ],
            '@typescript-eslint/explicit-function-return-type': [
                'error',
                { allowTypedFunctionExpressions: true },
            ],
            // Deployed at the site root, no kit.paths.base; resolve() adds nothing.
            'svelte/no-navigation-without-resolve': 'off',
            // Map and URLSearchParams are used as local scratch values, never reactively.
            'svelte/prefer-svelte-reactivity': 'off',
        },
    },
    {
        files: ['**/*.svelte', '**/*.svelte.ts'],
        rules: { 'prefer-const': 'off', 'svelte/prefer-const': 'error' },
    },
];
```

- [ ] Write the file exactly as above (this block is the dry-run config that produced the
  counts in the spec, plus the D4 and D5 rule-offs). The last block must stay last.
- [ ] Run `npm run lint` in `web/`. Expected: only the fixable findings remain, about 52
  (50 return types, 2 writable-derived) plus 6 unused-svelte-ignore and any `.mjs`
  findings in `scripts/generate-icons.mjs`. Record the real count in the commit body.
- [ ] Sanity check the config detects things: add a throwaway `console.log(1)` to a `.ts`
  file and a missing return type in a `.svelte` file, confirm both are reported, then
  revert.
- [ ] Commit 1 is NOT possible with a red lint script and CI wired, so do Tasks 2 and 3
  before committing; split into two commits only by file groups (config/deps vs source
  fixes), keeping CI wiring in the second.

## Task 3. Fix the real violations

Files: about 15 `.svelte` / `.ts` files under `web/src`, `web/scripts/generate-icons.mjs`.

Affected files for return types (from the dry run): `AskCard`, `ImportPassPicker`,
`ImportSalesDraft` (11), `ImportSalesModal`, `SeasonSelect`, `ToastHost`,
`admin/matches/+page`, `sales/+page` (16), `sales/[saleId]/+page` (3), `sales/new/+page`,
`season/+page` (4), `+page` (2), `login/+page`, `register/+page.server.ts`, `register/+page`.

- [ ] Return types: for each `explicit-function-return-type` finding add the explicit type
  (`: void`, `: Promise<void>`, or the real type). Inline template handlers become
  `(event): void => ...` or are extracted to a named `function name(): void`. Keep braces
  on `if`, blank-line-before-`if/return` per the global style where code is touched.
  Do not restructure beyond the annotation. Check with `npm run lint` after each file.
- [ ] `AskCard.svelte` (around line 19 to 22) and `sales/new/+page.svelte` (around line 11
  to 18): replace the `$state` seed plus `$effect` re-sync with a writable `$derived`:
  `let selectedMatchId = $derived(data.presetMatchId ?? '');`, assigned by the select
  `bind:value` or handler. Delete the `svelte-ignore state_referenced_locally` comment and the
  `$effect`. Confirm `bind:` on a `$derived` works in Svelte 5.56 (it does for writable
  derived; if the template uses `bind:value={selectedMatchId}` verify manually).
  Behaviour to preserve: same-route navigation with a new `?matchId=` re-seeds, and a user
  selection persists until `data` changes. Keep the existing explanatory comment about
  reuse across same-route navigations on the derived line, trimmed.
- [ ] `scripts/generate-icons.mjs`: fix whatever the two findings are. If `no-undef` on a
  global, it is a config gap (`globals.node` is already included), so investigate rather
  than disabling.
- [ ] `npm run lint` in `web/` exits 0 with `--max-warnings 0`.
- [ ] `npm run check` and `npm run typecheck` in `web/` still pass. `npm test` in `web/`
  passes.
- [ ] Manual smoke: `npm run dev` in `web/`, open Sales > New with and without
  `?matchId=`, and the AskCard flow. The e2e CI job covers the rest.

## Task 4. Wire into the gate

Files: `.github/workflows/ci.yml`, `web/.lintstagedrc` (new).

- [ ] CI `checks` job: after `- run: npm run lint` add
  ```yaml
      - run: npm ci
        working-directory: web

      - run: npm run lint
        working-directory: web
  ```
  and add `cache-dependency-path` with `package-lock.json` and `web/package-lock.json`
  under `actions/setup-node@v4` in the `checks` job (copy the format the `e2e` job uses).
  Per Q5, if the coordinator prefers a parallel job, create `lint-web` instead.
- [ ] `web/.lintstagedrc`:
  ```json
  {
    "*.ts": ["prettier --write", "eslint --max-warnings 0"],
    "*.svelte": ["eslint --max-warnings 0"]
  }
  ```
  `prettier` resolves from the root `node_modules` via PATH lookup by lint-staged, check
  that it runs from `web/` cwd; if not, use `npx --no -- prettier` or drop prettier for
  web per Q4.
- [ ] Verify lint-staged routing: stage a trivial edit in `web/src/...svelte`, one in
  `web/src/...ts`, one in `src/...ts` and one in `e2e/...ts`; run `npx lint-staged --debug`
  (or `--diff`), confirm web files run with `web/eslint.config.mjs` (add a deliberate
  violation to prove it, e.g. a missing return type that the root config also flags, and
  `console.log` is not distinguishing, so use a Svelte-only rule like a stray `$:` in
  non-rune code or a rune-prop `let {x} = $props()` that root `prefer-const` would flag).
  Confirm root `src/` and `e2e/` still use the root config and nothing runs twice. If
  lint-staged applies both configs to web files, use the fallback in spec D9.2. Revert the
  throwaway edits.
- [ ] Confirm the root `npm run lint` and `npm run typecheck` still pass (they should be
  unaffected; root patterns do not include `web/`).

## Task 5. Final checks and docs

- [ ] Search `docs/tech-debt.md` for any entry about missing web lint or the svelte
  `svelte-ignore` seeds; remove resolved entries (PSG-48 did this). If none, skip.
- [ ] File the e2e-lint-wiring follow-up as a Linear issue in team "PSG Inventory",
  assignee me (spec section 7.1), and mention it in the PR description. No PR numbers in
  titles or bodies.
- [ ] Fresh-clone proof: in a clean checkout run `npm ci` in `web/` then `npm run lint`,
  expect exit 0 (guards against lockfile drift and the `--no-save` packages used during
  planning; nothing from the planning dry run is committed).
- [ ] `git status` shows only intended files; stage, do not commit; tell the user it is
  ready for `/crit`; then move PSG-93 to In Review.

## Risks

- Lint-staged config resolution (Task 4) is the one real unknown; the fallback is in the spec.
- Writable `$derived` conversion is the only behavioural change; covered by manual smoke
  and e2e.
- CI wall-clock rises by the `web/` install; acceptable, cached.
