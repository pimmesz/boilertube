/*
  Warnings:

  - You are about to drop the column `thumbnail` on the `Channels` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Channels" DROP COLUMN "thumbnail",
ADD COLUMN     "thumbnails" TEXT NOT NULL DEFAULT 'no_value';
