-- AlterTable
ALTER TABLE "Channels" ALTER COLUMN "subscriberCount" SET DATA TYPE BIGINT,
ALTER COLUMN "viewCount" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "Video" ALTER COLUMN "viewCount" SET DATA TYPE BIGINT;