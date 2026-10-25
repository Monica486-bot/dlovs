import { Request, Response } from 'express';
import pool from '../db/pool';
import { notifyUsers, notifyOfficers, ownerAccountIds } from '../utils/notify';

const MAX_OPEN_DISPUTES_PER_ACCOUNT = 3;

export async function flagDispute(req: Request, res: Response): Promise<void> {
  const { parcel_id, dispute_type } = req.body;
  const description = req.body.description?.trim();
  const reportedVia = req.body.platform === 'web' ? 'web' : 'mobile';
  if (!parcel_id || !dispute_type) { res.status(400).json({ error: 'parcel_id and dispute_type are required' }); return; }
  if (!['ownership', 'boundary'].includes(dispute_type)) { res.status(400).json({ error: "dispute_type must be 'ownership' or 'boundary'" }); return; }
  if (!description || description.length < 10) { res.status(400).json({ error: 'Describe the problem in at least a sentence so an officer can follow up' }); return; }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const parcel = await client.query('SELECT status FROM parcel WHERE parcel_id = $1 FOR UPDATE', [Number(parcel_id) || 0]);
    if (parcel.rows.length === 0) { await client.query('ROLLBACK'); res.status(404).json({ error: 'Parcel not found' }); return; }
    if (parcel.rows[0].status === 'deactivated') { await client.query('ROLLBACK'); res.status(409).json({ error: 'This record has been deactivated as fraudulent; disputes cannot be added' }); return; }
    await client.query('SELECT 1 FROM "user" WHERE user_id = $1 FOR UPDATE', [req.user!.user_id]);
    const open = await client.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE parcel_id = $2)::int AS on_this_parcel
       FROM dispute WHERE reported_by = $1 AND status != 'resolved'`,
      [req.user!.user_id, Number(parcel_id)]
    );
    if (open.rows[0].on_this_parcel > 0) { await client.query('ROLLBACK'); res.status(409).json({ error: 'You already have an open dispute on this parcel. A land officer will review it.' }); return; }
    if (open.rows[0].total >= MAX_OPEN_DISPUTES_PER_ACCOUNT) {
      await client.query('ROLLBACK');
      res.status(429).json({ error: `You already have ${MAX_OPEN_DISPUTES_PER_ACCOUNT} open disputes. Wait until a land officer reviews them before flagging another parcel.` });
      return;
    }
    const result = await client.query(
      `INSERT INTO dispute (parcel_id, reported_by, reported_via, dispute_type, description) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [parcel_id, req.user!.user_id, reportedVia, dispute_type, description]
    );
    await client.query(`UPDATE parcel SET status = 'disputed' WHERE parcel_id = $1`, [parcel_id]);
    await client.query('COMMIT');
    notifyOfficers(`New ${dispute_type} dispute flagged on parcel #${parcel_id}`, { link: '/disputes' });
    const owners = (await ownerAccountIds(parcel_id)).filter((id) => id !== req.user!.user_id);
    notifyUsers(owners, `A ${dispute_type} dispute was flagged on your parcel #${parcel_id}. A land officer will review it.`, { link: `/my/parcels/${parcel_id}`, sms: true });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to flag dispute' });
  } finally {
    client.release();
  }
}

export async function listDisputes(req: Request, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT d.*, p.neighbourhood, o.full_name AS owner_name, u.full_name AS reporter_name, u.phone_number AS reporter_phone
       FROM dispute d
       JOIN parcel p ON p.parcel_id = d.parcel_id
       JOIN owner o ON o.owner_id = p.current_owner_id
       LEFT JOIN "user" u ON u.user_id = d.reported_by
       WHERE d.status != 'resolved' ORDER BY d.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch disputes' });
  }
}

export async function resolveDispute(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const resolutionNotes = req.body.resolution_notes?.trim();
  if (!Number.isInteger(id)) { res.status(404).json({ error: 'Dispute not found' }); return; }
  if (!resolutionNotes) { res.status(400).json({ error: 'Write how the dispute was resolved; it goes into the audit log' }); return; }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE dispute SET status = 'resolved', resolved_at = now(), resolved_by = $1
       WHERE dispute_id = $2 AND status != 'resolved' RETURNING *`,
      [req.user!.user_id, id]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      const exists = await pool.query('SELECT 1 FROM dispute WHERE dispute_id = $1', [id]);
      res.status(exists.rows.length ? 409 : 404).json({ error: exists.rows.length ? 'This dispute has already been resolved' : 'Dispute not found' });
      return;
    }
    const dispute = result.rows[0];
    const remaining = await client.query(`SELECT COUNT(*) FROM dispute WHERE parcel_id = $1 AND status != 'resolved'`, [dispute.parcel_id]);
    if (parseInt(remaining.rows[0].count, 10) === 0) {
      await client.query(`UPDATE parcel SET status = 'active' WHERE parcel_id = $1 AND status = 'disputed'`, [dispute.parcel_id]);
    }
    await client.query(
      `INSERT INTO audit_log (officer_id, action_type, parcel_id, details) VALUES ($1, 'RESOLVE_DISPUTE', $2, $3)`,
      [req.user!.user_id, dispute.parcel_id, resolutionNotes]
    );
    await client.query('COMMIT');
    const owners = await ownerAccountIds(dispute.parcel_id);
    notifyUsers([dispute.reported_by, ...owners], `The ${dispute.dispute_type} dispute on parcel #${dispute.parcel_id} has been resolved: ${resolutionNotes}`, { link: `/verify/${dispute.parcel_id}`, sms: true });
    res.json(dispute);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to resolve dispute' });
  } finally {
    client.release();
  }
}
