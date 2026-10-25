import { Request, Response } from 'express';
import pool from '../db/pool';

export async function listAuditLogs(req: Request, res: Response): Promise<void> {
  try {
    let result;
    if (req.user!.role === 'administrator') {
      result = await pool.query(
        `SELECT a.*, u.full_name AS officer_name FROM audit_log a
         LEFT JOIN "user" u ON u.user_id = a.officer_id
         ORDER BY a.timestamp DESC LIMIT 200`
      );
    } else {
      result = await pool.query(
        `SELECT a.*, u.full_name AS officer_name FROM audit_log a
         LEFT JOIN "user" u ON u.user_id = a.officer_id
         WHERE a.officer_id = $1 ORDER BY a.timestamp DESC LIMIT 200`,
        [req.user!.user_id]
      );
    }
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
}
