-- CreateEnum
CREATE TYPE "RiskEntryRecordType" AS ENUM ('RISK', 'OPPORTUNITY', 'ISSUE');

-- CreateEnum
CREATE TYPE "RiskEntryStatus" AS ENUM ('AKTIF', 'PASIF', 'KAPATILDI', 'BEKLEMEDE');

-- CreateEnum
CREATE TYPE "RiskEntryLevel" AS ENUM ('KRITIK', 'YUKSEK', 'ORTA', 'DUSUK');

-- CreateEnum
CREATE TYPE "ControlEffectivenessLevel" AS ENUM ('ETKIN', 'KISMEN_ETKIN', 'ETKIN_DEGIL');

-- CreateEnum
CREATE TYPE "RiskTreatmentOption" AS ENUM ('KABUL_ET', 'AZALT', 'TRANSFER_ET', 'KACIN');

-- CreateTable
CREATE TABLE "RiskEntry" (
    "id" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "kayitId" TEXT NOT NULL,
    "kayitTipi" "RiskEntryRecordType" NOT NULL DEFAULT 'RISK',
    "riskStatus" "RiskEntryStatus" NOT NULL DEFAULT 'AKTIF',
    "riskSahibi" TEXT,
    "surec" TEXT,
    "altSurec" TEXT,
    "riskTanimi" TEXT NOT NULL,
    "flagForIT" BOOLEAN NOT NULL DEFAULT false,
    "finansalEtki" INTEGER DEFAULT 1,
    "itibarEtkisi" INTEGER DEFAULT 1,
    "regulasyonEtkisi" INTEGER DEFAULT 1,
    "musteriEtkisi" INTEGER DEFAULT 1,
    "gizlilikEtkisi" INTEGER DEFAULT 1,
    "butunlukEtkisi" INTEGER DEFAULT 1,
    "erisebilirlikEtkisi" INTEGER DEFAULT 1,
    "etki" DOUBLE PRECISION,
    "olasilik" INTEGER DEFAULT 1,
    "dogalRiskPuani" DOUBLE PRECISION,
    "dogalRiskSkoru" INTEGER,
    "dogalRiskSeviyesi" "RiskEntryLevel",
    "butunlesikKontrolPuani" DOUBLE PRECISION,
    "butunlesikKontrolSkoru" INTEGER,
    "butunlesikKontrolSeviyesi" "ControlEffectivenessLevel",
    "kalintiRiskPuani" DOUBLE PRECISION,
    "kalintiRiskSkoru" INTEGER,
    "kalintiRiskSeviyesi" "RiskEntryLevel",
    "riskIsleme" "RiskTreatmentOption",
    "mutabakatTarihi" TIMESTAMP(3),
    "olusturmaTarihi" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "guncellemeTarihi" TIMESTAMP(3) NOT NULL,
    "riskSorumlusu" TEXT,
    "atanan" TEXT,
    "olusturan" TEXT,
    "kaydiAcan" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "syncedRiskId" TEXT,

    CONSTRAINT "RiskEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RiskEntry_riskId_key" ON "RiskEntry"("riskId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskEntry_kayitId_key" ON "RiskEntry"("kayitId");

-- CreateIndex
CREATE INDEX "RiskEntry_riskStatus_idx" ON "RiskEntry"("riskStatus");

-- CreateIndex
CREATE INDEX "RiskEntry_dogalRiskSeviyesi_idx" ON "RiskEntry"("dogalRiskSeviyesi");

-- CreateIndex
CREATE INDEX "RiskEntry_kalintiRiskSeviyesi_idx" ON "RiskEntry"("kalintiRiskSeviyesi");

-- CreateIndex
CREATE INDEX "RiskEntry_surec_idx" ON "RiskEntry"("surec");

-- CreateIndex
CREATE INDEX "RiskEntry_olusturmaTarihi_idx" ON "RiskEntry"("olusturmaTarihi");

-- AddForeignKey
ALTER TABLE "RiskEntry" ADD CONSTRAINT "RiskEntry_syncedRiskId_fkey" FOREIGN KEY ("syncedRiskId") REFERENCES "Risk"("id") ON DELETE SET NULL ON UPDATE CASCADE;
