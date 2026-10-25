import pool from '../db/pool';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;

export function isExpoPushToken(token: string): boolean {
  return typeof token === 'string' && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);
}

function pushEnabled(): boolean {
  return process.env.NODE_ENV !== 'test' && process.env.PUSH_DISABLED !== 'true';
}

export async function sendPush(userIds: number[], message: string, { link = null }: { link?: string | null } = {}): Promise<void> {
  if (!pushEnabled() || userIds.length === 0) return;
  try {
    const result = await pool.query('SELECT token FROM push_token WHERE user_id = ANY($1::int[])', [userIds]);
    const tokens: string[] = result.rows.map((r: { token: string }) => r.token);
    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const batch = tokens.slice(i, i + BATCH_SIZE);
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(batch.map((to) => ({ to, title: 'DLOVS', body: message, data: { link }, sound: 'default' }))),
        signal: AbortSignal.timeout(10000),
      });
      const data = await response.json().catch(() => null) as { data?: Array<{ details?: { error?: string } }> } | null;
      if (!response.ok) { console.error('Push failed:', response.status, JSON.stringify(data)); continue; }
      const gone = (data?.data || [])
        .map((ticket, n) => (ticket.details?.error === 'DeviceNotRegistered' ? batch[n] : null))
        .filter((t): t is string => t !== null);
      if (gone.length) await pool.query('DELETE FROM push_token WHERE token = ANY($1::text[])', [gone]);
    }
  } catch (err) {
    console.error('Push failed:', (err as Error).message);
  }
}
