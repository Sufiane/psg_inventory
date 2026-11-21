# Matchday strip horizontal scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Builder: `frontend-builder` only. No backend task.

**Goal:** Make each fixture in `MatchdayStrip` legible (date + opponent) by giving cards a fixed width and scrolling the strip horizontally, starting at the next upcoming fixture.

**Spec:** `docs/specs/2026-11-20-matchday-strip-scroll-design.md`

**Tech:** Svelte 5 runes, Tailwind 4, Vitest (node env), Playwright. No new deps. Global constraints from `docs/plans/2026-11-20-psg-83-accounting-page-plan.md` apply (no comments, explicit return types, no inline `if`, blank line before `if/for/return`, numeric separators, conventional commit `feat(web): ...` / `fix(web): ...`, stage and stop for `/crit`).

## Size and ticket split

Estimate about **120 lines** (helper+spec ~45, component ~55, e2e ~20). One PR, one layer, one actor. No split.

## Files

- Modify `web/src/lib/accounting-view.ts`, `web/src/lib/accounting-view.spec.ts`
- Modify `web/src/lib/ui/MatchdayStrip.svelte`
- Modify `e2e/tests/accounting.e2e-spec.ts`

## Task 1: `upcomingIndex` helper (TDD)

- [ ] Add failing tests to `accounting-view.spec.ts`. Use a `describe` per condition:
  - when some fixtures are today or later: returns the index of the first of them
  - when a fixture is today (earlier time of day): that fixture is returned (compare against start of local today)
  - when all fixtures are past: returns last index
  - when there are no segments: returns -1
- [ ] Run `npx vitest run accounting-view` in `web/`, see them fail.
- [ ] Implement in `accounting-view.ts`:

```ts
export function upcomingIndex(segments: StripSegment[], today: Date): number {
    if (segments.length === 0) {
        return -1;
    }

    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const index = segments.findIndex((segment) => new Date(segment.date).getTime() >= startOfToday);

    return index === -1 ? segments.length - 1 : index;
}
```

- [ ] Tests pass.

## Task 2: scrolling cards in `MatchdayStrip.svelte`

- [ ] Replace the `<ol class="flex gap-1">` block with a scroller wrapping the list (legend block untouched, stays after it):

```svelte
<div
    bind:this={scroller}
    role="region"
    aria-label="Matchday strip scroller"
    tabindex="0"
    class="relative snap-x snap-proximity overflow-x-auto pb-2 focus-visible:outline-2 focus-visible:outline-offset-2"
>
    <ol aria-label="Matchday strip" class="flex w-max gap-2">
        {#each segments as segment (segment.matchId)}
            {@const label = ...unchanged...}
            <li class="w-24 shrink-0 snap-start" aria-label={label} title={label}>
                <span class="flex h-7 items-center justify-center rounded-sm {fillFor(segment.status)}" aria-hidden="true">
                    {#if segment.isBreakEven}<span class="text-surface-subtle">★</span>{/if}
                </span>
                <span class="mt-1 block text-xs text-ink-faint">{shortDate(segment.date)}</span>
                <span class="block line-clamp-2 break-words text-xs text-ink">{segment.opponent}</span>
            </li>
        {/each}
    </ol>
</div>
```

  Use the existing ink token for the opponent line; check `app.css`/other components for the exact text token name (do not invent one).
- [ ] Add scroll-to-upcoming:

```ts
let scroller: HTMLDivElement | undefined = $state();

$effect(() => {
    if (!scroller) {
        return;
    }

    const index = upcomingIndex(segments, new Date());
    const card = scroller.querySelectorAll<HTMLElement>('li')[index];

    if (!card) {
        return;
    }

    scroller.scrollLeft = card.offsetLeft - (scroller.clientWidth - card.offsetWidth) / 2;
});
```

  Re-runs when `segments` changes (season switch). Direct `scrollLeft`, not `scrollIntoView`, so the page does not jump. `relative` on the scroller makes `offsetLeft` relative to it.
- [ ] Edge fades (see spec): wrap the scroller in a `relative` div; add two `pointer-events-none absolute` `aria-hidden` gradient divs (`bg-linear-to-r`/`bg-linear-to-l`, `from-surface-subtle to-transparent`). Track `hasMoreBefore`/`hasMoreAfter` in `updateFades()` (scrollLeft/clientWidth/scrollWidth), called from `onscroll`, `<svelte:window onresize>`, and at the end of the centring effect. The scroller needs `svelte-ignore a11y_no_noninteractive_tabindex`.
- [ ] Do not touch fills, star, labels, legend, `{#if segments.length > 0}`.

## Task 3: e2e

- [ ] In `accounting.e2e-spec.ts` extend the strip test: `page.getByRole('region', { name: 'Matchday strip scroller' })` is visible and contains visible text `E2E_OPPONENT_NAME`. Existing `listitem` locator by name must keep passing.
- [ ] Not covered by e2e (manual): scroll position centred on upcoming fixture, 360px and 1280px, keyboard arrows after Tab to scroller.

## Task 4: gate

- [ ] In `web/`: `npm run check`, `npx vitest run`, lint, `npm run build` and assert the build output exists (build exit 0 is not evidence). Run e2e accounting spec.
- [ ] Stage, stop, tell user to run `/crit`. Branch is `charlotte/5mom5` (do not rename). If a Linear ticket exists, move to In Progress first and In Review when staged.
