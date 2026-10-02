-- Adds phone verification, documents metadata, notifications, unregistered
-- parcel reports, transfer requests, and append-only protection for the
-- ownership history and audit log. Safe to run more than once.

-- FR01: phone numbers are confirmed with an SMS code. Accounts that existed
-- before this migration are treated as already verified.
-- (only when the column is first added, so re-running never verifies anyone)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'user' AND column_name = 'phone_verified'
  ) THEN
    ALTER TABLE "user" ADD COLUMN phone_verified BOOLEAN NOT NULL DEFAULT false;
    UPDATE "user" SET phone_verified = true;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS phone_code (
    code_id       SERIAL PRIMARY KEY,
    phone_number  VARCHAR(30) NOT NULL,
    purpose       VARCHAR(20) NOT NULL CHECK (purpose IN ('verify', 'reset')),
    code_hash     TEXT NOT NULL,
    attempts      INTEGER NOT NULL DEFAULT 0,
    expires_at    TIMESTAMP NOT NULL,
    consumed_at   TIMESTAMP,
    created_at    TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_phone_code_lookup ON phone_code(phone_number, purpose, created_at DESC);

-- FR10: document details
ALTER TABLE document ADD COLUMN IF NOT EXISTS document_type VARCHAR(50);
ALTER TABLE document ADD COLUMN IF NOT EXISTS original_name TEXT;
ALTER TABLE document ADD COLUMN IF NOT EXISTS size_bytes INTEGER;
ALTER TABLE document ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_document_parcel ON document(parcel_id);
CREATE INDEX IF NOT EXISTS idx_document_status ON document(verification_status);

-- FR15: in-app notifications
CREATE TABLE IF NOT EXISTS notification (
    notification_id SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES "user"(user_id),
    message         TEXT NOT NULL,
    link            TEXT,
    is_read         BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notification_user ON notification(user_id, is_read, created_at DESC);

-- FR13: citizens report plots that aren't in DLOVS
CREATE TABLE IF NOT EXISTS unregistered_report (
    report_id        SERIAL PRIMARY KEY,
    reported_by      INTEGER NOT NULL REFERENCES "user"(user_id),
    neighbourhood    VARCHAR(100) NOT NULL,
    location_details TEXT NOT NULL,
    gps_lat          DECIMAL(10, 7),
    gps_lng          DECIMAL(10, 7),
    claimed_owner    VARCHAR(150),
    status           VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'registered', 'dismissed')),
    created_at       TIMESTAMP NOT NULL DEFAULT now(),
    handled_by       INTEGER REFERENCES "user"(user_id),
    handled_at       TIMESTAMP,
    response_notes   TEXT,
    parcel_id        INTEGER REFERENCES parcel(parcel_id)
);

-- Use case "Initiate Transfer Request": a citizen asks an officer to transfer
-- one of their parcels to a buyer
CREATE TABLE IF NOT EXISTS transfer_request (
    request_id        SERIAL PRIMARY KEY,
    parcel_id         INTEGER NOT NULL REFERENCES parcel(parcel_id),
    requested_by      INTEGER NOT NULL REFERENCES "user"(user_id),
    buyer_full_name   VARCHAR(150) NOT NULL,
    buyer_national_id VARCHAR(50) NOT NULL,
    buyer_contact     VARCHAR(30),
    notes             TEXT,
    status            VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected')),
    created_at        TIMESTAMP NOT NULL DEFAULT now(),
    handled_by        INTEGER REFERENCES "user"(user_id),
    handled_at        TIMESTAMP,
    response_notes    TEXT
);
CREATE INDEX IF NOT EXISTS idx_transfer_request_status ON transfer_request(status);

-- FR08 / NFR07: ownership history and audit log can only be appended to.
CREATE OR REPLACE FUNCTION dlovs_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: rows cannot be changed or deleted', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ownership_history_append_only ON ownership_history;
CREATE TRIGGER ownership_history_append_only BEFORE UPDATE OR DELETE ON ownership_history
  FOR EACH ROW EXECUTE FUNCTION dlovs_append_only();
DROP TRIGGER IF EXISTS ownership_history_no_truncate ON ownership_history;
CREATE TRIGGER ownership_history_no_truncate BEFORE TRUNCATE ON ownership_history
  FOR EACH STATEMENT EXECUTE FUNCTION dlovs_append_only();

DROP TRIGGER IF EXISTS audit_log_append_only ON audit_log;
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION dlovs_append_only();
DROP TRIGGER IF EXISTS audit_log_no_truncate ON audit_log;
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION dlovs_append_only();

-- One citizen account per national ID: the ID is what links an account to
-- land, so a second account claiming the same ID must be refused.
CREATE UNIQUE INDEX IF NOT EXISTS user_national_id_citizen_unique
  ON "user"(national_id) WHERE national_id IS NOT NULL AND role = 'citizen';
