const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
require('dotenv').config();

// Decodes the JWT and loads the user's current role and active status from
// the database, so a deactivation or role change takes effect immediately
// instead of when the token expires.
async function loadUser(token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const result = await pool.query(
    'SELECT user_id, full_name, role, is_active FROM "user" WHERE user_id = $1',
    [decoded.user_id]
  );
  const user = result.rows[0];
  if (!user || !user.is_active) return null;
  return { user_id: user.user_id, full_name: user.full_name, role: user.role };
}

function bearerToken(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7);
}

// Verifies the JWT and attaches the user to req.user.
// Guest endpoints (scanQRCode, viewOwnershipRecord, searchParcel) do NOT use
// this middleware, per the Use Case Diagram: Guest requires no account.
async function requireAuth(req, res, next) {
  const token = bearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  try {
    const user = await loadUser(token);
    if (!user) return res.status(401).json({ error: 'Account is deactivated or no longer exists' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// For guest endpoints: attaches req.user when a valid token is sent, but never
// rejects the request. Lets officers see fields that guests should not.
async function optionalAuth(req, res, next) {
  const token = bearerToken(req);
  if (token) {
    try {
      req.user = (await loadUser(token)) || undefined;
    } catch (err) {
      req.user = undefined;
    }
  }
  next();
}

// Role-based access control, matching the class diagram's role hierarchy:
// citizen, land_officer, administrator (guest has no account, so no role check).
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    }
    next();
  };
}

module.exports = { requireAuth, optionalAuth, requireRole };
