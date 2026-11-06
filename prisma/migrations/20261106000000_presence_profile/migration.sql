-- AlterTable: optional ephemeral profile (display name + interest tags)
ALTER TABLE "Presence" ADD COLUMN "name" TEXT,
ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
