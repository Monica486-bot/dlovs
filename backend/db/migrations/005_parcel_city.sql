-- Every parcel records its city as well as its neighbourhood, so a search for
-- "Juba" finds parcels in Munuki, Gudele, etc. The prototype covers Juba only.
ALTER TABLE parcel ADD COLUMN IF NOT EXISTS city VARCHAR(100) NOT NULL DEFAULT 'Juba';
