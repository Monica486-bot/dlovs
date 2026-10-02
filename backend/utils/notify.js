// FR15 notifications: an in-app notification (shown in the web app's bell),
// plus an SMS for the events that affect a citizen's own land.
// Failures are logged, never thrown — a notification must not undo the action.

const pool = require('../db/pool');
const { sendSms } = require('./sms');

async function notifyUsers(userIds, message, { link = null, sms = false } = {}) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return;
  try {
    await pool.query(
      `INSERT INTO notification (user_id, message, link)
       SELECT id, $2, $3 FROM unnest($1::int[]) AS id`,
      [ids, message, link]
    );
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

module.exports = { notifyUsers, notifyOfficers, ownerAccountIds, accountIdsForNationalId };
