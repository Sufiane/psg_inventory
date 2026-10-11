# PSG-46 narrow sales cache flush Implementation Plan

Spec: `docs/specs/2026-10-10-psg-46-narrow-sales-cache-flush-design.md`. Backend only.
Repo rules: explicit return types, no single-letter vars, braces on every `if`, blank line
before if/for/return/throw, no barrels, no comments unless non-obvious why, nested `describe`
per condition (title states condition, `it` states outcome), no `!!`. Conventional commits
(`perf(matches): ... (PSG-46)`), stage only, do not commit until user reviews (`/crit`).
Service/db split: change stays in `matches.db.ts` (the ORM boundary); no service change.

Files: `src/db/matches/matches.db.ts`, `src/db/matches/matches.db.spec.ts`,
`docs/tech-debt.md`.

## Task 1: Spec fixtures carry the existing row's date (red phase)

- [ ] In `matches.db.spec.ts`, change `mockTransaction(existingMatchId)` to
  `mockTransaction(existingMatchId: string | null, existingDate?: Date)`; the `findFirst`
  mock resolves `{ id, date: existingDate ?? new Date(formattedMatch.date) }` (unchanged date
  by default). Keep tx typing as is.
- [ ] Existing sales-flush cases ("several users", "mid-loop throw ... committed match has
  sales", "lookup throws" x2) pass a different date, e.g. `new Date('2026-09-13T15:00:00.000Z')`,
  so they represent a date change.
- [ ] Add describes inside `loadMatches`:
  - `when the existing match date is unchanged`: `sales.findMany` not called;
    `invalidatePattern` called only for the matches namespace; both per-match keys still deleted.
  - `when the existing match date changed`: `sales.findMany` called with
    `where: { matchId: { in: ['existing-match-id'] } }`.
  - `when several fixtures sync and only one changed its date`: two `FormattedMatch`es with
    distinct ids via `findFirst.mockResolvedValueOnce` x2; lookup `in` contains only the
    changed id; per-match deletes cover both ids.
- [ ] Run `npx vitest run src/db/matches/matches.db.spec.ts`; expect the new "unchanged" and
  "only one changed" cases to fail.

## Task 2: Implement

- [ ] Add private type `SyncProgress` (`updatedMatchIds`, `dateChangedMatchIds`,
  `unknownCompetitions`) in `matches.db.ts`; move the "mutates rather than returns because a
  mid-loop throw loses the return value" comment onto it, delete the now-duplicated comments at
  the old call site and the `syncMatches` signature.
- [ ] `loadMatches`: build `progress`, call `this.syncMatches(matches, progress)`; `finally`
  passes `progress.dateChangedMatchIds` to `invalidateSalesCachesForMatches` and iterates
  `progress.updatedMatchIds` for the per-match deletes; return
  `[...new Set(progress.unknownCompetitions)]`.
- [ ] `syncMatches(matches, progress)`: `findFirst` select `{ id: true, date: true }`; in the
  `existing` branch after the update, push to `updatedMatchIds`; and when
  `existing.date.getTime() !== matchDate.getTime()` push to `dateChangedMatchIds`.
  `unknownCompetitions` push via `progress`.
- [ ] Run `npx vitest run src/db/matches/matches.db.spec.ts`; all green.

## Task 3: Verify and docs

- [ ] `npm run typecheck`, `npm run lint`, `npx vitest run src/db src/api/admin`.
- [ ] Update `docs/tech-debt.md` item 7: mark resolved by PSG-46 (follow the file's existing
  convention for resolved items), and note the competition/atHome caveat if the user kept
  date-only. Leave item 8 (PSG-47) open.
- [ ] `git add` changed files; stop and tell the user it is staged and ready for `/crit`.
  Move Linear PSG-46 to In Progress before starting and In Review only once staged.
  Suggested message: `perf(matches): flush sale caches only for matches whose date changed (PSG-46)`.
