-- Metadata belongs to the record-to-file link. Existing rows remain compatible:
-- readers fall back to originalName when displayName is NULL.
ALTER TABLE "FindingAttachment" ADD COLUMN "displayName" VARCHAR(255), ADD COLUMN "description" TEXT;
ALTER TABLE "ActionAttachment" ADD COLUMN "displayName" VARCHAR(255), ADD COLUMN "description" TEXT;
ALTER TABLE "FollowUpAttachment" ADD COLUMN "displayName" VARCHAR(255), ADD COLUMN "description" TEXT;
ALTER TABLE "ControlTestAttachment" ADD COLUMN "displayName" VARCHAR(255), ADD COLUMN "description" TEXT;
ALTER TABLE "Attachment" ADD COLUMN "displayName" VARCHAR(255), ADD COLUMN "description" TEXT;
