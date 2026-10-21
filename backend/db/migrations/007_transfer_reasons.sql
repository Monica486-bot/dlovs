-- FR11: why each transfer happened (sale, inheritance, gift, court order…),
-- shown in the ownership history. Initial registrations have none.
ALTER TABLE ownership_history ADD COLUMN IF NOT EXISTS transfer_reason VARCHAR(50);
ALTER TABLE ownership_history ADD COLUMN IF NOT EXISTS transfer_reason_details TEXT;
ALTER TABLE pending_transfer ADD COLUMN IF NOT EXISTS transfer_reason VARCHAR(50);
ALTER TABLE pending_transfer ADD COLUMN IF NOT EXISTS transfer_reason_details TEXT;
