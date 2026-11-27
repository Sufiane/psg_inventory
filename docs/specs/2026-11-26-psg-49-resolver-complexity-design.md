# PSG-49 — Split sales-import resolver per-row logic (cognitive complexity)

## Goal

`validateCommitRows` (complexity 23) and `resolveDraftRows` (27) in
`src/api/sales-import/sales-import.resolver.ts` are the backend's worst
`sonarjs/cognitive-complexity` offenders. Extract per-row steps into module-level
helpers so every function in the file is ≤15, then lower the ratchet in
`eslint.config.mjs` from 27 to 18 (new worst: `scripts/ungift-sale.ts`, owned by PSG-51).

Pure refactor. No behavior change, no signature change on the two exports.

## Scope

- In: `sales-import.resolver.ts`, `sales-import.resolver.spec.ts` (characterization tests only), `eslint.config.mjs` (one number).
- Out: `scripts/ungift-sale.ts` (PSG-51), every other file.

## Design

All helpers are module-level, non-exported functions in the resolver file.

### Shared helpers

| Helper | Owns |
|---|---|
| `errorOnly(status)` | Returns `status` if it starts with `error:`, else `null`. |
| `firstStatus(candidates)` | First non-null candidate, else `'ok'`. Encodes the precedence chain as an ordered array. |
| `countIssues(rows)` | `{ errors, warnings }` by `rowStatus` prefix (`error:` / `warn:`). |

### `validateCommitRows` path

| Helper | Owns |
|---|---|
| `toCommitRaw(row)` | Builds the `raw` view of a `DraftRowDto` (soldAt/recipient `?? null`). |
| `hasValidAllocations(row, selected)` | Non-empty, sum equals `nbTickets`, every pass id in `selected`. |
| `validateCommitRow(row, byDate, selected)` | One row: invalid-cell short-circuit → `resolveMatch` → match-error short-circuit → `firstStatus([unallocated, giftRecipient, soldAt, matchStatus])`. Returns the output `DraftRowDto`. |

`validateCommitRows` becomes: build `byDate`/`selected`, `map` rows through
`validateCommitRow`, `countIssues`, return.

### `resolveDraftRows` path

| Helper | Owns |
|---|---|
| `toDraftRowBase(raw)` | Common output fields from a `RawImportRow` incl. conditional `soldAt`/`recipient` spreads (used by both invalid and valid branches). |
| `resolveDraftRow(raw, byDate, selectedPassIds)` | One row: invalid-cell short-circuit, else match + allocations + gift + soldAt and `firstStatus([errorOnly(match), errorOnly(alloc), gift, soldAt, match, alloc])`. |
| `findMissingMatches(homeMatches, rows)` | Home matches whose id is not a `matchId` of any output row. |

`resolveDraftRows` becomes: `byDate`, `map` through `resolveDraftRow`,
`countIssues`, `findMissingMatches`, return.

### Expected complexity (sonarjs)

| Function | Before | After (est.) |
|---|---|---|
| `validateCommitRows` | 23 | ~0–1 |
| `resolveDraftRows` | 27 | ~0–1 |
| `validateCommitRow` | — | ~4 |
| `resolveDraftRow` | — | ~2 |
| `toDraftRowBase` | — | ~2 |
| `hasValidAllocations` | — | ~1 |
| others (`errorOnly`, `firstStatus`, `countIssues`, `findMissingMatches`, `toCommitRaw`) | — | ≤2 |

## Behavior-preservation invariants

1. **Precedence order is unchanged.** Draft: match-error > alloc-error > gift > soldAt > match-warn > alloc-warn. Commit: invalid-cell > match-error > unallocated > gift > soldAt > match-warn. The existing comment above `resolveGiftRecipientStatus` says the gift/soldAt order must be identical in both paths — keep it, update its reference from `validateCommitRows` to `validateCommitRow`.
2. **Commit-path short-circuits stay lazy.** In the original, allocation/gift/soldAt are only evaluated after invalid-cell and match-error checks pass. Keep both as early returns; do **not** fold them into one eager `firstStatus` array (a tampered payload with odd `allocations` would then throw where it previously returned a status).
3. **Draft path stays eager.** Original computes match, allocations, gift, soldAt up front for valid rows; all pure, eager array is equivalent.
4. **`matchId` on commit rows.** Output is `{ ...row, ...(match ? { matchId } : {}), rowStatus }`. On invalid-cell rows nothing overrides, so any client-supplied `matchId` passes through — preserve that.
5. **Key order of output objects** stays the same (base fields, soldAt, recipient, matchId, allocations, rowStatus) so JSON shape is byte-identical.
6. **Summary counts.** Counting by filtering output rows is equivalent to the in-loop counters (one output row per input row; `ok` counts as neither). `total` stays `input.rows.length` / `input.rawRows.length`.
7. **`missingMatches`.** Deriving used ids from output rows' `matchId` is equivalent: valid rows carry `matchId` iff a match was found; invalid draft rows never carry one (`RawImportRow` has no `matchId`). Order follows `homeMatches` as before.

## Testing

- Existing `sales-import.resolver.spec.ts` stays green, unchanged.
- `validateCommitRows` coverage today is only the gift-recipient block. Before refactoring, add a characterization `describe` block (passes on current code) covering: invalid-cell, match-missing, opponent-mismatch warning, unallocated (empty / wrong sum / unknown pass), sold-after-kickoff, `matchId` set on match and passthrough on invalid-cell, and summary counts. Additions only, no edits to existing tests.
- `npm run lint`, `npm test`, `npm run build` + `test -f dist/main.js`.

## Risks

- Invariant 2 is the only real trap. Everything else is mechanical.
- Sonar's counting of `?.`/`??` is not assumed; measure with the threshold-at-15 trick before setting 18.
