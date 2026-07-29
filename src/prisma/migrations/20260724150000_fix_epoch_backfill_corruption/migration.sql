-- Fix epoch-corrupted timestamps from the 20260605120000_sale_lifecycle_timestamps
-- backfill.
--
-- That migration derived sales.created_at / sales.sold_at from
-- sale_histories.created_at. But sale_histories.created_at was itself backfilled
-- in the same migration with synthetic epoch-anchored placeholders
-- (epoch + row_number seconds) meant only for relative ordering, not real dates.
-- Any sale that already had sale_histories rows at migration time inherited a
-- fake epoch timestamp instead of falling back to match.date - 7 days.

-- created_at / updated_at: re-derive with the same match.date - 7 days fallback
-- already used for sales that had no history rows.
UPDATE "sales" s
SET "created_at" = (SELECT m."date" - INTERVAL '7 days' FROM "matches" m WHERE m.id = s.match_id),
    "updated_at" = (SELECT m."date" - INTERVAL '7 days' FROM "matches" m WHERE m.id = s.match_id)
WHERE s."created_at" < TIMESTAMP '1970-01-02';

-- sold_at: no real historical sell date exists for these rows — the synthetic
-- sale_histories timestamp is not a real one. Null it out rather than keep
-- faking it; lead-time analytics already treats null sold_at as "unknown".
UPDATE "sales"
SET "sold_at" = NULL
WHERE "sold_at" < TIMESTAMP '1970-01-02';
