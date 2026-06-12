-- Add reuse detection fields to refresh_tokens
-- used: marks a token as already rotated (prevents replay)
-- family: groups a token rotation chain (full chain revocation on reuse)

ALTER TABLE "refresh_tokens"
  ADD COLUMN "used"   BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN "family" TEXT     NOT NULL DEFAULT gen_random_uuid()::text;

-- Index for family-based revocation queries
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens"("family");
