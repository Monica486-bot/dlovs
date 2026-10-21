-- FR11: the owner gives the reason in their transfer request (sale, gift…);
-- the officer's transfer form starts from it.
ALTER TABLE transfer_request ADD COLUMN IF NOT EXISTS transfer_reason VARCHAR(50);
ALTER TABLE transfer_request ADD COLUMN IF NOT EXISTS transfer_reason_details TEXT;
