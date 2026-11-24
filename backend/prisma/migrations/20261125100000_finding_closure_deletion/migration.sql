-- Bulgu kapanış değerlendirmesi ve yönetici onaylı silme alanları (yalnız ekleme; mevcut veri değişmez).
ALTER TABLE "Finding"
  ADD COLUMN "closureSubmittedAt" TIMESTAMP(3),
  ADD COLUMN "closureSubmittedById" TEXT,
  ADD COLUMN "closureNote" TEXT,
  ADD COLUMN "closureDecidedAt" TIMESTAMP(3),
  ADD COLUMN "closureDecidedById" TEXT,
  ADD COLUMN "closureReturnReason" TEXT,
  ADD COLUMN "deletionRequestedById" TEXT,
  ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
  ADD COLUMN "deletionReason" TEXT,
  ADD COLUMN "deletionRejectionReason" TEXT,
  ADD COLUMN "deletionDecidedById" TEXT,
  ADD COLUMN "deletionDecidedAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT;

-- Aksiyon ve takip silme talepleri artık yönetici kararıyla sonuçlanır: kararı veren ve zamanı.
ALTER TABLE "Action" ADD COLUMN "deletionDecidedById" TEXT, ADD COLUMN "deletionDecidedAt" TIMESTAMP(3);
ALTER TABLE "FindingFollowUp" ADD COLUMN "deletionDecidedById" TEXT, ADD COLUMN "deletionDecidedAt" TIMESTAMP(3);
