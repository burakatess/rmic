-- Risk ↔ Direktörlük (kayıt kapsamı). Additive; mevcut riskler değişmez:
-- directorateId NULL, isOrgWide=false ("eşlenmemiş"). Otomatik backfill YOK —
-- eşleme prisma/risk-directorate-dry-run.ts raporuyla ve onayla ayrıca yapılır.
ALTER TABLE "Risk" ADD COLUMN "directorateId" TEXT;
ALTER TABLE "Risk" ADD COLUMN "isOrgWide" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Risk_directorateId_idx" ON "Risk"("directorateId");
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_directorateId_fkey"
    FOREIGN KEY ("directorateId") REFERENCES "Directorate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
