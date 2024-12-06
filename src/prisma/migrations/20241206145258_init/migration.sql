-- CreateEnum
CREATE TYPE "Competition" AS ENUM ('CHAMPIONS_LEAGUE', 'CHAMPIONSHIP', 'FRENCH_CUP', 'LEAGUE_CUP');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('PENDING', 'SOLD', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matchs" (
    "id" TEXT NOT NULL,
    "opponent_id" TEXT NOT NULL,
    "at_home" BOOLEAN NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "competition" "Competition" NOT NULL,

    CONSTRAINT "matchs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opponents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "opponents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_results" (
    "id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "score" TEXT NOT NULL,
    "is_win" BOOLEAN NOT NULL,

    CONSTRAINT "match_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "match_id" TEXT NOT NULL,
    "listed_price" INTEGER NOT NULL,
    "profit" INTEGER NOT NULL,
    "invest" INTEGER NOT NULL DEFAULT 0,
    "nb_tickets" INTEGER NOT NULL,
    "status" "SaleStatus" NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_history" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "listed_price" INTEGER NOT NULL,
    "profit" INTEGER NOT NULL,
    "status" "SaleStatus" NOT NULL,

    CONSTRAINT "sale_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "match_results_match_id_key" ON "match_results"("match_id");

-- AddForeignKey
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matchs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matchs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_history" ADD CONSTRAINT "sale_history_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
