import pool from '../db/pool';
import { sendSms } from './sms';
import { sendPush } from './push';
import type { AuthUser } from '../middleware/auth';

// Controllers send notifications without waiting, so a slow SMS never delays
// the response. They are tracked so the tests can wait for them before
// closing the database.
const pending = new Set<Promise<void>>();

function track(work: Promise<void>): Promise<void> {
  pending.add(work);
  work.finally(() => pending.delete(work));
  return work;
}

export async function notificationsSettled(): Promise<void> {
  while (pending.size > 0) await Promise.all(pending);
}

export function notifyUsers(
  userIds: (number | null | undefined)[],
  message: string,
  options: { link?: string | null; sms?: boolean } = {}
): Promise<void> {
  return track(deliver(userIds, message, options));
}

async function deliver(
  userIds: (number | null | undefined)[],
  message: string,
  { link = null, sms = false }: { link?: string | null; sms?: boolean }
): Promise<void> {
  const ids = [...new Set(userIds.filter((id): id is number => Boolean(id)))];
  if (ids.length === 0) return;
  try {
    await pool.query(
      `INSERT INTO notification (user_id, message, link) SELECT id, $2, $3 FROM unnest($1::int[]) AS id`,
      [ids, message, link]
    );
    await sendPush(ids, message, { link });
    if (sms) {
      const phones = await pool.query(
        `SELECT phone_number FROM "user" WHERE user_id = ANY($1::int[]) AND is_active`,
        [ids]
      );
      await Promise.all(phones.rows.map((r: { phone_number: string }) => sendSms(r.phone_number, `DLOVS: ${message}`)));
    }
  } catch (err) {
    console.error('Notification failed:', (err as Error).message);
  }
}

export function notifyOfficers(message: string, options?: { link?: string | null; sms?: boolean }): Promise<void> {
  return track((async () => {
    try {
      const result = await pool.query(`SELECT user_id FROM "user" WHERE role = 'land_officer' AND is_active`);
      await notifyUsers(result.rows.map((r: { user_id: number }) => r.user_id), message, options);
    } catch (err) {
      console.error('Notification failed:', (err as Error).message);
    }
  })());
}

export async function ownerAccountIds(parcelId: number | string): Promise<number[]> {
  const result = await pool.query(
    `SELECT u.user_id FROM parcel p
     JOIN owner o ON o.owner_id = p.current_owner_id
     JOIN "user" u ON u.national_id = o.national_id AND u.role = 'citizen' AND u.is_active
       AND u.national_id_verified_at IS NOT NULL
     WHERE p.parcel_id = $1 AND o.national_id IS NOT NULL`,
    [parcelId]
  );
  return result.rows.map((r: { user_id: number }) => r.user_id);
}

export async function accountIdsForNationalId(nationalId: string | null | undefined): Promise<number[]> {
  if (!nationalId) return [];
  const result = await pool.query(
    `SELECT user_id FROM "user" WHERE national_id = $1 AND role = 'citizen' AND is_active AND national_id_verified_at IS NOT NULL`,
    [nationalId]
  );
  return result.rows.map((r: { user_id: number }) => r.user_id);
}

async function unconfirmedAccountIdsForNationalId(nationalId: string | null | undefined): Promise<number[]> {
  if (!nationalId) return [];
  const result = await pool.query(
    `SELECT user_id FROM "user" WHERE national_id = $1 AND role = 'citizen' AND is_active AND national_id_verified_at IS NULL`,
    [nationalId]
  );
  return result.rows.map((r: { user_id: number }) => r.user_id);
}

export function askForIdCheck(nationalId: string | null | undefined, parcelId: number | string): Promise<void> {
  return track((async () => {
    try {
      const ids = await unconfirmedAccountIdsForNationalId(nationalId);
      await notifyUsers(
        ids,
        `Parcel #${parcelId} has been registered to your national ID. Show your ID card at the land office once, so it appears under My Parcels.`,
        { link: '/my', sms: true }
      );
    } catch (err) {
      console.error('Notification failed:', (err as Error).message);
    }
  })());
}

export function alertOwner(
  parcelId: number | string,
  officer: AuthUser,
  message: string,
  { except = [] }: { except?: number[] } = {}
): Promise<void> {
  return track((async () => {
    try {
      const ids = (await ownerAccountIds(parcelId)).filter((id) => !except.includes(id));
      const who = officer.role === 'administrator' ? 'Administrator' : 'Officer';
      await notifyUsers(
        ids,
        `${who} ${officer.full_name}: ${message} If you don't recognise this, report it to the land office.`,
        { link: `/my/parcels/${parcelId}`, sms: true }
      );
    } catch (err) {
      console.error('Notification failed:', (err as Error).message);
    }
  })());
}
