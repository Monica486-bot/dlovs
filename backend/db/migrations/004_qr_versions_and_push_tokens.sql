-- FR11: a land transfer issues a new QR code. qr_version counts the codes a
-- parcel has had; the signature covers the version, so a marker printed
-- before the latest transfer can be recognised as replaced.
ALTER TABLE parcel ADD COLUMN IF NOT EXISTS qr_version INTEGER NOT NULL DEFAULT 1;

-- FR15: Expo push tokens for the mobile app, one row per device.
CREATE TABLE IF NOT EXISTS push_token (
    token       TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES "user"(user_id),
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_token_user ON push_token(user_id);
