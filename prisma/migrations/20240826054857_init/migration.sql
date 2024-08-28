/*
  Warnings:

  - You are about to drop the column `genres` on the `Video` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Video" DROP COLUMN "genres",
ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'default_channel';
