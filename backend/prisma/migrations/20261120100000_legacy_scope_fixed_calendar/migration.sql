-- Referans ayı olmayan periyodik dönem kayıtları: uygulama ayları sabit test takvimine çekilir
-- (dönemler Q1-Q4 / H1-H2 / YEAR olarak bu aylarda üretilir). Kontrolün eski selectedMonths
-- değeri (ör. Mart/Eylül) veya boş liste Dönem Kontrolleri ay filtresini yanlış eşliyordu.
-- Yalnız veri; şema değişmez. Referans ayı olan ve diğer sıklıktaki kayıtlara dokunulmaz.

UPDATE "ControlYearScope" SET "selectedMonths" = ARRAY['Mart','Haziran','Eylül','Aralık']
WHERE "frequency" = 'QUARTERLY' AND "referenceMonth" IS NULL;
UPDATE "ControlYearScope" SET "selectedMonths" = ARRAY['Haziran','Aralık']
WHERE "frequency" = 'SEMI_ANNUAL' AND "referenceMonth" IS NULL;
UPDATE "ControlYearScope" SET "selectedMonths" = ARRAY['Aralık']
WHERE "frequency" = 'ANNUAL' AND "referenceMonth" IS NULL;

UPDATE "AnnualPlanDraftItem" SET "selectedMonths" = ARRAY['Mart','Haziran','Eylül','Aralık']
WHERE "frequency" = 'QUARTERLY' AND "referenceMonth" IS NULL;
UPDATE "AnnualPlanDraftItem" SET "selectedMonths" = ARRAY['Haziran','Aralık']
WHERE "frequency" = 'SEMI_ANNUAL' AND "referenceMonth" IS NULL;
UPDATE "AnnualPlanDraftItem" SET "selectedMonths" = ARRAY['Aralık']
WHERE "frequency" = 'ANNUAL' AND "referenceMonth" IS NULL;
