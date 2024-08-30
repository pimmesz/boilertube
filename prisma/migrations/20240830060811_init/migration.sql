/*
  Warnings:

  - You are about to drop the `Subdomains` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "Subdomains";

-- CreateTable
CREATE TABLE "Channels" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL DEFAULT 'no_value',
    "subdomain" TEXT NOT NULL DEFAULT 'no_value',
    "updatedAt" TEXT NOT NULL DEFAULT 'no_value',

    CONSTRAINT "Channels_pkey" PRIMARY KEY ("id")
);
