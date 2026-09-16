-- CreateTable
CREATE TABLE "DirectorateMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "directorateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "DirectorateMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DirectorateMembership_directorateId_idx" ON "DirectorateMembership"("directorateId");

-- CreateIndex
CREATE UNIQUE INDEX "DirectorateMembership_userId_directorateId_key" ON "DirectorateMembership"("userId", "directorateId");

-- AddForeignKey
ALTER TABLE "DirectorateMembership" ADD CONSTRAINT "DirectorateMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorateMembership" ADD CONSTRAINT "DirectorateMembership_directorateId_fkey" FOREIGN KEY ("directorateId") REFERENCES "Directorate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorateMembership" ADD CONSTRAINT "DirectorateMembership_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
