-- DLOVS Database Schema
-- Digital Land Ownership Verification System
-- Matches the ERD in the capstone proposal (Figure 3)

DROP TABLE IF EXISTS transfer_request CASCADE;
DROP TABLE IF EXISTS unregistered_report CASCADE;
DROP TABLE IF EXISTS notification CASCADE;
DROP TABLE IF EXISTS phone_code CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS dispute CASCADE;
DROP TABLE IF EXISTS document CASCADE;
DROP TABLE IF EXISTS ownership_history CASCADE;
DROP TABLE IF EXISTS parcel CASCADE;
DROP TABLE IF EXISTS owner CASCADE;
DROP TABLE IF EXISTS "user" CASCADE;

CREATE TABLE "user" (
    user_id         SERIAL PRIMARY KEY,
    full_name       VARCHAR(150) NOT NULL,
    phone_number    VARCHAR(30) UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    role            VARCHAR(20) NOT NULL CHECK (role IN ('guest', 'citizen', 'land_officer', 'administrator')),
    platform        VARCHAR(20) NOT NULL CHECK (platform IN ('mobile', 'web')),
    -- links a citizen account to the OWNER records registered under the same
    -- national ID, so "View Own Parcels" doesn't rely on name matching
    national_id     VARCHAR(50),
    -- set when a land officer has checked the ID card in person; until then
    -- the account is not linked to any land
    national_id_verified_at TIMESTAMP,
    national_id_verified_by INTEGER REFERENCES "user"(user_id),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    -- FR01: confirmed with an SMS code before the account can be used
    phone_verified  BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE owner (
    owner_id            SERIAL PRIMARY KEY,
    full_name           VARCHAR(150) NOT NULL,
    contact_number      VARCHAR(30),
    document_type       VARCHAR(50),
    document_reference  TEXT,
    national_id         VARCHAR(50)
);

CREATE TABLE parcel (
    parcel_id        SERIAL PRIMARY KEY,
    gps_lat          DECIMAL(10, 7) NOT NULL,
    gps_lng          DECIMAL(10, 7) NOT NULL,
    neighbourhood    VARCHAR(100) NOT NULL,
    area_sqm         DECIMAL(10, 2),
    unique_qr_code   TEXT UNIQUE NOT NULL,
    qr_signature     TEXT NOT NULL,
    registered_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    registered_by    INTEGER REFERENCES "user"(user_id),
    current_owner_id INTEGER REFERENCES owner(owner_id),
    status           VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disputed', 'deactivated'))
);

CREATE TABLE ownership_history (
    history_id        SERIAL PRIMARY KEY,
    parcel_id         INTEGER NOT NULL REFERENCES parcel(parcel_id),
    previous_owner_id INTEGER REFERENCES owner(owner_id),
    new_owner_id      INTEGER NOT NULL REFERENCES owner(owner_id),
    transfer_date     TIMESTAMP NOT NULL DEFAULT now(),
    processed_by      INTEGER REFERENCES "user"(user_id),
    notes             TEXT
);

CREATE TABLE document (
    document_id        SERIAL PRIMARY KEY,
    parcel_id          INTEGER NOT NULL REFERENCES parcel(parcel_id),
    uploaded_by        INTEGER REFERENCES "user"(user_id),
    file_url           TEXT NOT NULL,
    file_type          VARCHAR(50),
    upload_date        TIMESTAMP NOT NULL DEFAULT now(),
    verified_by        INTEGER REFERENCES "user"(user_id),
    verification_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
    verification_date  TIMESTAMP,
    document_type      VARCHAR(50),
    original_name      TEXT,
    size_bytes         INTEGER,
    rejection_reason   TEXT
);

CREATE TABLE dispute (
    dispute_id     SERIAL PRIMARY KEY,
    parcel_id      INTEGER NOT NULL REFERENCES parcel(parcel_id),
    reported_by    INTEGER REFERENCES "user"(user_id),
    reported_via   VARCHAR(20) NOT NULL DEFAULT 'mobile' CHECK (reported_via IN ('mobile', 'web')),
    dispute_type   VARCHAR(20) NOT NULL CHECK (dispute_type IN ('ownership', 'boundary')),
    description    TEXT,
    status         VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved')),
    created_at     TIMESTAMP NOT NULL DEFAULT now(),
    resolved_at    TIMESTAMP,
    resolved_by    INTEGER REFERENCES "user"(user_id)
);

CREATE TABLE audit_log (
    log_id      SERIAL PRIMARY KEY,
    officer_id  INTEGER REFERENCES "user"(user_id),
    action_type VARCHAR(50) NOT NULL,
    parcel_id   INTEGER REFERENCES parcel(parcel_id),
    timestamp   TIMESTAMP NOT NULL DEFAULT now(),
    details     TEXT
);

CREATE INDEX idx_parcel_qr ON parcel(unique_qr_code);
CREATE INDEX idx_dispute_parcel ON dispute(parcel_id);
CREATE INDEX idx_audit_parcel ON audit_log(parcel_id);
-- search indexes for the owner-name and national-ID verification pathways (FR06, NFR05)
CREATE INDEX idx_owner_name ON owner(lower(full_name));
CREATE INDEX idx_owner_national_id ON owner(national_id);
CREATE INDEX idx_user_national_id ON "user"(national_id);
CREATE INDEX idx_document_parcel ON document(parcel_id);
CREATE INDEX idx_document_status ON document(verification_status);

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

CREATE INDEX IF NOT EXISTS idx_user_pending_id_check
  ON "user"(created_at) WHERE role = 'citizen' AND national_id IS NOT NULL AND national_id_verified_at IS NULL;
