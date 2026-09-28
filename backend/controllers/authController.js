// Implements the User base class methods from the Class Diagram (Figure 4):
// login(), logout(), updateProfile(), resetPassword().
// Registration covers Citizen (mobile) and LandOfficer/Administrator (web)
// per the "platform" field on USER in the ERD.

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
require('dotenv').config();

const ALLOWED_ROLES = ['citizen', 'land_officer', 'administrator'];

async function register(req, res) {
  const { full_name, phone_number, password, role, platform } = req.body;
  if (!full_name || !phone_number || !password || !role || !platform) {
    return res.status(400).json({ error: 'full_name, phone_number, password, role, platform are required' });
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of ${ALLOWED_ROLES.join(', ')}` });
  }
  try {
    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO "user" (full_name, phone_number, password_hash, role, platform)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING user_id, full_name, phone_number, role, platform, created_at`,
      [full_name, phone_number, password_hash, role, platform]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A user with this phone number already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
}

// login(): String  (returns a JWT string, per the class diagram's return type)
async function login(req, res) {
  const { phone_number, password } = req.body;
  if (!phone_number || !password) {
    return res.status(400).json({ error: 'phone_number and password are required' });
  }
  try {
    const result = await pool.query('SELECT * FROM "user" WHERE phone_number = $1', [phone_number]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { user_id: user.user_id, role: user.role, full_name: user.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );
    res.json({
      token,
      user: { user_id: user.user_id, full_name: user.full_name, role: user.role, platform: user.platform },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
}

// logout(): void — JWTs are stateless, so logout is handled client-side by
// discarding the token. This endpoint exists so the class diagram's contract
// is honestly represented in the API surface.
function logout(req, res) {
  res.json({ message: 'Logged out. Discard the token client-side.' });
}

// updateProfile(): void
async function updateProfile(req, res) {
  const { full_name } = req.body;
  try {
    await pool.query('UPDATE "user" SET full_name = COALESCE($1, full_name) WHERE user_id = $2', [
      full_name,
      req.user.user_id,
    ]);
    res.json({ message: 'Profile updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Update failed' });
  }
}

// resetPassword(): void
async function resetPassword(req, res) {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'new_password must be at least 6 characters' });
  }
  try {
    const password_hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE "user" SET password_hash = $1 WHERE user_id = $2', [password_hash, req.user.user_id]);
    res.json({ message: 'Password reset' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Reset failed' });
  }
}

module.exports = { register, login, logout, updateProfile, resetPassword };
