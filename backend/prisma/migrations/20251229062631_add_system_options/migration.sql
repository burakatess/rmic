-- CreateTable
CREATE TABLE "SystemOption" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "labelEn" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SystemOption_category_idx" ON "SystemOption"("category");

-- CreateIndex
CREATE INDEX "SystemOption_isActive_idx" ON "SystemOption"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SystemOption_category_value_key" ON "SystemOption"("category", "value");
