-- AlterTable: who each user is connected to (used to draw live connection arcs).
-- IF NOT EXISTS: some databases already got this column via `prisma db push`.
ALTER TABLE "Presence" ADD COLUMN IF NOT EXISTS "partnerId" TEXT;
