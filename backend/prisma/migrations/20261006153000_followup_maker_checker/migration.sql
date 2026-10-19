-- Follow-up maker/checker assignment, rejection visibility and one-successor idempotency.
ALTER TABLE "FindingFollowUp"
  ADD COLUMN "assigneeId" TEXT,
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "previousFollowUpId" TEXT;

CREATE UNIQUE INDEX "FindingFollowUp_previousFollowUpId_key"
  ON "FindingFollowUp"("previousFollowUpId");
CREATE INDEX "FindingFollowUp_assigneeId_idx"
  ON "FindingFollowUp"("assigneeId");

ALTER TABLE "FindingFollowUp"
  ADD CONSTRAINT "FindingFollowUp_previousFollowUpId_fkey"
  FOREIGN KEY ("previousFollowUpId") REFERENCES "FindingFollowUp"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Mevcut iş listesi semantiğiyle geriye uyumlu atama backfill'i.
UPDATE "FindingFollowUp" fu
SET "assigneeId" = COALESCE(
  (SELECT ct."assigneeId" FROM "Finding" f JOIN "ControlTest" ct ON ct."id" = f."controlTestId" WHERE f."id" = fu."findingId"),
  (SELECT f."assigneeId" FROM "Finding" f WHERE f."id" = fu."findingId"),
  (SELECT a."ownerId" FROM "Action" a WHERE a."id" = fu."actionId")
)
WHERE fu."assigneeId" IS NULL;
