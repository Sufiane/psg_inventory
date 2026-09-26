# Frontend (`web/` — SvelteKit)

## Structure
- `web/src/routes/(app)/...` — authenticated pages (dashboard, sales, matches, accounting, season, admin).
- `web/src/routes/login|register|logout`, `web/src/routes/api/sales-import/*` — unauth pages and SvelteKit API proxy routes.
- `web/src/lib/ui/*.svelte` — shared components. `web/src/lib/api.ts` + `lib/api/*` — API client. `web/src/lib/stores/*.svelte.ts` — rune-based stores.

## Design constraints (from `PRODUCT.md` — binding)
- Voice: sharp / quiet / precise. Matter-of-fact copy, exact nouns, present tense, no exclamation marks, no marketing energy.
- Data is the product: no SaaS-landing-page cards, no gradients, no urgency/gamification cues, no club-photography hero.
- Every displayed number must be traceable to its math; name pending/unset/missing state honestly instead of showing a zero.
- WCAG 2.2 AA: 4.5:1 body contrast, focus rings, keyboard-reachable, `prefers-reduced-motion` honored.
- Signals never rely on color alone — pair with a label, sign, or shape.

## Styling
- Tailwind v4 with design tokens declared in `web/src/app.css` under `@theme` (`--color-ink`, `--color-surface`, `--color-positive`, `--color-warning`, `--color-sunk`, `--color-gift`, ...), all OKLCH with a 270-hue chroma bias.
- Dark mode flips the CSS variables — add new tokens with both light and dark values and verify measured contrast (comments in `app.css` record the ratios; keep that habit).
- `--color-warning` = pending/in-flight, `--color-sunk` = unrealized/cancelled, `--color-gift` = given away, `--color-positive`/`--color-negative` = realized cash. Do not repurpose these.

## Gotchas
- Svelte 5 runes (`$state`, `$derived`, `$props`); stores are `.svelte.ts` modules, not classic `writable`.
- Components with markup are `.svelte` even when colocated in `.svelte.ts` store files (`toast.svelte.ts`).
- `Skeleton.svelte` uses `animate-pulse` — any new skeleton needs a static `prefers-reduced-motion` fallback.
- Backend URL comes from `BACKEND_URL` in `web/.env`; never hardcode the API origin.