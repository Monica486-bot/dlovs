-- DLOVS Database Schema
-- Digital Land Ownership Verification System
-- Matches the ERD in the capstone proposal (Figure 3)

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
    verification_date  TIMESTAMP
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
