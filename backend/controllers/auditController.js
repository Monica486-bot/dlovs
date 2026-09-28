// Implements:
//  - LandOfficer "View Audit Logs for own actions"
//  - Administrator.viewAllAuditLogs(): List

const pool = require('../db/pool');

async function listAuditLogs(req, res) {
  try {
    let result;
    if (req.user.role === 'administrator') {
      result = await pool.query(
        `SELECT a.*, u.full_name AS officer_name FROM audit_log a
         LEFT JOIN "user" u ON u.user_id = a.officer_id
         ORDER BY a.timestamp DESC LIMIT 200`
      );
    } else {
      // land_officer: only their own actions
      result = await pool.query(
        `SELECT a.*, u.full_name AS officer_name FROM audit_log a
         LEFT JOIN "user" u ON u.user_id = a.officer_id
         WHERE a.officer_id = $1 ORDER BY a.timestamp DESC LIMIT 200`,
        [req.user.user_id]
      );
    }
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
}

module.exports = { listAuditLogs };
