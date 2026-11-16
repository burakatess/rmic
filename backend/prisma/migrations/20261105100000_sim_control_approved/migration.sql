-- Risk simülasyonu: kontrol "Onaylı" (hesaplamaya dahil) işareti. Varsayılan true —
-- mevcut senaryoların hesap sonucu değişmez.
ALTER TABLE "RiskSimulationControl" ADD COLUMN "isApproved" BOOLEAN NOT NULL DEFAULT true;
