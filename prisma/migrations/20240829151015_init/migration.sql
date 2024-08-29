-- CreateTable
CREATE TABLE "Subdomains" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL DEFAULT 'no_value',
    "subdomain" TEXT NOT NULL DEFAULT 'no_value',

    CONSTRAINT "Subdomains_pkey" PRIMARY KEY ("id")
);
