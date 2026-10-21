// FR15: Expo push notifications to the mobile app.
// Sends through Expo's push service (free, no account key needed). Like SMS,
// a failed push is logged and never undoes the action that triggered it.

const pool = require('../db/pool');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100; // Expo's limit per request

function isExpoPushToken(token) {
  return typeof token === 'string' && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);
}

// Disabled in tests, and when PUSH_DISABLED=true (e.g. offline demos).
function pushEnabled() {
  return process.env.NODE_ENV !== 'test' && process.env.PUSH_DISABLED !== 'true';
}

async function sendPush(userIds, message, { link = null } = {}) {
  if (!pushEnabled() || userIds.length === 0) return;
  try {
    const result = await pool.query('SELECT token FROM push_token WHERE user_id = ANY($1::int[])', [userIds]);
    const tokens = result.rows.map((r) => r.token);
    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batch = tokens.slice(i, i + BATCH_SIZE);
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(batch.map((to) => ({ to, title: 'DLOVS', body: message, data: { link }, sound: 'default' }))),
        signal: AbortSignal.timeout(10000),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        console.error('Push failed:', response.status, JSON.stringify(data));
        continue;
      }
      // Forget phones that uninstalled the app or turned notifications off
      const gone = (data?.data || [])
        .map((ticket, n) => (ticket.details?.error === 'DeviceNotRegistered' ? batch[n] : null))
        .filter(Boolean);
      if (gone.length) await pool.query('DELETE FROM push_token WHERE token = ANY($1::text[])', [gone]);
    }
  } catch (err) {
    console.error('Push failed:', err.message);
  }
}

module.exports = { sendPush, isExpoPushToken };
