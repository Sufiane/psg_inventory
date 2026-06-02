-- CreateTable
CREATE TABLE "season_passes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "season_start_year" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "category" TEXT,
    "row" TEXT,
    "seat" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "season_passes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "season_passes_user_id_season_start_year_key" ON "season_passes"("user_id", "season_start_year");

-- AddForeignKey
ALTER TABLE "season_passes" ADD CONSTRAINT "season_passes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
