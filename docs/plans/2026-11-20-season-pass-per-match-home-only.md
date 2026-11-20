# Season pass per match, home games only: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Builder: `frontend-builder` only (no backend task exists).

**Goal:** The "Season pass per match" figure divides the season pass price by the number of HOME matches only.

**Architecture:** One pure helper in `web/src/lib/accounting-view.ts` (vitest), consumed by the accounting page and passed to `AmortisationBlock`. No API, cache or contract change.

**Tech Stack:** SvelteKit, Svelte 5 runes, Vitest (node env). No new dependencies.

**Spec:** `docs/specs/2026-11-20-season-pass-per-match-home-only-design.md`

## Global constraints

Repo conventions apply: explicit return types, no single-letter names, no inline `if`, blank line before `if/for/while/return/throw`, no comments unless a non-obvious why, no barrels, describe-per-condition tests with outcome-only `it` titles, conventional commits (`fix(web): ...`), no PR numbers, stage and stop for `/crit`. Branch is `naypyidaw/away-games-season-pass-exclude`; rename per ticket-key rule before first push if a Linear key applies.

## Size and ticket split

Estimate, tests and docs included: about **60 lines** (helper + spec ~35, page 1, component ~6, docs already written). Single PR, one actor, one layer (web). Under the 800 cap, no split.

## File map

- Modify `web/src/lib/accounting-view.ts`
- Modify `web/src/lib/accounting-view.spec.ts`
- Modify `web/src/routes/(app)/accounting/+page.svelte` (line ~157)
- Modify `web/src/lib/ui/AmortisationBlock.svelte`

## Task 1: `homeMatchCount` helper (TDD)

- [ ] Add failing specs to `web/src/lib/accounting-view.spec.ts`. The existing `match(id, opponent, date)` factory hardcodes `atHome: true`; add an optional fourth param `atHome = true` (default keeps existing calls working).

```ts
describe('homeMatchCount', () => {
    describe('when the list mixes home and away matches', () => {
        it('counts only the home matches', () => {
            const matches = [
                match('m1', 'A', '2026-09-01'),
                match('m2', 'B', '2026-09-08', false),
                match('m3', 'C', '2026-09-15'),
            ];

            expect(homeMatchCount(matches)).toBe(2);
        });
    });

    describe('when every match is away', () => {
        it('returns 0', () => {
            expect(homeMatchCount([match('m1', 'A', '2026-09-01', false)])).toBe(0);
        });
    });

    describe('when the list is empty', () => {
        it('returns 0', () => {
            expect(homeMatchCount([])).toBe(0);
        });
    });
});
```

Import `homeMatchCount` from `./accounting-view`.

- [ ] Run `npx vitest run src/lib/accounting-view.spec.ts` in `web/`; expect failure (export missing).
- [ ] Implement in `web/src/lib/accounting-view.ts`:

```ts
export function homeMatchCount(matches: FormattedMatch[]): number {
    return matches.filter((match) => match.atHome).length;
}
```

- [ ] Rerun the spec; expect pass.

## Task 2: wire page and component

- [ ] `web/src/routes/(app)/accounting/+page.svelte`: import `homeMatchCount` alongside the existing `stripSegments`/`tableGroups` import from `$lib/accounting-view`; change line ~157 to `<AmortisationBlock data={view.amortization} homeMatchCount={homeMatchCount(view.matches)} />`. Leave `view.matches.length > 0` on the strip and `MatchdayStrip`/`SeasonMatchTable` inputs untouched (they must keep away matches).
- [ ] `web/src/lib/ui/AmortisationBlock.svelte`: rename prop `matchCount` to `homeMatchCount` (props destructure, type, the `=== 0` check, displayed number, `passCostPerMatch(data.passPrice, homeMatchCount)`); change the label `fixtures` to `home fixtures`; empty state text to `No home fixtures in this season.`.

## Task 3: gate

- [ ] In `web/`: `npx vitest run`, `npm run check` (svelte-check), `npm run lint`; all clean.
- [ ] `grep -rn "fixtures\|per match" e2e/tests` to confirm no e2e asserts the old copy; if one does, update it.
- [ ] Stage (`git add`), do not commit; tell the user to run `/crit`.

## Independence

Frontend-only. No backend task, no schema, no contract change. Dispatch `frontend-builder` alone.
