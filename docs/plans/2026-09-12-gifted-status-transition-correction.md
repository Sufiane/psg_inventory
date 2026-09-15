# Gifted Status Transition Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the already-shipped `GIFTED` sale status in line with the corrected business rules — entering `GIFTED` is kickoff-guarded like `SOLD`, `GIFTED` is reachable only from `PENDING`, and `GIFTED` is terminal — while leaving the recipient add/correct/reuse flow working at any point in a sale's life.

**Architecture:** This is a correction to shipped code, not greenfield work. Three behavioural changes: (1) `SalesService.updateSale` gains an explicit transition-legality check driven by a static matrix, and its kickoff guard widens from `SOLD` to `SOLD` plus *entry into* `GIFTED`; (2) the CSV import resolver's `resolveSoldAtStatus` loses its `GIFTED` exemption so imported gift rows are guarded exactly like sold rows; (3) the sales-list edit panel stops rendering affordances for the transitions that just became illegal. Everything else about the feature — the accounting sub-bucket, the `Recipients` entity, the combobox, the colour token, the migrations — is untouched.

**Tech Stack:** NestJS 11 + Prisma (`src/`), Jest for backend unit tests; SvelteKit 2 + Svelte 5 runes + Tailwind (`web/`), Vitest for the pure form-payload helper.

## Global Constraints

- Spec of record: `docs/specs/2026-09-11-gifted-sale-status-design.md`, decisions **D5** (revised 2026-09-12), **D9**, **D10**. Read D5 and D10 before starting.
- **Entry-only guard scoping, confirmed by the user.** The kickoff guard fires on `target === 'SOLD'`, and on `target === 'GIFTED'` **only when the sale is not already `GIFTED`**. A request targeting `GIFTED` on an already-`GIFTED` sale is a recipient update and is **exempt** — it must keep working after kickoff, with full resolve-or-create behaviour. This exemption is the only reason CSV-imported gifts (typically past-match, always `recipientId = null`) can ever be given a recipient. Do not remove it, and do not widen the guard to key on the target alone. *(An earlier draft of this correction did exactly that and was reversed before implementation — the spec's Revisions section records why.)*
- A request that omits `status` entirely (the edit-numbers form) targets nothing and must remain completely unguarded — price/invest/allocation edits on a past-kickoff gift keep working.
- Hexagonal split is mandatory: `src/api/**/*.service.ts` must not import Prisma or any ORM. All the work in this plan is api-layer only; no `src/db/**` file changes.
- Explicit return types on every backend function and method, including `Promise<void>`.
- No single-letter locals (classic indexed-`for` `i`/`j`/`k` excepted). No inline `if` — always braced, body on its own line. Blank line before `if` / `for` / `while` / `return` / `throw` unless it is the first statement in its block.
- Jest structure: a `describe` per condition (`when …`), `it` titles state only the outcome.
- Deps are exact-pinned; this plan adds no dependencies.
- Prettier + ESLint gate the repo (`npm run lint -- --max-warnings 0`). Run `npm run format` before committing backend work.
- Do **not** delete the `giftedAt = null` / `recipientId = null` clearing branches in `src/db/sales/sales.service.ts`. They are unreachable from the API by design (spec D6/D11) and stay for DB-level manual repairs.

---

## File Structure

**Backend — changed:**

| File | Responsibility after this change |
|---|---|
| `src/common/exceptions/error-codes.enum.ts` | Adds `SALE_INVALID_STATUS_TRANSITION` |
| `src/common/exceptions/http-exception.mapper.ts` | Maps that code to HTTP 400 |
| `src/api/sales/sales.service.ts` | Owns transition legality (new module-level `isLegalTransition`) and the entry-scoped kickoff guard |
| `src/api/sales/sales.service.spec.ts` | Flips the "GIFTED after kickoff allows" case to "rejects" for entry; pins the already-`GIFTED` exemption; adds illegal-transition coverage |
| `src/api/sales-import/sales-import.resolver.ts` | `resolveSoldAtStatus` guards every status uniformly — no `GIFTED` special case |
| `src/api/sales-import/sales-import.resolver.spec.ts` | Flips the "GIFTED imports cleanly after kickoff" case to an error row |

**Frontend — changed:**

| File | Responsibility after this change |
|---|---|
| `web/src/routes/(app)/sales/+page.svelte` | Renders the gift form only where a `GIFTED`-targeting request can succeed; drops `confirmMarkGifted`; hides "Mark sold" on a `GIFTED` sale |
| `web/src/routes/(app)/sales/read-payload.spec.ts` | Drops the now-impossible `CANCELLED → GIFTED` case |
| `web/src/routes/(app)/sales/[saleId]/+page.svelte` | Read-only `GIFTED` copy stops promising a status change |

**Deliberately unchanged** (verified during exploration, listed so nobody "fixes" them):
`web/src/routes/(app)/sales/read-payload.ts` (gates on the `intent` field, not on status — still correct);
`web/src/routes/(app)/sales/+page.server.ts`; `src/api/sales/dto/update-sale.dto.ts` (`SaleStatusTarget` still has three legal targets); `src/db/**` (timestamp/recipient clearing stays, per Global Constraints); `src/api/sales-import/sales-import.csv.ts` (`GIFTED` stays an importable status); `src/api/sales-import/sales-import.service.ts` (its `row.status === 'GIFTED' && row.soldAt != null → giftedAt` mapping is still right — the resolver now rejects the bad rows before they reach it); `src/crons/cancel-sales/*` (selects `status: PENDING` only, so `GIFTED` is never swept); `SalesService.resolveRecipient` (its already-`GIFTED`-with-recipient no-op branch is still fully live).

---

## Task 1: Backend — transition legality + entry-scoped kickoff guard

**Files:**
- Modify: `src/common/exceptions/error-codes.enum.ts:9-16` (add one member)
- Modify: `src/common/exceptions/http-exception.mapper.ts:44-47` (add one entry)
- Modify: `src/api/sales/sales.service.ts:98-112` (the guard block in `updateSale`) and `:288-299` (module-level helpers, after `resolveTargetStatus`)
- Test: `src/api/sales/sales.service.spec.ts:198-217` (existing case to flip) plus new `describe`s in the same block

**Interfaces:**
- Consumes: `resolveTargetStatus(payload: UpdateSaleDto): SaleStatusTarget | undefined` (already exists, module-level at the bottom of `sales.service.ts`); `Sale['status']` from `src/db/sales/type/sale.type.ts`, a `SaleStatus` string union including `'CANCELLED'`; `SaleStatusTarget = 'PENDING' | 'SOLD' | 'GIFTED'` from `src/api/sales/dto/update-sale.dto.ts`.
- Produces: `ErrorCode.SALE_INVALID_STATUS_TRANSITION`, consumed by nothing else in this plan; a module-level `isLegalTransition(current: SaleStatusName, target: SaleStatusTarget): boolean` and `isKickoffGuarded(current: SaleStatusName, target: SaleStatusTarget): boolean`, both private to `sales.service.ts`.

**Ordering that the tests below depend on** — inside `updateSale`, after the `SALE_NOT_FOUND` check and `resolveTargetStatus`, the sequence is:

1. transition legality (`SALE_INVALID_STATUS_TRANSITION`)
2. kickoff guard (`SALE_AFTER_KICKOFF`)
3. allocations validation
4. recipient resolution (`SALE_GIFT_RECIPIENT_REQUIRED`)

So a `SOLD → GIFTED` on a past match reports the transition error, not the kickoff error — the transition is the more fundamental refusal and the more useful message.

- [ ] **Step 1: Add the error code**

In `src/common/exceptions/error-codes.enum.ts`, after `SALE_GIFT_RECIPIENT_NOT_FOUND`:

```ts
    SALE_INVALID_STATUS_TRANSITION = 'sale_invalid_status_transition',
```

- [ ] **Step 2: Map it to HTTP 400**

In `src/common/exceptions/http-exception.mapper.ts`, after the `SALE_GIFT_RECIPIENT_NOT_FOUND` entry:

```ts
    [ErrorCode.SALE_INVALID_STATUS_TRANSITION]: () =>
        new BadRequestException(ErrorCode.SALE_INVALID_STATUS_TRANSITION),
```

- [ ] **Step 3: Flip the existing "GIFTED after kickoff" test and pin the exemption**

In `src/api/sales/sales.service.spec.ts`, replace the whole `describe('when the target is GIFTED and the match has kicked off', …)` block (currently asserting the update is allowed) with the three blocks below. The middle one is the critical one: it is what stops a future edit from widening the guard back to the target alone.

```ts
        describe('when the target is GIFTED from PENDING and the match has kicked off', () => {
            it('rejects the update', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() - 60_000), SaleStatus.PENDING),
                );

                await expect(
                    service.updateSale(userId, {
                        saleId,
                        status: 'GIFTED',
                        recipientName: 'Marc',
                    } as UpdateSaleDto),
                ).rejects.toMatchObject({ code: ErrorCode.SALE_AFTER_KICKOFF });
            });
        });

        describe('when the sale is already GIFTED and the match has kicked off', () => {
            // The recipient-update exemption (spec D5 / D10). A CSV-imported
            // gift is a past match with recipientId = null by construction, so
            // this is the only path that can ever give it a recipient. Do not
            // "simplify" the guard to key on the target alone — this is the
            // test that catches it.
            it('allows a recipient to be attached', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() - 60_000), SaleStatus.GIFTED),
                );

                await service.updateSale(userId, {
                    saleId,
                    status: 'GIFTED',
                    recipientName: 'Marc',
                } as UpdateSaleDto);

                expect(salesDbService.updateSale).toHaveBeenCalledWith(
                    expect.objectContaining({ status: 'GIFTED', recipientName: 'Marc' }),
                );
            });

            it('allows an existing recipient to be replaced', async () => {
                salesDbService.getOneSale.mockResolvedValue({
                    ...saleFixture(new Date(Date.now() - 60_000), SaleStatus.GIFTED),
                    recipientId: 'recipient-1' as RecipientId,
                });

                await service.updateSale(userId, {
                    saleId,
                    status: 'GIFTED',
                    recipientName: 'Sofia',
                } as UpdateSaleDto);

                expect(salesDbService.updateSale).toHaveBeenCalledWith(
                    expect.objectContaining({ status: 'GIFTED', recipientName: 'Sofia' }),
                );
            });
        });

        describe('when no status is sent at all and the match has kicked off', () => {
            it('allows the update', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() - 60_000), SaleStatus.GIFTED),
                );

                await service.updateSale(userId, {
                    saleId,
                    listedPrice: 150,
                } as UpdateSaleDto);

                expect(salesDbService.updateSale).toHaveBeenCalledWith(
                    expect.objectContaining({ listedPrice: 150 }),
                );
            });
        });
```

If `RecipientId` is not already imported in this spec, add it to the existing `@psg/shared/ids` type import. `saleFixture`'s second parameter is the sale's current status and already exists in this file.

- [ ] **Step 4: Add the illegal-transition tests**

Append these `describe` blocks in the same parent block, immediately after the ones from Step 3. Every fixture uses a **future** match date so the kickoff guard cannot be the thing that fires — these tests are about legality alone.

```ts
        describe('when the sale is SOLD and the target is GIFTED', () => {
            it('rejects the update', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60_000), SaleStatus.SOLD),
                );

                await expect(
                    service.updateSale(userId, {
                        saleId,
                        status: 'GIFTED',
                        recipientName: 'Marc',
                    } as UpdateSaleDto),
                ).rejects.toMatchObject({
                    code: ErrorCode.SALE_INVALID_STATUS_TRANSITION,
                });
            });
        });

        describe('when the sale is CANCELLED and the target is GIFTED', () => {
            it('rejects the update', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60_000), SaleStatus.CANCELLED),
                );

                await expect(
                    service.updateSale(userId, {
                        saleId,
                        status: 'GIFTED',
                        recipientName: 'Marc',
                    } as UpdateSaleDto),
                ).rejects.toMatchObject({
                    code: ErrorCode.SALE_INVALID_STATUS_TRANSITION,
                });
            });
        });

        describe('when the sale is GIFTED and the target is PENDING', () => {
            it('rejects the update', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60_000), SaleStatus.GIFTED),
                );

                await expect(
                    service.updateSale(userId, {
                        saleId,
                        status: 'PENDING',
                    } as UpdateSaleDto),
                ).rejects.toMatchObject({
                    code: ErrorCode.SALE_INVALID_STATUS_TRANSITION,
                });
            });
        });

        describe('when the sale is GIFTED and the target is SOLD', () => {
            it('rejects the update', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60_000), SaleStatus.GIFTED),
                );

                await expect(
                    service.updateSale(userId, {
                        saleId,
                        status: 'SOLD',
                    } as UpdateSaleDto),
                ).rejects.toMatchObject({
                    code: ErrorCode.SALE_INVALID_STATUS_TRANSITION,
                });
            });
        });

        describe('when the sale is PENDING and the target is GIFTED before kickoff', () => {
            it('allows the update', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() + 60_000), SaleStatus.PENDING),
                );

                await service.updateSale(userId, {
                    saleId,
                    status: 'GIFTED',
                    recipientName: 'Marc',
                } as UpdateSaleDto);

                expect(salesDbService.updateSale).toHaveBeenCalledWith(
                    expect.objectContaining({ status: 'GIFTED', recipientName: 'Marc' }),
                );
            });
        });

        describe('when the sale is SOLD and the target is PENDING after kickoff', () => {
            it('allows the update', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() - 60_000), SaleStatus.SOLD),
                );

                await service.updateSale(userId, {
                    saleId,
                    status: 'PENDING',
                } as UpdateSaleDto);

                expect(salesDbService.updateSale).toHaveBeenCalledWith(
                    expect.objectContaining({ status: 'PENDING' }),
                );
            });
        });

        describe('when the sale is CANCELLED and the target is PENDING after kickoff', () => {
            it('allows the update', async () => {
                salesDbService.getOneSale.mockResolvedValue(
                    saleFixture(new Date(Date.now() - 60_000), SaleStatus.CANCELLED),
                );

                await service.updateSale(userId, {
                    saleId,
                    status: 'PENDING',
                } as UpdateSaleDto);

                expect(salesDbService.updateSale).toHaveBeenCalledWith(
                    expect.objectContaining({ status: 'PENDING' }),
                );
            });
        });
```

The last two exist to pin the spec's "pre-feature transitions are unchanged" clause — if a future edit over-tightens the matrix, they are what catches it.

- [ ] **Step 5: Run the tests to verify they fail**

```bash
npm test -- src/api/sales/sales.service.spec.ts
```

Expected: the four `SALE_INVALID_STATUS_TRANSITION` cases fail (the update resolves instead of rejecting), and the `PENDING → GIFTED` after-kickoff case fails (the update resolves instead of rejecting with `SALE_AFTER_KICKOFF`). The already-`GIFTED` exemption cases, the "no status sent" case, and both "pre-feature transitions" cases should already pass — they describe behaviour this change must preserve, not introduce.

- [ ] **Step 6: Add the transition matrix and guard helpers**

In `src/api/sales/sales.service.ts`, at module level, immediately after `resolveTargetStatus`:

```ts
// The legal manual transitions, per docs/specs/2026-09-11-gifted-sale-status-design.md
// D5 (revised 2026-09-12). GIFTED is reachable only from PENDING and is
// terminal: there is no in-app undo of the status, a mistake needs a
// database-level fix. CANCELLED is absent as a target because it is cron-owned
// and UpdateSaleDto does not accept it (D4). Same-status entries are the no-op
// resubmits every form on the sales page can produce.
const LEGAL_TRANSITIONS: Record<SaleStatusName, SaleStatusTarget[]> = {
    PENDING: ['PENDING', 'SOLD', 'GIFTED'],
    SOLD: ['PENDING', 'SOLD'],
    CANCELLED: ['PENDING', 'SOLD'],
    GIFTED: ['GIFTED'],
};

function isLegalTransition(
    current: SaleStatusName,
    target: SaleStatusTarget,
): boolean {
    return LEGAL_TRANSITIONS[current].includes(target);
}

// Selling and giving a ticket away are both decisions taken before the match,
// so entering either state after kickoff is refused. GIFTED -> GIFTED is NOT
// entry: it moves no status, it is how a recipient is attached, corrected or
// reused, and it is deliberately exempt. That exemption is what keeps the
// recipient combobox usable on CSV-imported gifts, which are past-match with
// recipientId = null by construction. See spec D5 and D10 — an intermediate
// draft of this rule guarded on the target alone and was reversed for exactly
// this reason. Do not reintroduce it.
function isKickoffGuarded(
    current: SaleStatusName,
    target: SaleStatusTarget,
): boolean {
    if (target === 'SOLD') {
        return true;
    }

    return target === 'GIFTED' && current !== 'GIFTED';
}
```

Import the status union at the top of the file, alongside the existing api-layer type imports:

```ts
import { SaleStatusName } from '../accounting/types/accounting-status.type';
```

`SaleStatusName` is `'PENDING' | 'SOLD' | 'CANCELLED' | 'GIFTED'` and is already the api layer's Prisma-free status union — using it here keeps the hexagonal rule intact (no `@prisma/client` import in a `*.service.ts`). Cast at the call site if `Sale['status']` does not structurally satisfy it; it should, since both are the same four string literals.

- [ ] **Step 7: Replace the guard block in `updateSale`**

Replace the existing block — the comment plus the single `if (target === 'SOLD' && …)` — with:

```ts
        // D5: GIFTED is reachable only from PENDING and is terminal. An illegal
        // move is refused before the kickoff guard runs, so a SOLD -> GIFTED on
        // a played match reports the transition, not the kickoff.
        if (target !== undefined && !isLegalTransition(existing.status, target)) {
            throw new DomainException(ErrorCode.SALE_INVALID_STATUS_TRANSITION);
        }

        if (
            target !== undefined &&
            isKickoffGuarded(existing.status, target) &&
            existing.Match.date.getTime() <= Date.now()
        ) {
            throw new DomainException(ErrorCode.SALE_AFTER_KICKOFF);
        }
```

- [ ] **Step 8: Refresh the comment on `resolveRecipient`**

The doc comment above `resolveRecipient` predates this correction. In the sentence beginning "Returning `undefined` (as opposed to `{ recipientId: null }`) means…", append:

```
    // That no-op, and recipient updates generally, stay reachable after
    // kickoff — isKickoffGuarded exempts GIFTED -> GIFTED on purpose (D5/D10).
```

Leave the `existing.status === 'GIFTED' && existing.recipientId != null` branch itself completely alone: it is live on every gift, before and after kickoff.

- [ ] **Step 9: Run the tests to verify they pass**

```bash
npm test -- src/api/sales/sales.service.spec.ts
```

Expected: PASS, all cases.

- [ ] **Step 10: Run the full backend suite and the gates**

```bash
npm test && npm run typecheck && npm run lint
```

Expected: all green. If any *other* spec fails, it is a real behavioural fallout of the new matrix — read it before changing it, and fix the spec only if the new expectation matches D5.

- [ ] **Step 11: Commit**

```bash
git add src/common/exceptions/error-codes.enum.ts src/common/exceptions/http-exception.mapper.ts src/api/sales/sales.service.ts src/api/sales/sales.service.spec.ts
git commit -m "fix(sales): guard GIFTED entry by kickoff, make it PENDING-only and terminal"
```

---

## Task 2: Backend — CSV import applies the kickoff guard to `GIFTED` rows

**Files:**
- Modify: `src/api/sales-import/sales-import.resolver.ts:77-96` (the comment block and `resolveSoldAtStatus`)
- Test: `src/api/sales-import/sales-import.resolver.spec.ts:182-195` (the `GIFTED` case to flip)

**Interfaces:**
- Consumes: `resolveSoldAtStatus(raw: { status: RawImportRow['status']; soldAt: IsoDateString | null }, match: Match | null): DraftRowStatus | null` — module-private to this file, already exists; `isoDate(date: Date): IsoDateString`.
- Produces: nothing new. Same signature, one fewer early-return condition.

This task has no dependency on Task 1 and can be built in parallel with it.

Note the distinction this task encodes, because it is easy to conflate with Task 1's exemption: a CSV row's `soldAt` asserts *when the gift happened*, which must precede the match. Attaching a recipient later asserts *who received it*, which has no such constraint. Different claims, different rules.

- [ ] **Step 1: Flip the existing `GIFTED` resolver test**

In `src/api/sales-import/sales-import.resolver.spec.ts`, replace the whole `describe('when the row status is GIFTED', …)` block with:

```ts
        describe('when the row status is GIFTED', () => {
            it('flags a soldAt after the match date as error:sold-after-kickoff', () => {
                const rows = [
                    makeRow({ status: 'GIFTED', soldAt: '2025-09-15' as IsoDateString }),
                ];
                const result = resolveDraftRows({
                    rawRows: rows,
                    homeMatches: [marseille],
                    selectedPassIds: [passA.id],
                });

                expect(result.rows[0]!.rowStatus).toBe('error:sold-after-kickoff');
            });

            it('imports cleanly with a soldAt on the match date', () => {
                const rows = [
                    makeRow({ status: 'GIFTED', soldAt: '2025-09-14' as IsoDateString }),
                ];
                const result = resolveDraftRows({
                    rawRows: rows,
                    homeMatches: [marseille],
                    selectedPassIds: [passA.id],
                });

                expect(result.rows[0]!.rowStatus).toBe('ok');
            });
        });
```

The second `it` pins the day-level nature of the check (`soldAt` is date-only, so same-day is allowed). Before running, confirm the `marseille` fixture's match date in this spec file and set the clean row's `soldAt` to exactly that date — `'2025-09-14'` above assumes the existing fixture; adjust the literal if it differs, do not adjust the assertion.

- [ ] **Step 2: Update the stale regression comment**

Immediately below that block sits a comment starting "Regression coverage: only GIFTED is exempt from this guard (design doc D5)." Replace that comment's first sentence with:

```ts
        // Regression coverage: no status is exempt from this guard (design doc
        // D5, revised 2026-09-12 — GIFTED used to be exempt and no longer is).
        // An earlier version of resolveSoldAtStatus exempted any status that
        // wasn't SOLD, which silently let a PENDING/CANCELLED row with a
        // post-kickoff soldAt import clean, discarding the date at commit
        // instead of flagging it as it did before this feature.
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
npm test -- src/api/sales-import/sales-import.resolver.spec.ts
```

Expected: FAIL — `expected 'ok' to be 'error:sold-after-kickoff'` on the first new `it`. The same-day `it` should already pass.

- [ ] **Step 4: Drop the `GIFTED` exemption**

In `src/api/sales-import/sales-import.resolver.ts`, replace the comment block above `resolveSoldAtStatus` and the function's first condition with:

```ts
// A sale can't be marked SOLD or GIFTED after the match has kicked off — same
// rule the api layer enforces for the manual flow (sales.service.ts), and the
// same rule for both statuses since the D5 revision of 2026-09-12. soldAt is a
// date-only field here, so the check is day-level: sold or gifted the same day
// as the match is allowed (kickoff time within the day is unknown), later days
// aren't. The guard applies to PENDING and CANCELLED rows too — soldAt is a
// free-standing optional column, not exclusive to SOLD — so there is no
// per-status branch at all. This is about *when the gift happened*; attaching a
// recipient to an imported gift afterwards is a separate claim and is not
// guarded (D10). See docs/specs/2026-09-11-gifted-sale-status-design.md, D5/D10.
function resolveSoldAtStatus(
    raw: { status: RawImportRow['status']; soldAt: IsoDateString | null },
    match: Match | null,
): DraftRowStatus | null {
    if (raw.soldAt == null || match == null) {
        return null;
    }

    return raw.soldAt > isoDate(match.date) ? 'error:sold-after-kickoff' : null;
}
```

`raw.status` is now unused inside the body. Leave the parameter shape as-is — every call site passes the same object literal, and narrowing the signature is churn this correction does not need. ESLint will not flag it: `raw` itself is used.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test -- src/api/sales-import/sales-import.resolver.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Run the full backend suite and the gates**

```bash
npm test && npm run typecheck && npm run lint
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/api/sales-import/sales-import.resolver.ts src/api/sales-import/sales-import.resolver.spec.ts
git commit -m "fix(sales-import): apply the kickoff guard to GIFTED rows"
```

---

## Task 3: Frontend — sales list edit panel stops offering illegal gift transitions

**Files:**
- Modify: `web/src/routes/(app)/sales/+page.svelte` — the `confirmMarkGifted` function (`:403-423`), the status-commit block (`:475-541`), and the gift form (`:542-628`)

**Interfaces:**
- Consumes: `editSale` (`$derived(data.editSale)`, nullable, has `.status`, `.Match.Opponent.name`, `.Recipient`, `.profit`), `isPastMatch` (`$derived`, boolean, already defined at `:168`), `data.recipients`, `submitting`, `trackFlip`, `Spinner`, `signedMoney` — all already in scope in this file.
- Produces: nothing consumed elsewhere.

This task has no dependency on Tasks 1 or 2 and can be built in parallel with them. It is presentation-only: no form contract changes, so the page keeps working against both the old and the new backend.

After this task, the gift form renders in exactly these situations, and no others:

| `editSale.status` | match in the future | match kicked off |
|---|---|---|
| `PENDING` | gift form, "Mark gifted" | nothing |
| `GIFTED` | gift form, "Update recipient" | gift form, "Update recipient" |
| `SOLD` | nothing | nothing |
| `CANCELLED` | nothing | nothing |

Note the `GIFTED` row: the form stays available after kickoff. That is the D5/D10 recipient-update exemption, and it is the whole reason a CSV-imported gift can ever be given a recipient. `isPastMatch` gates the `PENDING` entry case only.

- [ ] **Step 1: Delete `confirmMarkGifted` entirely**

Remove the whole function at `:403-423` along with its preceding comment block ("SOLD -> GIFTED is a legitimate correction…"). It exists only to warn about `SOLD → GIFTED`, which is now illegal, so there is nothing left for it to confirm. Its only call site is the gift form's submit button, removed in Step 4.

Leave `confirmMarkSold` and `confirmRevert` untouched.

- [ ] **Step 2: Hide "Mark sold" on a `GIFTED` sale**

In the status-commit block, the current shape is `{#if editSale.status === 'SOLD'} … {:else} <Mark sold form> {/if}` — which renders "Mark sold" for `PENDING`, `CANCELLED` **and** `GIFTED`. `GIFTED → SOLD` is now illegal, so change the `{:else}` to an `{:else if}` and add a terminal arm:

```svelte
                {:else if editSale.status !== 'GIFTED'}
                    <form
```

…leaving that form's body exactly as it is, and add this arm immediately before the block's closing `{/if}`:

```svelte
                {:else}
                    <p class="text-sm text-ink">
                        <span class="font-medium text-gift-strong">Gifted</span>
                        <span class="text-ink-muted">·</span>
                        <span class="text-ink-muted">
                            a gifted sale is final — changing the status back needs a
                            manual fix. The recipient can still be changed below.
                        </span>
                    </p>
                {/if}
```

- [ ] **Step 3: Gate the gift form**

Replace the gift form's preceding comment block ("Always rendered, even once the sale is already GIFTED: …") with:

```svelte
                <!-- D5: GIFTED is reachable only from PENDING and is terminal,
                     and *entering* it is kickoff-guarded like SOLD. So the
                     entry case (a PENDING sale) is offered before kickoff only.
                     An already-GIFTED sale keeps the form at any time: that
                     request updates the recipient, moves no status, and is
                     exempt from the guard on purpose — a CSV-imported gift is
                     past-match with no recipient by construction, and this is
                     the only way to give it one (D10). A SOLD or CANCELLED sale
                     is never offered the form: the server would refuse it, and
                     an affordance that always fails is worse than none. -->
```

Wrap the existing `<form method="POST" action="?/update" class="space-y-2 border-t border-line pt-2" …>` … `</form>` in:

```svelte
                {#if editSale.status === 'GIFTED' || (editSale.status === 'PENDING' && !isPastMatch)}
```

…and close it with a plain `{/if}` after the form's `</form>`. No `{:else}` arm: when the condition is false there is simply no gift affordance.

Do not otherwise touch the form's internals — the `intent`, `status`, `previousStatus` and `hasRecipient` hidden inputs, the `required` expression on the combobox, the `<datalist>` wiring, and the three-way helper-text branch are all still correct for the two cases that remain.

- [ ] **Step 4: Remove the dead `onclick` on the gift submit button**

Inside that form, the submit button still carries `onclick={confirmMarkGifted}`. Delete that one attribute line; the button keeps every other attribute.

- [ ] **Step 5: Verify the page compiles and type-checks**

```bash
cd web && npm run check
```

Expected: no errors. In particular no "confirmMarkGifted is declared but never used" and no unclosed-block Svelte error — an unbalanced `{#if}` from Step 3 shows up here.

- [ ] **Step 6: Read the rendered panel back for each status**

There is no component test runner for `.svelte` files in this repo, so verify by inspection against the table at the top of this task: open the block in the editor and confirm, for each of the four statuses crossed with past/future kickoff, that exactly the listed affordance is reachable. Confirm specifically that a `CANCELLED` sale now shows "Mark sold" and no gift control; that a `SOLD` sale shows "Revert to pending" and no gift control; and that a **past-match `GIFTED`** sale still shows the recipient combobox with the "Update recipient" button.

- [ ] **Step 7: Commit**

```bash
git add web/src/routes/\(app\)/sales/+page.svelte
git commit -m "fix(web): stop offering gift transitions that D5 now rejects"
```

---

## Task 4: Frontend — retire the `CANCELLED → GIFTED` payload case and fix stale detail copy

**Files:**
- Modify: `web/src/routes/(app)/sales/read-payload.spec.ts:94-103` (delete one `describe`)
- Modify: `web/src/routes/(app)/sales/[saleId]/+page.svelte:185-202` (one copy string)

**Interfaces:**
- Consumes: `readPayload(form: FormData): { payload?: Record<string, unknown>; error?: string }` — unchanged by this plan.
- Produces: nothing.

`read-payload.ts` itself needs **no change**: it gates the recipient-required check on the form's `intent` field, not on the status, so it stays correct under the new matrix. Only the test that exercises a now-impossible transition, and one stale sentence of UI copy, need attention. This task is independent of Tasks 1-3.

- [ ] **Step 1: Delete the `CANCELLED → GIFTED` case**

In `web/src/routes/(app)/sales/read-payload.spec.ts`, delete the whole `describe('when transitioning from CANCELLED into GIFTED with no recipient name', …)` block. The transition is illegal server-side and the UI no longer renders a path to it, so the case is unreachable; the sibling `PENDING` block above it already covers the "no name supplied" branch of the helper.

Leave every other block in this file alone — in particular the already-`GIFTED` cases, which are live for recipient updates at any point in the sale's life.

- [ ] **Step 2: Run the web tests**

```bash
cd web && npm test
```

Expected: PASS, with one fewer test than before.

- [ ] **Step 3: Fix the stale detail-page copy**

In `web/src/routes/(app)/sales/[saleId]/+page.svelte`, the read-only status paragraph tells a `GIFTED` sale's reader to "change the recipient or status from the sales list" — the status half is no longer true. Replace that string branch with:

```svelte
                    {sale.status === 'CANCELLED'
                        ? 'managed automatically; saving here leaves it unchanged.'
                        : 'a gift is final; the recipient can still be changed from the sales list.'}
```

Leave the surrounding comment block's explanation of *why* neither status is offered in the `<select>` as it is — it is still accurate.

- [ ] **Step 4: Verify the detail page type-checks**

```bash
cd web && npm run check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/routes/\(app\)/sales/read-payload.spec.ts web/src/routes/\(app\)/sales/\[saleId\]/+page.svelte
git commit -m "fix(web): drop the CANCELLED-to-GIFTED case and correct gift copy"
```

---

## Task 5: Whole-system verification

**Files:** none modified. This task exists because the correction spans two deploy targets and the failure mode is a UI that offers something the API refuses.

- [ ] **Step 1: Run every gate**

```bash
npm test && npm run typecheck && npm run lint
cd web && npm test && npm run check
```

Expected: all green.

- [ ] **Step 2: Walk the matrix against the code**

Open `docs/specs/2026-09-11-gifted-sale-status-design.md` D5 alongside `src/api/sales/sales.service.ts`'s `LEGAL_TRANSITIONS` and `isKickoffGuarded`, and confirm every cell of the spec's table maps to the code, including the "not allowed" cells and the `GIFTED → GIFTED` "not kickoff-guarded" cell.

- [ ] **Step 3: Confirm the recipient-update path end to end**

The exemption is the piece most likely to be lost to a well-meaning simplification, and it has no integration test. Verify by reading, in order: `+page.svelte`'s gift-form condition renders for `GIFTED` with no `isPastMatch` term; `read-payload.ts` builds a `{ status: 'GIFTED', recipientName }` payload from `intent="gift"`; `isKickoffGuarded('GIFTED', 'GIFTED')` returns `false`; `resolveRecipient` returns `{ recipientName }`. All four must hold, or a CSV-imported gift can never be given a recipient.

- [ ] **Step 4: Grep for surviving stale rules**

```bash
grep -rn "GIFTED" src/api web/src --include=*.ts --include=*.svelte | grep -iv spec | grep -i "no kickoff\|no guard\|always legal"
```

Expected: no hits. Comments that describe the `GIFTED → GIFTED` exemption are correct and expected — do not remove them; this grep is tuned to miss them.

- [ ] **Step 5: Stage and hand off for review**

```bash
git status
```

Per this project's workflow, stop here: report that the work is staged/committed and ready for `/crit` before any merge or push.

---

## Parallelisation

**Backend and frontend are fully independent and can be built in parallel.** No task in Tasks 3-4 consumes a type, signature, or error code produced by Tasks 1-2: the frontend change is presentation-only (which affordances render), and the form contract — `intent`, `status`, `previousStatus`, `hasRecipient`, `recipientName` — is byte-identical before and after. Task 2 is also independent of Task 1 within the backend track, so the backend's two tasks can themselves run concurrently.

The only ordering that matters is a deployment one, not a build one: shipping the backend first means a stale web app briefly offers gift controls that now 400, while shipping the web app first means the controls disappear before the API starts refusing them. **Deploy the frontend first** — the interim state is "an affordance is missing" rather than "an affordance errors".

- Backend track: Task 1, Task 2
- Frontend track: Task 3, Task 4
- Both tracks must land before Task 5.

## Self-Review Notes

- **Spec coverage.** D5's entry-scoped kickoff guard → Task 1 Steps 6-7 (`isKickoffGuarded`). D5's transition matrix and `SALE_INVALID_STATUS_TRANSITION` → Task 1 Steps 1-2, 6. D5's `GIFTED → GIFTED` exemption → Task 1 Step 3's middle `describe`, Task 3's gate, Task 5 Step 3. D5's "pre-feature transitions unchanged" → Task 1 Step 4's last two `describe`s. D6/D11's dead-but-harmless clearing branches → Global Constraints (explicitly *not* touched). D9's recipient rules → unchanged code, comment refreshed in Task 1 Step 8. D10's CSV kickoff guard → Task 2; D10's attach-afterwards flow → preserved and pinned by Task 1 Step 3 and Task 3's table. The spec's combobox rendering rule → Task 3 Step 3.
- **Placeholders.** None: every code step carries the literal code, every command carries its expected output. The one judgement call left to the implementer is Task 2 Step 1's date literal, which is bounded and explicitly stated.
- **Type consistency.** `isLegalTransition` / `isKickoffGuarded` / `LEGAL_TRANSITIONS` / `SaleStatusName` / `SaleStatusTarget` / `ErrorCode.SALE_INVALID_STATUS_TRANSITION` / `resolveSoldAtStatus` are spelled identically at every mention.
