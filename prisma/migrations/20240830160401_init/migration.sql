/*
  Warnings:

  - The `viewCount` column on the `Video` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Channels" ADD COLUMN     "subscriberCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Video" DROP COLUMN "viewCount",
ADD COLUMN     "viewCount" INTEGER NOT NULL DEFAULT 0;
