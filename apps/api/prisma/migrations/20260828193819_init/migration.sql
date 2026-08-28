-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('pending', 'running', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "UrlStatus" AS ENUM ('pending', 'processing', 'success', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'pending',
    "totalUrls" INTEGER NOT NULL,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Url" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" "UrlStatus" NOT NULL DEFAULT 'pending',
    "httpStatus" INTEGER,
    "responseTimeMs" INTEGER,
    "title" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Url_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Batch_createdAt_idx" ON "Batch"("createdAt");

-- CreateIndex
CREATE INDEX "Url_batchId_idx" ON "Url"("batchId");

-- CreateIndex
CREATE INDEX "Url_batchId_status_idx" ON "Url"("batchId", "status");

-- AddForeignKey
ALTER TABLE "Url" ADD CONSTRAINT "Url_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
