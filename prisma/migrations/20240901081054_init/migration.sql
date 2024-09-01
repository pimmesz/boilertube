/*
  Warnings:

  - A unique constraint covering the columns `[subdomain]` on the table `Channels` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Channels" ALTER COLUMN "subdomain" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "Channels_subdomain_key" ON "Channels"("subdomain");
