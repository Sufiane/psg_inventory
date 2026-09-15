CREATE TABLE "recipients" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recipients_user_id_name_key" ON "recipients"("user_id", "name");

ALTER TABLE "recipients" ADD CONSTRAINT "recipients_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The composite target of the gifts foreign key below. `id` is already the
-- primary key; this pair is what lets a gift row pin the sale's status.
CREATE UNIQUE INDEX "sales_id_status_key" ON "sales"("id", "status");

CREATE TABLE "gifts" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "sale_status" "SaleStatus" NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "gifted_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gifts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gifts_sale_id_key" ON "gifts"("sale_id");
CREATE UNIQUE INDEX "gifts_sale_id_sale_status_key" ON "gifts"("sale_id", "sale_status");
CREATE INDEX "gifts_recipient_id_idx" ON "gifts"("recipient_id");

-- sale_status is a constant, not data. Together with the composite foreign key
-- it gives the biconditional "a gifts row exists <=> sales.status = 'GIFTED'"
-- teeth: no gift row can attach to a non-gifted sale, and no gifted sale can
-- change status while its gift row lives. See spec D15.
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_sale_status_check"
    CHECK ("sale_status" = 'GIFTED');

ALTER TABLE "gifts" ADD CONSTRAINT "gifts_sale_id_sale_status_fkey"
    FOREIGN KEY ("sale_id", "sale_status") REFERENCES "sales"("id", "status")
    ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE "gifts" ADD CONSTRAINT "gifts_recipient_id_fkey"
    FOREIGN KEY ("recipient_id") REFERENCES "recipients"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
