-- 1. SeasonPasses: add label + tighten seat fields, drop unique constraint.
ALTER TABLE "season_passes" ADD COLUMN "label" TEXT;

UPDATE "season_passes" SET "label" = 'Pass ' || "season_start_year" WHERE "label" IS NULL;
UPDATE "season_passes" SET "category" = COALESCE("category", '-');
UPDATE "season_passes" SET "row" = COALESCE("row", '-');
UPDATE "season_passes" SET "seat" = COALESCE("seat", '-');

ALTER TABLE "season_passes" ALTER COLUMN "label" SET NOT NULL;
ALTER TABLE "season_passes" ALTER COLUMN "category" SET NOT NULL;
ALTER TABLE "season_passes" ALTER COLUMN "row" SET NOT NULL;
ALTER TABLE "season_passes" ALTER COLUMN "seat" SET NOT NULL;

DROP INDEX IF EXISTS "season_passes_user_id_season_start_year_key";
CREATE INDEX "season_passes_user_id_season_start_year_idx" ON "season_passes"("user_id", "season_start_year");

-- 2. SalePassAllocations table.
CREATE TABLE "sale_pass_allocations" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "season_pass_id" TEXT NOT NULL,
    "nb_tickets" INTEGER NOT NULL,

    CONSTRAINT "sale_pass_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sale_pass_allocations_sale_id_season_pass_id_key" ON "sale_pass_allocations"("sale_id", "season_pass_id");
CREATE INDEX "sale_pass_allocations_season_pass_id_idx" ON "sale_pass_allocations"("season_pass_id");

ALTER TABLE "sale_pass_allocations" ADD CONSTRAINT "sale_pass_allocations_sale_id_fkey"
    FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_pass_allocations" ADD CONSTRAINT "sale_pass_allocations_season_pass_id_fkey"
    FOREIGN KEY ("season_pass_id") REFERENCES "season_passes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Backfill: each existing sale gets one allocation against the user's pass for that match's season (if any exists).
INSERT INTO "sale_pass_allocations" ("id", "sale_id", "season_pass_id", "nb_tickets")
SELECT
    gen_random_uuid()::text,
    s."id",
    sp."id",
    s."nb_tickets"
FROM "sales" s
JOIN "matches" m ON m."id" = s."match_id"
JOIN "season_passes" sp
    ON sp."user_id" = s."user_id"
    AND sp."season_start_year" = CASE
        WHEN EXTRACT(MONTH FROM m."date") < 8
        THEN EXTRACT(YEAR FROM m."date")::int - 1
        ELSE EXTRACT(YEAR FROM m."date")::int
    END;
