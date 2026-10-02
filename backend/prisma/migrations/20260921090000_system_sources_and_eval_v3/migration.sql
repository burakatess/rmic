-- Sistem kaynakları (mevzuat/rehber/metodoloji) + Kontrol & Kanıt Değerlendirme v3 girdi özeti.
-- Yalnız EKLEME: mevcut veri değişmez, hiçbir tablo/sütun silinmez.

-- AlterEnum
ALTER TYPE "SourceKind" ADD VALUE 'OFFICIAL_GUIDE';
ALTER TYPE "SourceKind" ADD VALUE 'INTERNAL_METHODOLOGY';

-- AlterTable
ALTER TABLE "Source" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isSystemManaged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "SourceVersion" ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "SourceUnit" ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "AiEvalMessage" ADD COLUMN     "inputHash" TEXT,
ADD COLUMN     "modelVersion" TEXT;

-- CreateIndex
CREATE INDEX "Source_isSystemManaged_isActive_idx" ON "Source"("isSystemManaged", "isActive");
