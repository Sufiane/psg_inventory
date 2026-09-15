# Gifted sale status — design

Date: 2026-09-11
Status: approved — revised 2026-09-12 twice and 2026-09-15 once (see *Revisions*)

## Revisions

**2026-09-12 — `GIFTED` transition rules corrected (D5, with knock-on edits to D6, D9,
D10, D11).** The original D5 gave `GIFTED` no kickoff guard and made it reachable from, and
escapable to, every other status. Post-implementation review found that wrong against the
actual business rules. `GIFTED` now carries a kickoff guard, is reachable only from `PENDING`,
and is terminal. Everything else in this document stands as originally approved; in particular
the pre-existing `SOLD → PENDING`, `CANCELLED → SOLD` and `CANCELLED → PENDING` transitions
are untouched by the correction.

*The scope of that guard was itself reconsidered once during this same revision round.* An
intermediate version had the guard fire on **any** request targeting `GIFTED`, including the
already-`GIFTED` recipient-update shape. That was rejected before implementation: it would
have silently killed the recipient combobox for CSV-imported and past-match gifts — the
control's primary use case. The guard is therefore scoped to genuine **entry** into `GIFTED`.
This paragraph exists so a later reader does not mistake the two framings for a contradiction
in the document's history; only the final, entry-scoped rule below is in force.

**2026-09-12 (second round) — the gift becomes its own row (D14–D19; supersedes the
storage half of D6, D7, D11 and D13).** The first implementation stored giftedness as two
nullable columns on `sales` — `recipient_id` and `gifted_at`. That shape cannot state its own
rule: nothing stops a `SOLD` row from carrying a `recipient_id`, and leaving `GIFTED` had to
remember to clear two columns by hand (D6/D11 both had to argue for keeping unreachable
clearing branches alive *precisely because* the shape allowed incoherent rows). Giftedness is
now an association row in a `gifts` table: **a sale is gifted if and only if it has a gift
row**, enforced by the database, not by discipline. The behavioural rules of D1–D5 and
D8–D10 are unchanged — same guard, same terminal status, same recipient resolve-or-create,
same CSV escape hatch. This is a storage and enforcement change, and it changes no API
response and no frontend file (D17).

**2026-09-15 (third round) — the gift's recipient and its date become mandatory (D9, D10,
D14; knock-on edits to D19, the scope table, the testing list and the non-goals).**
`gifts.recipient_id` and `gifts.gifted_at` were nullable for exactly one reason: CSV import
created gifts with neither. That single hole paid for an "already `GIFTED` but recipient-less"
branch in the api layer, a `hasRecipient` flag round-tripping through the web form to mirror
it, and a nullable field every read path had to render defensively. The CSV now carries a
**`recipient` column, required on `GIFTED` rows** — a `GIFTED` row without one is a row-level
import error — and a `GIFTED` row that supplies no date falls back to its match's date. Both
columns are therefore `NOT NULL`, and the recipient foreign key becomes `ON DELETE RESTRICT`
(`SET NULL` is not expressible against a non-null column, and `CASCADE` would delete the gift
row, silently un-gifting its sale). This round is a net **deletion** of code: the nullable
state it removes is the only thing those branches ever existed for.

Two things this round deliberately does *not* move. `SaleResponse.Recipient` stays `| null` —
non-null is a property of the gift row, and a sale that was never gifted has no gift row to
read a recipient from, so the wire shape of D17 is unchanged. And nothing here is a forward
migration: both migrations are still uncommitted and have only ever been applied to one local
database, so `20260911120100_add_recipients_and_gifts` is edited in place again, for the
reasons D19 already gives. `GIFTED` exists only in this unreleased branch, so no CSV anywhere
has a `GIFTED` row and the new required column breaks no existing import.

## Problem

A season-ticket holder does not only sell or fail to sell a ticket. Sometimes a ticket that
was listed for sale ends up **given to someone** — a friend, a colleague, family. Today the
ledger has no way to say that. The ticket sits `PENDING` until the match kicks off, the
`cancel-sales` cron flips it to `CANCELLED`, and it lands in the same bucket as a ticket
nobody wanted.

Those two outcomes are not the same thing. One is a market failure, the other is a decision.
Both are money that never arrived, so both belong in unrealized profit — but the ledger
should be able to tell them apart, and it should be able to answer "who did I give tickets
to?".

## Current model

`SaleStatus` (`src/prisma/schema.prisma`) has exactly three values, and the accounting layer
maps each one onto exactly one bucket:

| Accounting bucket (api) | `SaleStatus` (db) | Set by |
|---|---|---|
| `realized` | `SOLD` | user, `updateSale({ sold: true })` |
| `pending` | `PENDING` | `addSale` (initial state) |
| `unrealized` | `CANCELLED` | `cancel-sales` cron only — no manual path |

`statusConverter` (`src/api/accounting/utils/status-converter.util.ts`) is a total function
from one bucket name to one enum value, and `IAccountingDbService.getAccounting` takes a
single `SaleStatus`. Status changes ride on a **boolean**: `UpdateSaleDto.sold`, which
`SalesService.updateSale` (db layer, `src/db/sales/sales.service.ts:165-170`) turns into
`SOLD` or `PENDING`. `soldAt` / `cancelledAt` mirror the current status — set on entry into
the state, nulled on exit — with the full trail kept in `sale_histories`.

Two structural facts follow from that, and both are load-bearing for this change:

1. **One bucket = one status** is baked into the db signature. A bucket that spans two
   statuses needs the signature to take a list.
2. **A boolean cannot express three target states.** Adding a third manual state forces the
   update contract to change.

## Decisions

### D1 — The status is `GIFTED`, not `GIVEN`

`AccountingService.getGivenSeason` already uses "given" in the sense of *specified*. A
`GIVEN` status would collide with that reading in every grep and every sentence of code
review. `GIFTED` is unambiguous.

### D2 — `GIFTED` is inside the unrealized bucket, not beside it

`unrealized` becomes `CANCELLED + GIFTED`. Net profit, amortization, and every existing
figure keep their current meaning: a gifted ticket produced no cash, so it must not touch
realized profit, and it must not silently drop out of the unrealized total either.

Mechanically, `statusConverter` stops returning one value and returns a list:

```ts
export function statusConverter(status: AccountingStatus): SaleStatusName[] {
    switch (status) {
        case 'pending':     return ['PENDING'];
        case 'realized':    return ['SOLD'];
        case 'unrealized':  return ['CANCELLED', 'GIFTED'];
        case 'gifted':      return ['GIFTED'];
    }
}
```

`IAccountingDbService.getAccounting` and `ISalesDbService.getOneByWithFullMatch` take
`SaleStatus[]` and filter with `status: { in: … }`. The api layer still never imports Prisma
— it passes the literal string union, exactly as it does today.

**Unaffected by the D14 revision.** Accounting still buckets on `sales.status`; it never
reads the gift row. The `gifts` table adds no query, no join and no cache key to the
accounting path.

### D3 — `gifted` is a sub-bucket, reported under unrealized

`TimePeriodAccounting` gains `gifted: Accounting | null`. It is a **subset** of `unrealized`,
not a fourth peer, and every surface that renders it must say so ("of which gifted"), because
`unrealized.totalProfit` already includes it. Adding a separate `lost` bucket was rejected:
the only consumer would be a figure the user can read off the unrealized card minus the
gifted sub-line, and each extra bucket costs three queries per period on a cold cache.

`CACHE_KEYS.accounting` gets a `:v2` segment in the same change. Cached `TimePeriodAccounting`
payloads have a one-day TTL and predate the `gifted` field; without a key change, a user with
a warm cache would see `gifted === undefined` for up to 24h after deploy.

### D4 — Explicit `status` replaces the `sold` boolean, with a deprecation window

`UpdateSaleDto` gains `status?: 'PENDING' | 'SOLD' | 'GIFTED'` and keeps `sold?: boolean` as
a **deprecated alias** for one release. When both are present, `status` wins. `CANCELLED` is
deliberately not an accepted target: it stays cron-owned.

The alias exists because the backend (Railway) and the web app (Cloudflare Pages) deploy
separately. Without it, whichever ships first is broken until the other catches up. It also
means frontend work does not have to wait on backend work to keep the app running.

### D5 — Entering `SOLD` or `GIFTED` is kickoff-guarded; `GIFTED` is terminal

*Revised 2026-09-12. The original decision — "only `SOLD` keeps the kickoff guard", with
`GIFTED` reachable from and escapable to every status — was wrong against the real business
rules and is superseded by everything below.*

Giving a ticket away is a decision taken **before** the match, exactly like selling it. A gift
recorded after kickoff is not a late entry of a real event; it is a correction, and this
release deliberately offers no correction path for the status itself. So `SALE_AFTER_KICKOFF`
guards entry into either state:

```
target === 'SOLD'                                       →  guarded
target === 'GIFTED' && existing.status !== 'GIFTED'     →  guarded   (entry)
target === 'GIFTED' && existing.status === 'GIFTED'     →  exempt    (recipient update)
```

The guard is scoped to a genuine **transition** into `GIFTED`. A request that targets `GIFTED`
on a sale that is *already* `GIFTED` moves no status: it is the shape a recipient update takes
(D9), and recording who received a ticket is not a decision that has to precede the match. That
exemption is load-bearing, not a loophole — see D10. It applies only to this one cell; nothing
else about `GIFTED` is softened by it.

A request that omits `status` entirely (the edit-numbers form: price, invest, allocations)
targets nothing and is never guarded, so editing the numbers on a past gift keeps working.

`GIFTED` is reachable only from `PENDING`. `SOLD → GIFTED` and `CANCELLED → GIFTED` are
rejected. `GIFTED` is terminal: `GIFTED → PENDING` and `GIFTED → SOLD` are rejected too.
A user who marked the wrong sale as gifted needs a database-level fix; the app offers no undo
of the *status*. That is the accepted cost of keeping a single, unambiguous entry point into
the state. Note the asymmetry is deliberate: the recipient is freely correctable, the status
is not.

Legal manual transitions:

| From | To `PENDING` | To `SOLD` | To `GIFTED` |
|---|---|---|---|
| `PENDING` | no-op | before kickoff only | before kickoff only |
| `SOLD` | always | no-op | not allowed |
| `CANCELLED` | always | before kickoff only | not allowed |
| `GIFTED` | not allowed | not allowed | no-op — recipient update, **not** kickoff-guarded |

A transition the table marks "not allowed" is rejected with a new domain error,
`SALE_INVALID_STATUS_TRANSITION` (HTTP 400). None of the existing codes fits: this is neither
a missing sale nor a kickoff violation, and collapsing it into `SALE_AFTER_KICKOFF` would tell
the user something false about why the write was refused.

The pre-feature transitions are **unchanged** by this revision. `SOLD → PENDING` still always
works, and `CANCELLED → SOLD` / `CANCELLED → PENDING` still behave exactly as they did before
`GIFTED` existed. Only `GIFTED`'s own rules moved.

Reverting a past-kickoff sale to `PENDING` leaves it for the next cron run to re-cancel.
That is correct, not a bug: it returns the row to the state the system would have produced.
The `cancel-sales` cron selects on `status: PENDING` only, so a `GIFTED` row is never swept
into `CANCELLED` behind the user's back.

*Since D14, this matrix is also enforced one layer lower: the database physically refuses
`GIFTED → anything` while the gift row exists, and the db-layer signature that performs
ordinary status changes cannot express `GIFTED` at all. The api-layer matrix above stays —
it is what produces a correct error message — but it is no longer the only thing standing
between a bug and an incoherent row.*

### D6 — `giftedAt` mirrors the existing timestamp pattern

> **Superseded in part by D14 (2026-09-12).** `gifted_at` is no longer a column on `sales`;
> it lives on the gift row and disappears with it. The `timestampPatch` block therefore keeps
> its two branches (`soldAt`, `cancelledAt`) and never grows a third. The "dead-but-harmless
> clearing branch" argued for below no longer exists and must not be re-added — deleting the
> row *is* the clear. The reasoning is kept because it records why the column shape was
> rejected: it needed an unreachable branch to stay coherent.

`Sales.giftedAt` is set on entry into `GIFTED` and nulled on exit, exactly like `soldAt` and
`cancelledAt`. The `timestampPatch` block in the db layer grows a third branch. Consistency
here is cheap and the alternative (reading the transition out of `sale_histories`) is not
something any current surface does.

Since D5's revision, **no app-level path can exit `GIFTED`**, so the `giftedAt = null`
branch (and the matching `recipientId = null` clear in D11) is unreachable from the API. It
stays anyway, deliberately, for two reasons: the sanctioned repair path for a mistaken gift is
a manual database write, and a manual `UPDATE sales SET status = 'PENDING'` that routes
through the db layer should still leave the timestamp columns coherent rather than stranding a
`gifted_at` on a non-gifted row; and the branch is the symmetric half of a three-way pattern
whose other two halves are live, so deleting just this one would make the block harder to read
than leaving it. This is dead-but-harmless code by decision, not by oversight — do not "clean
it up" as unused.

### D7 — Recipients are a normalized per-user entity

```prisma
model Recipients {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  name      String
  User      Users    @relation(fields: [userId], references: [id])
  Gifts     Gifts[]
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt() @map("updated_at")

  @@unique([userId, name])
  @@map("recipients")
}
```

Scoping and naming follow `SeasonPasses`: plural model, `@map` snake_case columns, `userId`
FK to `Users`, index on the owner.

> **Revised by D14 (2026-09-12).** The back-relation is `Gifts Gifts[]`, not `Sales Sales[]`,
> and `Sales` gains no `recipientId` column, no `Recipient` relation and no
> `@@index([recipientId])` — the block above is the current shape. "All gifts to X" is still a
> single indexed query; the index that serves it is `gifts.recipient_id` instead.

Name only. No email, no phone, no notes: nothing else has a consumer, and a contact record
is a different feature.

### D8 — Create-on-write from the gift flow; no recipient CRUD

There is **no** `POST /recipients`. `updateSale` accepts either `recipientId` (existing
recipient picked from the list) or `recipientName` (new name typed into the combobox) and
resolves-or-creates inside `SalesService` in the same call that flips the status.

Rationale: one atomic write instead of two round-trips; an abandoned edit form cannot leave
an orphan recipient behind; and there is no separate screen to build, which is what the
create-on-write shape is for.

`GET /recipients` returns the user's recipients as `{ id, name, giftCount }`, ordered by
`giftCount` desc then `name` asc.

> **Revised by D14 (2026-09-12).** `giftCount` is a Prisma `_count` on the **`Gifts`**
> relation with **no `where` filter** — `_count: { select: { Gifts: true } }`. It used to be a
> `_count` on `Sales` filtered to `status: GIFTED`. The filter is gone because it is now
> structurally redundant: a gift row cannot exist against a non-`GIFTED` sale (D15). The count
> is correct by construction rather than by remembering to filter, which is the same
> improvement the whole D14 revision is about.

Name resolution rules, in `SalesService`:

- Trim, collapse internal whitespace runs to a single space.
- Reject empty after trimming (`SALE_GIFT_RECIPIENT_REQUIRED`).
- Look up case-insensitively (`mode: 'insensitive'`) before creating, so `marc` does not
  become a second `Marc`. Stored casing is whatever the user typed first.
- The `@@unique([userId, name])` index is case-**sensitive** and is therefore a backstop
  against exact duplicates only. That is acceptable: a single-user ledger has no concurrent
  writer to race with. Documented here so nobody later reads the index as a dedupe guarantee.

### D9 — A gift always has a recipient, in the API and in the database

*Revised 2026-09-15. The original decision required a recipient in the API but left the column
nullable, because CSV import (D10) created recipient-less gifts. D10 no longer does, so the
column is `NOT NULL` and the "gifted with no recipient yet" state does not exist.*

Transitioning to `GIFTED` through `POST /sales/update` without `recipientId` or a non-empty
`recipientName` throws `SALE_GIFT_RECIPIENT_REQUIRED`. `gifts.recipient_id` is `NOT NULL`:
no path — the API, CSV import, the seed script — can produce a gift without one.

A sale that is already `GIFTED` may resubmit `GIFTED` with a blank name and keep its current
recipient. That is a genuine no-op, not a request to clear the field, and since every gift now
has a recipient it is the *only* thing a blank name can mean on an already-`GIFTED` sale. The
former second case — "already `GIFTED` with no recipient yet, so a name is still required" —
describes a state that no longer exists. Its branch is deleted in three places: the
`existing.Gift?.recipientId != null` test in `SalesService.resolveExistingGiftRecipient`, the
`hasRecipient` half of the gate in `web/src/routes/(app)/sales/read-payload.ts`, and the
`|| editSale.Recipient == null` arm of the combobox's `required` attribute.

Both of those are already-`GIFTED` requests, so per D5 neither is kickoff-guarded: a recipient
can be corrected or reused at any time in the sale's life. The full resolve-or-create
behaviour of D8 — case-insensitive reuse of an existing recipient, create-on-write for a new
name — applies identically whether the match is in the future or long played.

The recipient relation is `ON DELETE RESTRICT` (D14). `SET NULL` cannot be expressed against a
non-null column, so the choice was forced; `CASCADE` was rejected outright, because deleting a
recipient would delete their gift rows, which would silently un-gift those sales and defeat the
composite foreign key of D15. No endpoint deletes a recipient today, so nothing observable
changes — the constraint is there so that if one is ever added, it has to deal with the gifts
first rather than quietly destroying them.

> **The wire shape does not move.** `SaleResponse.Recipient` stays `| null`. Non-null is a
> property of the *gift row*; a sale that was never gifted has no gift row, so the flattened
> `Recipient` it serves is still nullable and `web/src/lib/types.ts` is unchanged (D17).

### D10 — CSV import accepts `GIFTED`, and requires a recipient for it

*Revised 2026-09-15. The original decision imported gifts with no recipient and asked the user
to attach one afterwards from the sale edit panel. That escape hatch is withdrawn: it was the
sole producer of recipient-less gifts, and the state it created cost more everywhere else than
the column it saved.*

`SALE_ROW_STATUSES` gains `GIFTED`, the draft grid's status `<select>` gains the option, and
the CSV gains a **`recipient` column**:

- **Optional in the header, required per `GIFTED` row.** A file of `PENDING` / `SOLD` /
  `CANCELLED` rows needs no `recipient` header at all, exactly as it needs no `soldAt` header
  today. Adding it to `REQUIRED_COLUMNS` would reject every CSV that has ever been imported,
  for no gain.
- **A `GIFTED` row with a blank or absent `recipient` is a row-level error**,
  `error:gift-recipient-missing`, following the existing `error:*` `DraftRowStatus` convention
  in `sales-import.resolver.ts`. A row error, not a file error: one bad row must not reject the
  other forty, and the draft grid exists precisely so the user can fix it in place before
  committing.
- **A non-`GIFTED` row's `recipient` value is ignored**, the same way a `PENDING` row's
  `soldAt` is parsed, carried through the draft, and nulled at commit. Erroring on it would
  make a perfectly meaningful file — one gifted row, thirty-nine sold, a `recipient` column
  throughout — unimportable for no reason.
- **Names resolve through the same path the manual flow uses** (D8): `findOrCreateForUser`, on
  the import's own transaction, so a failed import leaves no orphan recipients behind and two
  rows naming the same person in different cases produce one recipient.

`gifts.gifted_at` is `NOT NULL`, and falls back to **the match's date** when a `GIFTED` row
supplies no `soldAt`. That fallback is always available: the resolver has already resolved a
`Match` for every row that can reach the writer — a row without one is `error:match-missing`
and never commits — so there is no case where a gift has no date to fall back to. "Given away,
date unknown" was never a fact worth recording; the match is the date the gift was *for*.

**The volume argument against resolving recipients during import no longer applies, because
there is no batch pass.** The original rejection assumed a bulk resolve-and-dedupe step.
`bulkCreate` already loops row by row inside one transaction; a gifted row simply resolves its
own recipient on that `tx` before inserting the gift row, exactly as `giftSale` does. A handful
of gifts per season costs a handful of indexed lookups.

**D5's guard stays scoped to entry**, for a reason that survives this revision even though its
original justification does not. Imported gifts are no longer recipient-less, but they are
still overwhelmingly for matches already played, and correcting *who* received a ticket is not
a decision that has to precede the match. A guard that fired on every `GIFTED`-targeting
request would make every imported gift's recipient permanently uncorrectable.

The *status* guard still applies to CSV import itself: a `GIFTED` row whose `soldAt` is later
than its match date is an error row, exactly as a `SOLD` row would be. (This is a correction —
the first implementation exempted `GIFTED` rows from that check, on the strength of the
original D5.) That check is day-level, because `soldAt` is a date-only column: gifted the same
day as the match is allowed, later days are not. Note the two rules are about different things:
a CSV row asserts *when the gift happened*, which must precede the match; correcting the
recipient later asserts *who received it*, which has no such constraint.

### D11 — Leaving `GIFTED` clears the recipient

> **Superseded by D14 (2026-09-12).** There is nothing to clear: leaving `GIFTED` means
> deleting the gift row, and the recipient link and the gift timestamp are columns *on that
> row*. The two-columns-to-remember-to-null problem this decision describes is the specific
> defect that motivated the revision. The surviving half of the rule is unchanged and restated
> in D14: the `recipients` row itself survives a deleted gift, and changing a gift's recipient
> is not an exit — it is an `UPDATE` of `gifts.recipient_id`.

`recipientId` and `giftedAt` are nulled on exit, same rule as `soldAt` / `cancelledAt`. The
recipient row itself survives (it may have other gifts, and it stays in the combobox).

As of D5's revision there is no app-level exit from `GIFTED`, so this clear is reachable only
through a database-level status change routed via the db layer. It stays for the same reason
D6's `giftedAt = null` branch stays. Changing a gift's recipient is not an exit and does not
go through this path: it overwrites `recipientId` with the newly resolved one.

### D12 — `GIFTED` gets its own color token

Existing semantics: `positive` = realized, `warning` = pending, `sunk` = cancelled,
`negative` = loss. A gift is none of those — it is money deliberately not taken. Per
PRODUCT.md, color carries semantic weight, so reusing `sunk` would state something false.

New token pair in `web/src/app.css`, both themes, hue ~210 (clear of `positive` 155,
`warning` 70, `sunk` 320, `primary` 270):

```css
/* light */  --color-gift: oklch(0.50 0.10 210);  --color-gift-strong: oklch(0.43 0.11 210);
/* dark */   --color-gift: oklch(0.74 0.11 210);  --color-gift-strong: oklch(0.82 0.12 210);
```

These are starting values: the implementer must verify ≥4.5:1 against `--color-surface` in
both themes and adjust lightness if short. The status pill carries the literal text `GIFTED`,
so color is never the only signal.

`profitTone` returns `text-gift` for `GIFTED` — like `CANCELLED`, the arithmetic sign is
suppressed because the number is not realized cash.

### D13 — Two migrations, in order

PostgreSQL cannot use a new enum label in the same transaction that adds it, and Prisma runs
each migration file in a transaction. So:

1. `add_gifted_sale_status` — `ALTER TYPE "SaleStatus" ADD VALUE 'GIFTED';` and nothing else.
2. `add_recipients` — `recipients` table, `sales.recipient_id` + FK + index,
   `sales.gifted_at`.

No backfill: no existing `CANCELLED` row can be reclassified without the user saying so.

> **Revised by D19 (2026-09-12).** The two-migration split and its reason survive verbatim;
> only the *content* of the second file changes, and it is renamed
> `add_recipients_and_gifts`. See D19.

### D14 — Giftedness is an association row, not two columns on the sale

*New, 2026-09-12. Supersedes the storage half of D6, D7 and D11.*

A sale is gifted **if and only if** it has a row in `gifts`:

```prisma
model Gifts {
  id          String      @id @default(uuid())
  saleId      String      @unique @map("sale_id")
  saleStatus  SaleStatus  @default(GIFTED) @map("sale_status")
  recipientId String      @map("recipient_id")
  giftedAt    DateTime    @map("gifted_at")
  createdAt   DateTime    @default(now()) @map("created_at")
  updatedAt   DateTime    @updatedAt() @map("updated_at")
  Sale        Sales       @relation(fields: [saleId, saleStatus], references: [id, status], onDelete: Cascade, onUpdate: Restrict)
  Recipient   Recipients  @relation(fields: [recipientId], references: [id], onDelete: Restrict)

  @@unique([saleId, saleStatus])
  @@index([recipientId])
  @@map("gifts")
}
```

`Sales` loses `recipientId`, `giftedAt`, the `Recipient` relation and `@@index([recipientId])`.
It gains `Gift Gifts?` and `@@unique([id, status])` — the composite key D15's foreign key
points at.

Why the columns had to go, stated plainly: a nullable `sales.recipient_id` lets the database
hold a `SOLD` row with a recipient, or a `GIFTED` row that lost its recipient but kept its
timestamp. Nothing in the schema says those are wrong. Both D6 and D11 ended up arguing for
keeping *unreachable code* alive so that a manual repair would not strand one of the two
columns — that argument is the smell. With the association row there is one fact in one place:
delete it and the recipient, the timestamp and the giftedness go together, because they are
the same row.

Field notes:

- **`recipient_id` is `NOT NULL`** *(revised 2026-09-15; it was nullable when D14 was
  written)*. Every writer resolves a recipient: `giftSale` demands one (D9), `updateGift` can
  only overwrite one, and CSV import now carries a `recipient` column (D10). The foreign key is
  `ON DELETE RESTRICT` — `SET NULL` cannot be expressed against a non-null column, and
  `CASCADE` would delete the gift itself, which is precisely the outcome the original
  `SET NULL` existed to prevent. The gift — the fact that the ticket was given away — must
  outlive any tidy-up of the recipient list.
- **`gifted_at` is `NOT NULL`** *(revised 2026-09-15; it was nullable when D14 was written)*.
  The manual flow stamps `now()`; CSV import uses the row's date, or the match's date when the
  row gives none (D10). A gift row with no date is no longer representable, so no surface has
  to render "given away, date unknown".
- **`sale_status` is a constraint carrier, not data.** It is always `'GIFTED'`, pinned by a
  `CHECK`, and exists only so the foreign key can be composite (D15). Do not read it, do not
  render it, do not "normalize it away" — removing it removes the guarantee.
- **One gift per sale**, from `@unique` on `sale_id`. A sale given to two people is not a
  thing this ledger models.

`Gifts` over `SaleGifts`: the association is also an entity in its own right ("a gift"), it
reads correctly at every call site (`sale.Gift.Recipient.name`), and the `SalePassAllocations`
naming precedent applies to a many-to-many join row, which this is not.

### D15 — The invariant is enforced three times, in three different layers

The rule is: *a `gifts` row exists ⟺ `sales.status = 'GIFTED'`.* It is guarded at three
levels, deliberately redundant, because the user's standing instruction for this app is to
prefer structural guarantees over conventions.

**1. The database refuses incoherent rows.** `gifts` carries a constant `sale_status` column
with `CHECK (sale_status = 'GIFTED')`, and a composite foreign key
`(sale_id, sale_status) → sales(id, status)` with `ON UPDATE RESTRICT`. Two consequences,
both free:

- A gift row can only be inserted against a sale whose status is *already* `GIFTED`. There is
  no ordering in which a gift row attaches to a `SOLD` or `PENDING` sale.
- A `GIFTED` sale **cannot** have its status changed while its gift row exists — Postgres
  raises a foreign-key violation. `UPDATE sales SET status = 'PENDING' WHERE id = …` typed
  straight into psql now fails loudly instead of silently orphaning a recipient. That is the
  exact failure mode this revision was called for, and it is now impossible rather than
  discouraged.

`ON UPDATE RESTRICT` only fires when the referenced key actually changes value, so a
`GIFTED → GIFTED` resubmit (the recipient-update shape, D9) and any edit of price, invest or
allocations on a gifted sale are unaffected.

**2. The db-layer signature cannot express the wrong write.** `ISalesDbService.updateSale`
narrows its status parameter to `'PENDING' | 'SOLD'`. The generic update path *cannot type* a
transition into `GIFTED`. Giftedness moves only through three purpose-built methods, each of
which does both writes in a single `$transaction`:

| Method | What it does, atomically |
|---|---|
| `giftSale` | sets `status = 'GIFTED'`, inserts the gift row (resolving or creating the recipient on the same `tx`), applies any field patch, writes the history row |
| `updateGift` | updates `gifts.recipient_id` only — no status write at all — plus any field patch |
| `ungiftSale` | deletes the gift row **and** sets `status = 'PENDING'`, in that order, in one transaction |

The order inside `ungiftSale` is not a convention either: the database enforces it. Flip the
status first and the foreign key rejects the statement.

**3. The api layer keeps the transition matrix** of D5, unchanged. It is what turns an illegal
move into `SALE_INVALID_STATUS_TRANSITION` with a sentence the user can read, rather than a
Postgres error. It is now a *messaging* layer over a guarantee, not the guarantee itself.

Rejected alternative: a deferrable constraint trigger to also enforce the reverse direction
(`status = 'GIFTED'` ⟹ a gift row exists) at commit time. Layer 2 already closes that
direction — `giftSale` is the only code that can produce a `GIFTED` sale and it always writes
both — and a trigger is invisible to `schema.prisma`, survives no `prisma db push`, and costs
a reviewer more than it buys. Revisit if a second writer (an admin tool, a second service)
ever gets direct table access.

### D16 — Exit from `GIFTED` is a supported command, not a hand-written `UPDATE`

D5 keeps `GIFTED` terminal in the app, and that stands: no controller route reaches
`ungiftSale`. But "needs a database-level fix" should not mean "type two statements in the
right order and hope". Since D15 makes the naive single statement fail outright, the repair
path gets a real front door:

- `ISalesDbService.ungiftSale(userId, saleId)` — the atomic pair from D15.
- `SalesService.ungiftSale(userId, saleId)` in the api layer — orchestration and cache
  invalidation (sales, accounting, recipients), exactly what `updateSale` does. Deliberately
  **not** wired to any controller; the comment above it says so.
- `scripts/ungift-sale.ts` — a one-command operator entry point, in the shape of
  `scripts/seed-demo.ts`.

This is the one piece of new surface area this revision adds. It is justified: the alternative
is an operator holding the invariant in their head at the exact moment the app has decided not
to help them.

### D17 — The API response shape does not change; no frontend file changes

The sale payload keeps `giftedAt` and a nested `Recipient` at the top level, exactly as it
serves them today. The api layer flattens the joined `Gift` on the way out:

```
db shape:   { …sale, Gift: { giftedAt, Recipient: { id, name } } | null }
api shape:  { …sale, giftedAt: Date | null, Recipient: { id, name } | null }
```

Applied in both read paths — `getSales` / `getCurrentSeasonSales` / `getSeasonSales` (via the
existing `formatSale`) and `getSale` (the detail endpoint, which returns the db shape today
and therefore needs the same flattening).

Three reasons this is right rather than lazy:

- Storage shape and wire shape are different concerns. The frontend asks "when was this
  gifted and who got it"; that it is now one join away is not its problem.
- Railway and Cloudflare Pages deploy independently. A response-shape change would need a
  coordinated deploy — the same problem D4 invented a deprecated alias to avoid. Keeping the
  shape means the backend ships alone, with the web app untouched and unredeployed.
- `web/src/lib/types.ts` (`SaleListItem.giftedAt`, `SaleDetail.Recipient`, `SaleRecipient`),
  `read-payload.ts`'s `hasRecipient` flag, the combobox and both sale routes all keep
  compiling and behaving identically. **This redesign changes zero files under `web/`.**

> **Still true as written, 2026-09-15.** The claim above is scoped to the *D14 redesign*:
> moving giftedness into its own row changed zero files under `web/`, and still does. The
> 2026-09-15 revision does touch `web/` — a `recipient` column in the import draft grid, and
> the deletion of the `hasRecipient` flag — but for its own reasons, not because the wire shape
> moved. It does not: `SaleResponse.giftedAt` and `SaleResponse.Recipient` are both still
> nullable, because a non-gifted sale has no gift row (D9).

If a `gift: { giftedAt, recipient }` object is ever wanted on the wire, it is an additive
change made later, on its own merits.

One cache consequence, since the *db-layer* shape does change: `CACHE_KEYS.sale`, `.sales` and
`.salesByRange` get a `:v2` segment, for the same reason D3 versioned the accounting key. A
warm cache holding pre-change `Sale` payloads would flatten to `giftedAt: null` /
`Recipient: null` for up to an hour. `invalidateSales`'s pattern still matches the versioned
keys.

### D18 — What the redesign does *not* touch

Stated explicitly because the blast radius looks bigger than it is:

- **Accounting**, including the "of which gifted" sub-bucket and its cache keys: buckets on
  `sales.status`, never on the gift row. Zero changes (D2, D3).
- **The transition matrix, the kickoff guard and their tests** (D5): api-layer logic over
  `existing.status`, which still exists and still means the same thing.
- **`sale_histories`**: keeps recording `status` only. It never had a `recipient_id` and does
  not gain one — the gift row's `created_at` / `updated_at` carry what little history a gift
  has.
- **The `cancel-sales` cron**: selects `status: PENDING`, which no gifted sale can be.
- **The recipient combobox, `GET /recipients`, and the `RecipientListItem` contract**: only
  the `_count` relation underneath changes (D8).
- **The ask-feature context and system prompt**: consume accounting buckets, not sale columns.

### D19 — The migration is rewritten in place, not forward-fixed

The `GIFTED` feature is **unreleased**: both migrations exist only in the working tree, on one
developer's laptop, applied to one local Postgres. `origin/main` has neither, and no
deployment has ever run them.

So `20260911120100_add_recipients` is edited in place and renamed
`20260911120100_add_recipients_and_gifts`: it creates `recipients` and `gifts`, and never
creates `sales.recipient_id` or `sales.gifted_at`. `20260911120000_add_gifted_sale_status` is
untouched — the enum-then-use split of D13 is still required.

The alternative (a third migration that creates `gifts`, backfills from the two columns, then
drops them) was rejected: the rule it honours — never edit an applied migration — exists to
protect databases that cannot be reset, and there are none. It would write a backfill of zero
production rows into the repository's permanent history, and leave every future reader of the
migration folder to work out that the columns it adds are dropped two files later.

The cost, accepted: `npx prisma migrate reset` plus a reseed locally, and the checksum of the
edited migration changes — anyone else holding a dev database created from the old file must
reset too. There is nobody else.

> **Applied a second time, 2026-09-15.** The non-null `recipient_id` / `gifted_at` change and
> the `ON DELETE RESTRICT` swap edit the *same* file in place rather than adding an
> `ALTER TABLE`, on exactly the reasoning above: the migration is still uncommitted, still
> applied to one local database only, and a forward-fix would write a backfill of zero rows
> into permanent history. `npx prisma migrate reset` plus a reseed is the accepted cost, again.
> `20260911120000_add_gifted_sale_status` remains untouched.

## Scope of change

**Backend (`src/`)**

| File | Change |
|---|---|
| `src/prisma/schema.prisma` | `GIFTED` enum value; `Recipients` model; **`Gifts` model** with non-null `recipientId` / `giftedAt` and `onDelete: Restrict` on `Recipient`; `Sales.Gift` + `@@unique([id, status])`; `Users.Recipients` back-relation |
| `src/prisma/migrations/*` | Two migrations (D13, D19) — the second rewritten to create `recipients` + `gifts` |
| `src/api/accounting/types/accounting-status.type.ts` | `'gifted'` added to `AccountingStatus` |
| `src/api/accounting/utils/status-converter.util.ts` | Returns `SaleStatusName[]` |
| `src/api/accounting/types/time-period-accounting.type.ts` | `gifted: Accounting \| null` |
| `src/api/accounting/accounting.service.ts` | Fourth `getAccounting` call in the `Promise.all`; `gifted` in the result and in the empty fallback |
| `src/db/accounting/accounting.db.interface.ts`, `src/db/accounting/accounting.service.ts` | `status: SaleStatus[]` → `{ in: … }`. **No further change from D14** |
| `src/db/sales/sales.query.ts` | Includes the joined `Gift` (with its `Recipient`) instead of the sale's own `Recipient` |
| `src/db/sales/type/sale.type.ts` | `Gift` override replaces `recipientId` / `Recipient`; both are non-null inside `Gift` |
| `src/db/sales/sales.db.interface.ts` | `updateSale.status` narrowed to `'PENDING' \| 'SOLD'`; `giftSale`, `updateGift`, `ungiftSale` added; `updateGift` returns `{ recipientId: RecipientId }` (no longer nullable) |
| `src/db/sales/sales.service.ts` | The three gift methods, each one `$transaction`; shared field-patch / history helper; `timestampPatch` keeps two branches; `deleteSale` drops the gift row |
| `src/api/sales/dto/update-sale.dto.ts` | `status?`, `recipientId?`, `recipientName?`, deprecated `sold?` — unchanged by D14 |
| `src/api/sales/sales.service.ts` | Transition-legality check (D5 matrix); kickoff guard; recipient resolve-or-create; routes to `giftSale` / `updateGift` / `updateSale`; flattens `Gift` on read; `ungiftSale` orchestration (D16). The recipient-less branch of `resolveExistingGiftRecipient` is **deleted** (D9) |
| `src/api/sales/interfaces/sales.service.interface.ts` | Response type reflects the flattened shape (D17) |
| `src/api/recipients/*` | `RecipientsController`, `RecipientsService`, interface, DTOs — **unchanged by D14** |
| `src/db/recipients/*` | `_count` on `Gifts` with no filter (D8); everything else unchanged |
| `src/common/exceptions/error-codes.enum.ts`, `src/common/exceptions/http-exception.mapper.ts` | `SALE_GIFT_RECIPIENT_REQUIRED`, `SALE_GIFT_RECIPIENT_NOT_FOUND`, `SALE_INVALID_STATUS_TRANSITION` |
| `src/redis/CACHE_KEYS.ts` | `accounting` key `:v2`; recipients list key + invalidation; **`sale` / `sales` / `salesByRange` `:v2` (D17)** |
| `src/api/sales-import/sales-import.csv.ts` | `GIFTED` in `SALE_ROW_STATUSES`; optional `recipient` column parsed onto `RawImportRow` (D10) |
| `src/api/sales-import/dto/draft-row.dto.ts` | `recipient?` on `DraftRowDto` (same name as the CSV column, as every other draft field is); `error:gift-recipient-missing` in `DRAFT_ROW_STATUSES` |
| `src/api/sales-import/sales-import.resolver.ts` | `resolveSoldAtStatus` applies the kickoff guard to `GIFTED` rows on the same terms as every other status; a `GIFTED` row with no recipient is `error:gift-recipient-missing`, in both `resolveDraftRows` and `validateCommitRows` (D10) |
| `src/api/sales-import/sales-import.service.ts` | `commit` maps each `GIFTED` row to a gift payload: the resolved recipient name, and `giftedAt` falling back to the match's date (D10) |
| `src/db/sales-import/sales-import.db.interface.ts` | `BulkSaleInput` carries the gift as one non-null-or-absent object instead of a bare nullable `giftedAt` |
| `src/db/sales-import/sales-import.service.ts` | `bulkCreate` resolves-or-creates the recipient on its own `tx` and creates the gift row alongside a `GIFTED` sale; `deleteBatch` drops gift rows |
| `src/api/ask/prompts/system-prompt.ts`, `src/api/ask/context/*` | Explain `gifted ⊂ unrealized` to the model |
| `scripts/seed-demo.ts` | Seeds gifts as rows, not columns |
| `scripts/ungift-sale.ts` (new) | Operator entry point for the sanctioned manual repair (D16) |

**Frontend (`web/`)**

Everything below was delivered by the original `GIFTED` release. **The D14 revision changed
none of it** — see D17. The 2026-09-15 revision touches four of them, marked *(2026-09-15)*.

| File | Change |
|---|---|
| `web/src/lib/types.ts` | `SaleStatus` += `'GIFTED'`; `giftedAt`, `Recipient` on `SaleListItem` / `SaleDetail`; `gifted` on the accounting type; `Recipient` type |
| `web/src/lib/types/sales-import.ts` | `SaleStatus` += `'GIFTED'`; *(2026-09-15)* `recipient?` on `DraftRow`, `error:gift-recipient-missing` in `DraftRowStatus` |
| `web/src/app.css` | `--color-gift` / `--color-gift-strong`, both themes |
| `web/src/routes/(app)/sales/+page.svelte` | `statusPill` / `profitTone` arms; gift form rendered only where a gift transition is legal (D5); recipient combobox; hidden `sold` inputs become `status`. *(2026-09-15)* the `hasRecipient` hidden input and the `\|\| editSale.Recipient == null` arm of `required` are **deleted** (D9) |
| `web/src/routes/(app)/sales/+page.server.ts`, `web/src/routes/(app)/sales/read-payload.ts` | Pass `status`, `recipientId`, `recipientName`; load recipients; recipient-required gating by form `intent`. *(2026-09-15)* the `hasRecipient` read and its half of the gate are **deleted** (D9) |
| `web/src/routes/(app)/sales/[saleId]/+page.svelte` | `profitTone` arm; recipient + `giftedAt` rows; `GIFTED` rendered read-only |
| `web/src/lib/ui/ImportSalesDraft.svelte` | `GIFTED` option in the status `<select>`; *(2026-09-15)* a Recipient column, editable per row, so a `error:gift-recipient-missing` row can be fixed in place |
| `web/src/lib/ui/ImportSalesModal.svelte` | *(2026-09-15)* the upload screen's column hint lists `recipient` and says it is required for `GIFTED` rows |
| `web/src/lib/ui/AccountingCard.svelte` + accounting/dashboard pages | "of which gifted" sub-line under Unrealized |

## Recipient combobox

Native `<input list>` + `<datalist>`, populated from `GET /recipients`, with the selected id
resolved server-side in the form action:

- Typing an existing name resolves to that recipient (case-insensitive), not a duplicate.
- Typing a new name creates it on submit.
- No JS required for the happy path — it degrades to a plain text input, which is exactly the
  progressive-enhancement posture the rest of the sales screen already takes with form
  actions.
- The form action sends `recipientName` only. Sending an id would mean tracking selection
  state in the client for no behavioral gain, since the backend resolves names anyway.
- The combobox is rendered where a `GIFTED`-targeting request can actually succeed: on a
  `PENDING` sale **before kickoff** (entry), and on an already-`GIFTED` sale **at any time**
  (correcting or reusing the recipient — D9, D10). It is not offered on a `SOLD` or
  `CANCELLED` sale, nor on a `PENDING` sale whose match has been played: per D5 those would be
  refused server-side, and an affordance that always fails is worse than no affordance.
- The input is `required` on **entry** into `GIFTED` and not otherwise. Since 2026-09-15 that
  is a single condition — `editSale.status !== 'GIFTED'` — because an already-`GIFTED` sale
  always has a recipient, so a blank submit can only mean "keep it" (D9). The second arm of
  that condition, and the `hasRecipient` hidden field that mirrored it server-side, are gone.

## Testing

Backend only for `src/`; `web/` unit-tests the pure form-payload helper.

- `status-converter.util.spec.ts` — each bucket, including `unrealized` returning both values.
- `sales.service.spec.ts` (api) — a `describe` per condition: when the target is `SOLD` and the
  match has kicked off (rejects); when the target is `GIFTED` from `PENDING` and the match has
  kicked off (rejects); when the target is `GIFTED` and the sale is **already** `GIFTED` and
  the match has kicked off (allows — the recipient-update exemption); when the target is
  `GIFTED` from `SOLD` or `CANCELLED` (rejects, `SALE_INVALID_STATUS_TRANSITION`); when the
  sale is `GIFTED` and the target is `PENDING` or `SOLD` (rejects, same code); when no `status`
  is sent at all on a past-kickoff gift (allows); when `GIFTED` arrives with no recipient
  (throws `SALE_GIFT_RECIPIENT_REQUIRED`); when `recipientName` matches an existing recipient
  in a different case (reuses it); when it does not (creates one); when only the deprecated
  `sold` is sent (still works); when both are sent (`status` wins). The case "already `GIFTED`
  but with no recipient, so a blank name is rejected" is **deleted** as of 2026-09-15 — that
  state no longer exists (D9). Plus, for D14: when the
  target is `GIFTED` from `PENDING` (calls `giftSale`, never `updateSale`); when the sale is
  already `GIFTED` and a recipient is supplied (calls `updateGift`, and the call carries no
  status); when a sale is read (the `Gift` join is flattened to `giftedAt` / `Recipient`,
  including the null case).
- `src/db/sales/sales.service.spec.ts` — `giftSale` writes the status and the gift row on the
  same `tx`; `updateGift` touches no status; `ungiftSale` deletes the gift row before flipping
  the status; `deleteSale` removes the gift row; the `timestampPatch` block still has exactly
  its `soldAt` and `cancelledAt` branches.
- **A real-database constraint check** (docker-compose Postgres, `npm run local:db:up`),
  recorded as a scripted psql verification rather than a Jest suite, since the repo has no
  integration-test harness: inserting a gift row against a `PENDING` sale fails; updating a
  gifted sale's status while its gift row exists fails; updating that sale's `listed_price`
  succeeds; re-writing its status as `'GIFTED'` succeeds; deleting the gift row then flipping
  the status succeeds.
- `accounting.service.spec.ts` — `gifted` present in the result; `unrealized` spans both
  statuses; empty fallback includes `gifted: null`.
- `sales-import.csv.spec.ts` — a `GIFTED` row parses; a `recipient` column parses onto the
  row; a file with no `recipient` header still parses; `recipient` is not rejected as an
  unknown column.
- `sales-import.resolver.spec.ts` — a `GIFTED` row with `soldAt` after the match date is an
  `error:sold-after-kickoff` row, same as a `SOLD` row. Plus, for 2026-09-15: a `describe` per
  condition — when the row is `GIFTED` with no recipient (`error:gift-recipient-missing`); when
  it is `GIFTED` with a whitespace-only recipient (same); when it is `GIFTED` with a recipient
  (`ok`); when it is `SOLD` with a recipient (`ok` — the value is ignored, not an error). The
  same four in `validateCommitRows`, since a tampered draft must not slip past commit.
- `sales-import.service.spec.ts` (api) — when a `GIFTED` row carries a date, it becomes
  `giftedAt`; when it carries none, `giftedAt` is the match's date, never null; the recipient
  name reaches `bulkCreate`. The existing "leaves `giftedAt` null" cases are **deleted** — the
  state they assert is gone.
- `sales-import.service.spec.ts` (db) — a committed `GIFTED` row resolves its recipient on the
  transaction and produces a gift row carrying both the recipient id and the date; a `SOLD` row
  produces none and resolves no recipient.
- `recipients` service specs — list ordering, resolve-or-create, per-user scoping (one user's
  recipients are never visible to another), `giftCount` counting gift rows.
- `read-payload.spec.ts` — recipient-required gating keyed on the form `intent`, for the
  transitions that remain legal. As of 2026-09-15 the two "already `GIFTED` with no recipient
  (CSV import)" cases are **deleted** and the `hasRecipient` field drops out of every fixture;
  what remains is: entry into `GIFTED` with no name (rejected), entry with a name (accepted),
  already-`GIFTED` with a blank name (accepted, keeps the current recipient), and the
  edit-numbers form (never gated).

## Non-goals

- Gifts-by-recipient leaderboard or any aggregation UI. The schema supports it; the screen is
  a separate decision once real data exists.
- Recipient rename / delete / merge CRUD.
- Anything in CSV import beyond one name per gifted row: no recipient id column, no
  per-recipient bulk editing from the import screen (D10, revised 2026-09-15 — the column
  itself is now in scope and required).
- Contact details on a recipient (D7).
- Reclassifying historical `CANCELLED` rows (D13).
- Any in-app undo or correction of a sale's `GIFTED` **status** once set (D5). That is a
  database-level fix, and since D16 it is a scripted one. Correcting the gift's **recipient**
  is fully supported and is not covered by this non-goal.
- More than one recipient per gift, or more than one gift per sale (D14).
- A `gift` object on the wire. The API keeps serving `giftedAt` / `Recipient` flattened onto
  the sale (D17).
