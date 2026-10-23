// One owner record per national ID, so an owner's parcels stay together in one
// portfolio (FR09). A national ID that is already registered must come with
// the same name: otherwise a typo in the ID would silently hand the land to
// the person who already holds that number.

const normalise = (name) => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();

async function ownerByNationalId(db, nationalId) {
  if (!nationalId) return null;
  const result = await db.query(
    'SELECT owner_id, full_name FROM owner WHERE national_id = $1 ORDER BY owner_id LIMIT 1',
    [nationalId]
  );
  return result.rows[0] || null;
}

// For officers: the existing owner (or null), or { mismatch } with a message
// naming who the ID is registered to.
async function matchOwner(db, nationalId, fullName) {
  const existing = await ownerByNationalId(db, nationalId);
  if (!existing || normalise(existing.full_name) === normalise(fullName)) return { owner: existing };
  return {
    mismatch:
      `National ID ${nationalId} is already registered to ${existing.full_name}, not ${fullName}. ` +
      'Check the ID card: if it is the same person, enter the name exactly as registered; if not, the ID number is wrong.',
  };
}

module.exports = { ownerByNationalId, matchOwner, normalise };
