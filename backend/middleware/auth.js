const jwt = require('jsonwebtoken');
require('dotenv').config();

// Verifies the JWT and attaches the decoded user to req.user.
// Guest endpoints (scanQRCode, viewOwnershipRecord, searchParcel) do NOT use
// this middleware, per the Use Case Diagram: Guest requires no account.
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = header.slice(7);
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
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

module.exports = { requireAuth, requireRole };
