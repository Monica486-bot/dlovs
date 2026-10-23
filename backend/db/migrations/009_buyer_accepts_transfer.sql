-- Officer-free transfers: when the buyer in an owner's transfer request has an
-- account with an officer-confirmed national ID, the buyer accepts in the app
-- with an SMS code and the transfer completes without an officer.
ALTER TABLE transfer_request ADD COLUMN IF NOT EXISTS buyer_user_id INTEGER REFERENCES "user"(user_id);
ALTER TABLE transfer_request ADD COLUMN IF NOT EXISTS accept_code_hash TEXT;
ALTER TABLE transfer_request ADD COLUMN IF NOT EXISTS accept_code_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE transfer_request ADD COLUMN IF NOT EXISTS accept_code_expires_at TIMESTAMP;
ALTER TABLE transfer_request ADD COLUMN IF NOT EXISTS accept_code_sent_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_transfer_request_buyer ON transfer_request(buyer_user_id) WHERE buyer_user_id IS NOT NULL;
