import { Request, Response } from 'express';
import pool from '../db/pool';
import { generateQrDataUrl, checkSignature, QR_PUBLIC_KEY } from '../utils/qr';
import { askForIdCheck, alertOwner } from '../utils/notify';
import { NEIGHBOURHOODS, CITY, canonicalNeighbourhood } from '../utils/neighbourhoods';
import { fourPartName } from '../utils/names';
import { matchOwner } from '../utils/owners';
import { TRANSFER_REASONS } from '../utils/transferReasons';
import { optionalPhone, PHONE_FORMAT_ERROR } from '../utils/phone';
import * as parcels from '../repositories/parcelRepository';
import { createOwner } from '../repositories/ownerRepository';
import { recordAction } from '../repositories/auditRepository';
import { nationalIdStatus } from '../repositories/userRepository';
import type { AuthUser } from '../middleware/auth';

// HTTP handling and the rules for parcel records; the SQL is in repositories/parcelRepository.ts.

const STAFF_ROLES = ['land_officer', 'administrator'];
const isStaff = (user: AuthUser | undefined) => Boolean(user && STAFF_ROLES.includes(user.role));

const STAFF_ONLY_SEARCHES = ['national_id'];

export async function createParcel(req: Request, res: Response) {
  const { gps_lat, gps_lng, area_sqm, owner } = req.body;
  const neighbourhood = canonicalNeighbourhood(req.body.neighbourhood);
  if (gps_lat == null || gps_lng == null || !neighbourhood || !owner || !owner.full_name) {
    return res.status(400).json({ error: 'gps_lat, gps_lng, neighbourhood, and owner.full_name are required' });
  }
  const lat = Number(gps_lat);
  const lng = Number(gps_lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'gps_lat must be between -90 and 90 and gps_lng between -180 and 180' });
  }
  const ownerName = fourPartName(owner.full_name);
  if (ownerName.error) return res.status(400).json({ error: ownerName.error });
  const ownerContact = optionalPhone(owner.contact_number);
  if (ownerContact === undefined) return res.status(400).json({ error: PHONE_FORMAT_ERROR });
  const nationalId: string | null = owner.national_id?.trim() || null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const match = await matchOwner(client, nationalId, ownerName.name!);
    if (match.mismatch) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: match.mismatch, code: 'NATIONAL_ID_NAME_MISMATCH' });
    }
    const owner_id = match.owner?.owner_id ?? await createOwner(client, {
      full_name: ownerName.name!, contact_number: ownerContact, document_type: owner.document_type,
      document_reference: owner.document_reference, national_id: nationalId,
    });
    const officerId = req.user!.user_id;
    const parcel_id = await parcels.insertParcel(client, { lat, lng, neighbourhood, areaSqm: area_sqm || null, registeredBy: officerId, ownerId: owner_id });
    const { code, signature, dataUrl } = await generateQrDataUrl(parcel_id);
    await parcels.setQrCode(client, parcel_id, code, signature);
    await parcels.recordInitialOwner(client, parcel_id, owner_id, officerId);
    await recordAction(client, { officerId, action: 'CREATE_PARCEL', parcelId: parcel_id, details: `Registered parcel in ${neighbourhood} for owner ${ownerName.name}` });
    await client.query('COMMIT');
    const full = await parcels.findWithOwner(parcel_id);
    askForIdCheck(nationalId, parcel_id);
    alertOwner(parcel_id, req.user!, `registered parcel #${parcel_id} in ${neighbourhood} to you.`);
    res.status(201).json({ ...full, qr_data_url: dataUrl });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to create parcel record' });
  } finally {
    client.release();
  }
}

// The key the mobile app uses to check QR codes offline. It is public: it can
// check a signature but not make one.
export function getQrPublicKey(_req: Request, res: Response) {
  res.json({ algorithm: 'Ed25519', public_key: QR_PUBLIC_KEY });
}

export async function getQrCode(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const version = await parcels.findQrVersion(String(id));
    if (version === null) return res.status(404).json({ error: 'Parcel not found' });
    const { dataUrl } = await generateQrDataUrl(Number(id), version);
    res.json({ parcel_id: id, qr_version: version, qr_data_url: dataUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
}

// Search returns pages of 50. The body stays a plain array (as older app versions expect);
// the total and position travel in headers, exposed to browsers in app.ts.
const MAX_OFFSET = 100000;

function sendSearchPage(res: Response, page: parcels.SearchPage, offset: number) {
  res.set({ 'X-Total-Count': String(page.total), 'X-Page-Size': String(parcels.SEARCH_PAGE_SIZE), 'X-Offset': String(offset) });
  res.json(page.rows);
}

export async function searchParcel(req: Request, res: Response) {
  const by = String(req.query.by || 'any');
  const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
  if (!Number.isInteger(offset) || offset < 0 || offset > MAX_OFFSET) {
    return res.status(400).json({ error: `offset must be a whole number from 0 to ${MAX_OFFSET}` });
  }
  try {
    if (by === 'near') {
      const lat = Number(req.query.lat);
      const lng = Number(req.query.lng);
      const radius = req.query.radius === undefined ? 200 : Number(req.query.radius);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
        return res.status(400).json({ error: 'lat and lng are required for a GPS search' });
      }
      if (!Number.isFinite(radius) || radius <= 0 || radius > 5000) {
        return res.status(400).json({ error: 'radius must be between 1 and 5000 metres' });
      }
      return sendSearchPage(res, await parcels.searchNear(lat, lng, radius, offset), offset);
    }
    let query = (String(req.query.query ?? '')).trim();
    if (by === 'neighbourhood' || by === 'any') query = query.replace(/^hai\s+/i, '') || query;
    if (!query) return res.status(400).json({ error: 'query parameter is required' });
    if (!parcels.SEARCH_CONDITIONS[by]) {
      return res.status(400).json({ error: `by must be one of ${[...Object.keys(parcels.SEARCH_CONDITIONS), 'near'].join(', ')}` });
    }
    if (STAFF_ONLY_SEARCHES.includes(by) && !isStaff(req.user)) {
      return res.status(403).json({ error: 'Only land officers can search by national ID', code: 'STAFF_ONLY_SEARCH' });
    }
    sendSearchPage(res, await parcels.searchByText(by, query, offset), offset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Search failed' });
  }
}

export async function verifyParcel(req: Request, res: Response) {
  const id = String(req.params.id);
  const { signature, version, device_lat, device_lng } = req.query as Record<string, string | undefined>;
  try {
    const parcel = await parcels.findWithOwner(id);
    if (!parcel) return res.status(404).json({ error: 'Parcel not found' });
    const qr_check = signature ? checkSignature(id, parcel.qr_version, signature, version) : null;
    if (qr_check === 'invalid') {
      return res.status(400).json({ error: 'Invalid QR signature: this code may be tampered with', code: 'QR_INVALID' });
    }
    if (!isStaff(req.user)) {
      delete parcel.national_id;
      delete parcel.document_reference;
      delete parcel.unique_qr_code;
      delete parcel.qr_signature;
    }
    const details = await parcels.recordDetails(id);
    const lastTransfer = details.history.length > 1 ? details.history[details.history.length - 1].transfer_date : null;
    let gps_match: boolean | null = null;
    let distance_meters: number | null = null;
    if (device_lat != null && device_lng != null) {
      distance_meters = haversineMeters(parseFloat(device_lat), parseFloat(device_lng), parseFloat(parcel.gps_lat), parseFloat(parcel.gps_lng));
      gps_match = distance_meters <= 10;
    }
    await recordAction(pool, {
      officerId: req.user?.user_id ?? null,
      action: 'VERIFY_PARCEL',
      parcelId: id,
      details: `Ownership record viewed${qr_check ? `, QR code ${qr_check}` : ''}${gps_match !== null ? `, GPS match: ${gps_match}` : ''}`,
    });
    res.json({
      parcel,
      qr_check,
      qr_issued_at: qr_check === 'superseded' ? lastTransfer : undefined,
      ownership_history: details.history,
      disputes: details.disputes,
      documents: details.documents,
      gps_check: device_lat != null ? { gps_match, distance_meters } : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Verification failed' });
  }
}

export async function viewOwnParcels(req: Request, res: Response) {
  try {
    const { national_id: nationalId, national_id_verified_at: verifiedAt } = await nationalIdStatus(req.user!.user_id);
    if (!nationalId) {
      return res.json({ parcels: [], id_status: 'missing', message: 'Add your national ID to your profile to see parcels registered to you' });
    }
    if (!verifiedAt) {
      if (!(await parcels.nationalIdOwnsLand(nationalId))) {
        return res.json({ parcels: [], id_status: 'no_land', message: "No parcels are registered to your national ID. If land is registered to it, we'll ask you to show your ID card at the land office." });
      }
      return res.json({ parcels: [], id_status: 'pending', message: 'Show your national ID card at the land office once. After an officer confirms it, your parcels appear here.' });
    }
    res.json({ parcels: await parcels.parcelsOfNationalId(nationalId), id_status: 'verified' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch parcels' });
  }
}

export async function updateParcel(req: Request, res: Response) {
  const { id } = req.params;
  const changes: Record<string, unknown> = {};
  for (const field of parcels.EDITABLE_FIELDS) {
    if (req.body[field] !== undefined) changes[field] = req.body[field];
  }
  if (changes.neighbourhood !== undefined) {
    changes.neighbourhood = canonicalNeighbourhood(changes.neighbourhood as string);
    if (!changes.neighbourhood) return res.status(400).json({ error: 'neighbourhood cannot be empty' });
  }
  for (const [field, min, max] of [['gps_lat', -90, 90], ['gps_lng', -180, 180]] as [string, number, number][]) {
    if (changes[field] !== undefined) {
      const value = Number(changes[field]);
      if (changes[field] === null || changes[field] === '' || !Number.isFinite(value) || value < min || value > max) {
        return res.status(400).json({ error: `${field} must be a number between ${min} and ${max}` });
      }
      changes[field] = value;
    }
  }
  if (changes.area_sqm !== undefined) {
    if (changes.area_sqm === null || changes.area_sqm === '') changes.area_sqm = null;
    else if (!(Number(changes.area_sqm) > 0)) return res.status(400).json({ error: 'area_sqm must be a positive number' });
    else changes.area_sqm = Number(changes.area_sqm);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await parcels.lockForEdit(client, String(id));
    if (!current) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Parcel not found' }); }
    if (current.status === 'deactivated') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Deactivated parcel records cannot be edited' }); }
    const same = (field: string) =>
      field === 'neighbourhood' ? current[field] === changes[field] : (current[field] == null ? null : Number(current[field])) === changes[field];
    const changed = Object.keys(changes).filter((field) => !same(field));
    if (changed.length === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Nothing to update' }); }
    await parcels.updateFields(client, String(id), Object.fromEntries(changed.map((f) => [f, changes[f]])));
    await recordAction(client, {
      officerId: req.user!.user_id, action: 'UPDATE_PARCEL', parcelId: String(id),
      details: changed.map((f) => `${f}: ${current[f] ?? '-'} → ${changes[f] ?? '-'}`).join('; '),
    });
    await client.query('COMMIT');
    alertOwner(Number(id), req.user!, `changed the record of parcel #${id} (${changed.join(', ')}).`);
    res.json({ message: 'Parcel updated', parcel_id: Number(id), changed });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to update parcel' });
  } finally {
    client.release();
  }
}

export async function getStats(req: Request, res: Response) {
  try {
    res.json(await parcels.dashboardStats(req.user!.user_id, req.user!.role === 'administrator'));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function listTransferReasons(_req: Request, res: Response) { res.json(TRANSFER_REASONS); }
export function listNeighbourhoods(_req: Request, res: Response) { res.json({ city: CITY, neighbourhoods: NEIGHBOURHOODS }); }
