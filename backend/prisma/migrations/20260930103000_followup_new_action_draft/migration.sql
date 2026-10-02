-- Yeni aksiyon gerekli kararı ile ikinci kontrolcü onayı farklı isteklerde
-- gerçekleşir. Onay sırasında aynı doğrulanmış taslağın kullanılabilmesi için
-- geriye uyumlu, nullable bir alan eklenir.
ALTER TABLE "FindingFollowUp"
ADD COLUMN "newActionDraft" JSONB;
