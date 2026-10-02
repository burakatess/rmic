CREATE TABLE "UploadTicket" (
  "id" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "claimedAt" TIMESTAMP(3),
  CONSTRAINT "UploadTicket_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UploadTicket_fileName_key" ON "UploadTicket"("fileName");
CREATE INDEX "UploadTicket_uploadedById_claimedAt_idx" ON "UploadTicket"("uploadedById", "claimedAt");
