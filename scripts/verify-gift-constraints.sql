-- Proves the database itself enforces "a gifts row exists <=> sales.status =
-- 'GIFTED'" (spec D15), and — as of the 2026-09-15 revision — that
-- gifts.recipient_id / gifts.gifted_at are NOT NULL and the recipient foreign
-- key is ON DELETE RESTRICT (spec D9/D14). Not part of the automated test
-- suite — run by hand whenever the Gifts model, its migration, or this
-- constraint changes, to confirm the mechanics still hold. Run against the
-- local dev database:
--   docker exec -i psg-inventory-db psql -U postgres -d psg_inventory \
--     -v ON_ERROR_STOP=0 -f - < scripts/verify-gift-constraints.sql
-- Every statement labelled EXPECT FAIL must print an ERROR; every statement
-- labelled EXPECT OK must succeed.
--
-- NOTE: each EXPECT FAIL statement is wrapped in its own SAVEPOINT and
-- immediately rolled back to it. Postgres aborts the whole enclosing
-- transaction on the first uncaught error (every later statement then fails
-- with "current transaction is aborted", masking the rest of the proof) —
-- the savepoint is what lets the surrounding EXPECT OK statements keep
-- running after a deliberate failure.
BEGIN;

INSERT INTO users (id, first_name, last_name, email, password, created_at, updated_at, role)
VALUES ('cu-1', 'C', 'U', 'constraints@psg.fr', 'x', now(), now(), 'USER');

INSERT INTO opponents (id, name) VALUES ('co-1', 'Constraint FC');

INSERT INTO matches (id, opponent_id, at_home, date, competition)
VALUES ('cm-1', 'co-1', true, now() + interval '7 days', 'CHAMPIONSHIP');

INSERT INTO sales (id, user_id, match_id, listed_price, profit, invest, nb_tickets, status, created_at, updated_at)
VALUES ('cs-1', 'cu-1', 'cm-1', 100, 90, 0, 1, 'PENDING', now(), now());

-- Two recipients: cr-1 ends up with a gift (for the RESTRICT-blocks-delete
-- case below), cr-2 never does (for the RESTRICT-allows-delete case).
INSERT INTO recipients (id, user_id, name, created_at, updated_at)
VALUES ('cr-1', 'cu-1', 'Recipient One', now(), now());

INSERT INTO recipients (id, user_id, name, created_at, updated_at)
VALUES ('cr-2', 'cu-1', 'Recipient Two', now(), now());

SAVEPOINT sp1;
-- EXPECT FAIL: a gift cannot attach to a PENDING sale.
INSERT INTO gifts (id, sale_id, sale_status, recipient_id, gifted_at, created_at, updated_at)
VALUES ('cg-1', 'cs-1', 'GIFTED', 'cr-1', now(), now(), now());
ROLLBACK TO SAVEPOINT sp1;

SAVEPOINT sp2;
-- EXPECT FAIL: sale_status is pinned to GIFTED.
INSERT INTO gifts (id, sale_id, sale_status, recipient_id, gifted_at, created_at, updated_at)
VALUES ('cg-1', 'cs-1', 'PENDING', 'cr-1', now(), now(), now());
ROLLBACK TO SAVEPOINT sp2;

-- EXPECT OK: status first, then the gift row.
UPDATE sales SET status = 'GIFTED' WHERE id = 'cs-1';
INSERT INTO gifts (id, sale_id, sale_status, recipient_id, gifted_at, created_at, updated_at)
VALUES ('cg-1', 'cs-1', 'GIFTED', 'cr-1', now(), now(), now());

SAVEPOINT sp3;
-- EXPECT FAIL: this is the bug the whole redesign exists to make impossible.
UPDATE sales SET status = 'PENDING' WHERE id = 'cs-1';
ROLLBACK TO SAVEPOINT sp3;

-- EXPECT OK: editing anything other than the status still works on a gift.
UPDATE sales SET listed_price = 123 WHERE id = 'cs-1';

-- EXPECT OK: re-writing the same status is not a key change (recipient updates).
UPDATE sales SET status = 'GIFTED' WHERE id = 'cs-1';

-- EXPECT OK: the sanctioned repair, in the only order the database allows.
DELETE FROM gifts WHERE sale_id = 'cs-1';
UPDATE sales SET status = 'PENDING' WHERE id = 'cs-1';

-- 2026-09-15 revision: gifts.recipient_id / gifts.gifted_at are NOT NULL, and
-- the recipient foreign key is ON DELETE RESTRICT (spec D9/D14). A second
-- sale, taken straight to GIFTED, gives these cases a sale to attach to.
INSERT INTO sales (id, user_id, match_id, listed_price, profit, invest, nb_tickets, status, created_at, updated_at)
VALUES ('cs-2', 'cu-1', 'cm-1', 100, 90, 0, 1, 'GIFTED', now(), now());

SAVEPOINT sp4;
-- EXPECT FAIL: recipient_id is NOT NULL.
INSERT INTO gifts (id, sale_id, sale_status, recipient_id, gifted_at, created_at, updated_at)
VALUES ('cg-2', 'cs-2', 'GIFTED', NULL, now(), now(), now());
ROLLBACK TO SAVEPOINT sp4;

SAVEPOINT sp5;
-- EXPECT FAIL: gifted_at is NOT NULL.
INSERT INTO gifts (id, sale_id, sale_status, recipient_id, gifted_at, created_at, updated_at)
VALUES ('cg-2', 'cs-2', 'GIFTED', 'cr-1', NULL, now(), now());
ROLLBACK TO SAVEPOINT sp5;

-- EXPECT OK: a real gift row for cs-2, so cr-1 now has a gift attached to it.
INSERT INTO gifts (id, sale_id, sale_status, recipient_id, gifted_at, created_at, updated_at)
VALUES ('cg-2', 'cs-2', 'GIFTED', 'cr-1', now(), now(), now());

SAVEPOINT sp6;
-- EXPECT FAIL: cr-1 still has a gift (cg-2) — RESTRICT blocks the delete.
DELETE FROM recipients WHERE id = 'cr-1';
ROLLBACK TO SAVEPOINT sp6;

-- EXPECT OK: cr-2 has no gift — RESTRICT does not block deleting it.
DELETE FROM recipients WHERE id = 'cr-2';

ROLLBACK;
