-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "publishedAt" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "thumbnails" TEXT NOT NULL,
    "genres" TEXT NOT NULL,
    "viewCount" TEXT NOT NULL,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);
