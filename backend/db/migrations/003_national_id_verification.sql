-- A citizen's national ID only links their account to land once a land
-- officer has seen their ID card in person. Until then the account can't see
-- or act on the parcels registered under that ID. Safe to run more than once.
-- Citizens who entered a national ID before this migration start unverified
-- and need to visit the land office once.

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS national_id_verified_at TIMESTAMP;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS national_id_verified_by INTEGER REFERENCES "user"(user_id);

CREATE INDEX IF NOT EXISTS idx_user_pending_id_check
  ON "user"(created_at) WHERE role = 'citizen' AND national_id IS NOT NULL AND national_id_verified_at IS NULL;
