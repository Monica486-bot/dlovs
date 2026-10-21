const pool = require('../db/pool');
const { sendSms } = require('./sms');
const { sendPush } = require('./push');

// FR15: in-app notification, Expo push and (optionally) SMS.
// Failures are logged, never thrown.
async function notifyUsers(userIds, message, { link = null, sms = false } = {}) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return;
  try {
    await pool.query(
      `INSERT INTO notification (user_id, message, link)
       SELECT id, $2, $3 FROM unnest($1::int[]) AS id`,
      [ids, message, link]
    );
    await sendPush(ids, message, { link });
    if (sms) {
      const phones = await pool.query(
        `SELECT phone_number FROM "user" WHERE user_id = ANY($1::int[]) AND is_active`,
        [ids]
      );
      await Promise.all(phones.rows.map((r) => sendSms(r.phone_number, `DLOVS: ${message}`)));
    }
  } catch (err) {
    console.error('Notification failed:', err.message);
  }
}

// Every active land officer. (Officers aren't assigned to areas yet, so a
// "jurisdiction" is the whole register for now.)
async function notifyOfficers(message, options) {
  try {
    const result = await pool.query(`SELECT user_id FROM "user" WHERE role = 'land_officer' AND is_active`);
    await notifyUsers(result.rows.map((r) => r.user_id), message, options);
  } catch (err) {
    console.error('Notification failed:', err.message);
  }
}

// Citizen accounts linked (by officer-verified national ID) to the parcel's
// current owner. Unverified claims are never told about someone's land.
async function ownerAccountIds(parcelId) {
  const result = await pool.query(
    `SELECT u.user_id FROM parcel p
     JOIN owner o ON o.owner_id = p.current_owner_id
     JOIN "user" u ON u.national_id = o.national_id AND u.role = 'citizen' AND u.is_active
       AND u.national_id_verified_at IS NOT NULL
     WHERE p.parcel_id = $1 AND o.national_id IS NOT NULL`,
    [parcelId]
  );
  return result.rows.map((r) => r.user_id);
}

async function accountIdsForNationalId(nationalId) {
  if (!nationalId) return [];
  const result = await pool.query(
    `SELECT user_id FROM "user" WHERE national_id = $1 AND role = 'citizen' AND is_active
     AND national_id_verified_at IS NOT NULL`,
    [nationalId]
  );
  return result.rows.map((r) => r.user_id);
}

// Citizen accounts that entered this national ID but haven't shown the ID
// card yet — told when land is registered to it, so they come in for the check.
async function unconfirmedAccountIdsForNationalId(nationalId) {
  if (!nationalId) return [];
  const result = await pool.query(
    `SELECT user_id FROM "user" WHERE national_id = $1 AND role = 'citizen' AND is_active
     AND national_id_verified_at IS NULL`,
    [nationalId]
  );
  return result.rows.map((r) => r.user_id);
}

// Tells a not-yet-confirmed account that land now stands under its national ID.
async function askForIdCheck(nationalId, parcelId) {
  try {
    const ids = await unconfirmedAccountIdsForNationalId(nationalId);
    await notifyUsers(
      ids,
      `Parcel #${parcelId} has been registered to your national ID. Show your ID card at the land office once, so it appears under My Parcels.`,
      { link: '/my', sms: true }
    );
  } catch (err) {
    console.error('Notification failed:', err.message);
  }
}

module.exports = { notifyUsers, notifyOfficers, ownerAccountIds, accountIdsForNationalId, askForIdCheck };
