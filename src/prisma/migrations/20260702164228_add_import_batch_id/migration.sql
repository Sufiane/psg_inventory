-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "import_batch_id" TEXT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "sales_user_id_import_batch_id_idx" ON "sales"("user_id", "import_batch_id");
