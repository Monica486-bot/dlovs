-- "Near me" search filters parcels to a lat/lng box around the user before
-- computing the exact Haversine distance; this index serves that box.
CREATE INDEX IF NOT EXISTS idx_parcel_gps ON parcel(gps_lat, gps_lng);
