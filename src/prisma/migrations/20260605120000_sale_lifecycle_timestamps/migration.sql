-- Sale lifecycle timestamps
--
-- Adds created_at/updated_at/sold_at/cancelled_at to `sales` and created_at to
-- `sale_histories`. Backfills with best-effort heuristics: for existing sales we
-- can't recover the true listing instant, so we derive it from the earliest
-- known history row (the row prisma writes on every mutation) and fall back to
-- `match.date - INTERVAL '7 days'` when no history exists.
--
-- `sold_at` / `cancelled_at` mirror the row's CURRENT status: they are set when
-- the sale is in SOLD / CANCELLED today, and null otherwise. Source of truth
-- for the full transition trail remains `sale_histories`.

------------------------------------------------------------------------------
-- 1. sale_histories.created_at: required for the sales backfill below.
------------------------------------------------------------------------------

ALTER TABLE "sale_histories"
    ADD COLUMN "created_at" TIMESTAMP(3);

-- Order rows within each sale by id (stable surrogate for insertion order)
-- and stamp them with monotonically-increasing synthetic timestamps anchored
-- on the epoch. The exact wall-clock is unknown for historical rows; relative
-- ordering is what the audit trail needs.
WITH ordered AS (
    SELECT
        id,
        ROW_NUMBER() OVER (PARTITION BY sale_id ORDER BY id) AS rn
    FROM "sale_histories"
)
UPDATE "sale_histories" sh
SET "created_at" = TIMESTAMP 'epoch' + (ordered.rn || ' seconds')::interval
FROM ordered
WHERE sh.id = ordered.id;

ALTER TABLE "sale_histories"
    ALTER COLUMN "created_at" SET NOT NULL,
    ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "sale_histories_sale_id_created_at_idx"
    ON "sale_histories" ("sale_id", "created_at");

------------------------------------------------------------------------------
-- 2. sales.created_at / updated_at / sold_at / cancelled_at
------------------------------------------------------------------------------

ALTER TABLE "sales"
    ADD COLUMN "created_at"   TIMESTAMP(3),
    ADD COLUMN "updated_at"   TIMESTAMP(3),
    ADD COLUMN "sold_at"      TIMESTAMP(3),
    ADD COLUMN "cancelled_at" TIMESTAMP(3);

-- created_at: earliest history row for the sale, else match.date - 7 days,
-- else now(). Imperfect for legacy rows; documented heuristic.
UPDATE "sales" s
SET "created_at" = COALESCE(
        (SELECT MIN(sh."created_at") FROM "sale_histories" sh WHERE sh.sale_id = s.id),
        (SELECT m."date" - INTERVAL '7 days' FROM "matches" m WHERE m.id = s.match_id),
        CURRENT_TIMESTAMP
    );

UPDATE "sales"
SET "updated_at" = "created_at";

-- sold_at / cancelled_at reflect the CURRENT status only. Pulled from the
-- latest history row that matches the current state.
UPDATE "sales" s
SET "sold_at" = (
    SELECT MAX(sh."created_at")
    FROM "sale_histories" sh
    WHERE sh.sale_id = s.id AND sh.status = 'SOLD'
)
WHERE s.status = 'SOLD';

UPDATE "sales" s
SET "cancelled_at" = (
    SELECT MAX(sh."created_at")
    FROM "sale_histories" sh
    WHERE sh.sale_id = s.id AND sh.status = 'CANCELLED'
)
WHERE s.status = 'CANCELLED';

ALTER TABLE "sales"
    ALTER COLUMN "created_at" SET NOT NULL,
    ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP,
    ALTER COLUMN "updated_at" SET NOT NULL,
    ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
