-- Upgrades a database created from an earlier schema.sql without dropping data.
-- Safe to run more than once.

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS national_id VARCHAR(50);
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- accounts previously "deactivated" by downgrading them to the guest role
UPDATE "user" SET is_active = false WHERE role = 'guest';

CREATE INDEX IF NOT EXISTS idx_owner_name ON owner(lower(full_name));
CREATE INDEX IF NOT EXISTS idx_owner_national_id ON owner(national_id);
CREATE INDEX IF NOT EXISTS idx_user_national_id ON "user"(national_id);
