// Implements:
//  - Citizen.flagDispute(parcelId)
//  - LandOfficer.resolveDispute(disputeId)
//  - LandOfficer's "Respond to Dispute Flags" use case (list open disputes)

const pool = require('../db/pool');

// Citizen.flagDispute(parcelId)
async function flagDispute(req, res) {
  const { parcel_id, dispute_type, description } = req.body;
  if (!parcel_id || !dispute_type) {
    return res.status(400).json({ error: 'parcel_id and dispute_type are required' });
  }
  if (!['ownership', 'boundary'].includes(dispute_type)) {
    return res.status(400).json({ error: "dispute_type must be 'ownership' or 'boundary'" });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO dispute (parcel_id, reported_by, reported_via, dispute_type, description)
       VALUES ($1, $2, 'mobile', $3, $4) RETURNING *`,
      [parcel_id, req.user.user_id, dispute_type, description || null]
    );
    await client.query(`UPDATE parcel SET status = 'disputed' WHERE parcel_id = $1`, [parcel_id]);
    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to flag dispute' });
  } finally {
    client.release();
  }
}

// LandOfficer "Respond to Dispute Flags" — list open/under_review disputes
async function listDisputes(req, res) {
  try {
    const result = await pool.query(
      `SELECT d.*, p.neighbourhood FROM dispute d JOIN parcel p ON p.parcel_id = d.parcel_id
       WHERE d.status != 'resolved' ORDER BY d.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch disputes' });
  }
}

// LandOfficer.resolveDispute(disputeId) — also the officer-accountability
// metric your feedback asked for: this action is itself audit-logged, so the
// audit trail can be checked for whether disputes get resolved, not just
// created.
async function resolveDispute(req, res) {
  const { id } = req.params;
  const { resolution_notes } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE dispute SET status = 'resolved', resolved_at = now(), resolved_by = $1
       WHERE dispute_id = $2 RETURNING *`,
      [req.user.user_id, id]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Dispute not found' });
    }
    const parcel_id = result.rows[0].parcel_id;

    // only clear the "disputed" flag if no other open disputes remain
    const remaining = await client.query(
      `SELECT COUNT(*) FROM dispute WHERE parcel_id = $1 AND status != 'resolved'`,
      [parcel_id]
    );
    if (parseInt(remaining.rows[0].count, 10) === 0) {
      await client.query(`UPDATE parcel SET status = 'active' WHERE parcel_id = $1`, [parcel_id]);
    }

    await client.query(
      `INSERT INTO audit_log (officer_id, action_type, parcel_id, details) VALUES ($1, 'RESOLVE_DISPUTE', $2, $3)`,
      [req.user.user_id, parcel_id, resolution_notes || 'Dispute resolved']
    );

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to resolve dispute' });
  } finally {
    client.release();
  }
}

module.exports = { flagDispute, listDisputes, resolveDispute };
