-- Owner consent for transfers an officer starts directly (not from a citizen's
-- transfer request). Ownership only changes once consent is proven:
--   owner_code: the owner has a confirmed account, so they get an SMS code
--                     and read it to the officer (status awaiting_owner)
--   second_officer: the owner has no account, so the officer records the paper
--                     consent document and another officer approves it
--                     (status awaiting_approval)
CREATE TABLE IF NOT EXISTS pending_transfer (
    transfer_id        SERIAL PRIMARY KEY,
    parcel_id          INTEGER NOT NULL REFERENCES parcel(parcel_id),
    expected_owner_id  INTEGER NOT NULL REFERENCES owner(owner_id),
    new_owner_name     VARCHAR(150) NOT NULL,
    new_owner_national_id VARCHAR(50),
    new_owner_contact  VARCHAR(30),
    new_owner_document VARCHAR(50),
    notes              TEXT,
    consent_method     VARCHAR(20) NOT NULL CHECK (consent_method IN ('owner_code', 'second_officer')),
    consent_document   TEXT,
    code_hash          TEXT,
    code_attempts      INTEGER NOT NULL DEFAULT 0,
    code_expires_at    TIMESTAMP,
    status             VARCHAR(20) NOT NULL CHECK (status IN ('awaiting_owner', 'awaiting_approval', 'completed', 'rejected', 'cancelled')),
    started_by         INTEGER NOT NULL REFERENCES "user"(user_id),
    created_at         TIMESTAMP NOT NULL DEFAULT now(),
    decided_by         INTEGER REFERENCES "user"(user_id),
    decided_at         TIMESTAMP,
    decision_notes     TEXT
);
-- one transfer in progress per parcel
CREATE UNIQUE INDEX IF NOT EXISTS pending_transfer_one_open
  ON pending_transfer(parcel_id) WHERE status IN ('awaiting_owner', 'awaiting_approval');
CREATE INDEX IF NOT EXISTS idx_pending_transfer_status ON pending_transfer(status);
