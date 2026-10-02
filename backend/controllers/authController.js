// Implements the User base class methods from the Class Diagram (Figure 4):
// login(), logout(), updateProfile(), resetPassword().
// Public registration is for Citizens only (FR01). Land Officer and
// Administrator accounts are created by an administrator — see
// adminController.createUser and scripts/createAdmin.js.
//
// FR01: citizens confirm their phone number with an SMS code before they can
// log in. FR20: citizens reset a forgotten password with an SMS code; officer
// passwords are reset by an administrator.

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { issueCode, checkCode, CodeError } = require('../utils/phoneCodes');
require('dotenv').config();

const PLATFORMS = ['mobile', 'web'];
const PHONE_PATTERN = /^\+?\d{9,15}$/;

const normalisePhone = (phone) => String(phone || '').replace(/[\s-]/g, '');

function sendCodeError(res, err, fallback) {
  if (err instanceof CodeError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  return res.status(500).json({ error: fallback });
}

async function register(req, res) {
  const { full_name, password, national_id, platform = 'mobile' } = req.body;
  const phone_number = normalisePhone(req.body.phone_number);
  if (!full_name?.trim() || !phone_number || !password) {
    return res.status(400).json({ error: 'full_name, phone_number, and password are required' });
  }
  if (!PHONE_PATTERN.test(phone_number)) {
    return res.status(400).json({ error: 'Enter the phone number with its country code, e.g. +211912345678' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 characters' });
  }
  if (!PLATFORMS.includes(platform)) {
    return res.status(400).json({ error: `platform must be one of ${PLATFORMS.join(', ')}` });
  }
  try {
    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO "user" (full_name, phone_number, password_hash, role, platform, national_id, phone_verified)
       VALUES ($1, $2, $3, 'citizen', $4, $5, false)
       RETURNING user_id, full_name, phone_number, role, platform, national_id, created_at`,
      [full_name.trim(), phone_number, password_hash, platform, national_id?.trim() || null]
    );
    const { devCode } = await issueCode(phone_number, 'verify');
    res.status(201).json({ ...result.rows[0], verification_required: true, dev_code: devCode });
  } catch (err) {
    if (err.constraint === 'user_national_id_citizen_unique') {
      return res.status(409).json({ error: 'This national ID is already linked to another account. If it is yours, visit the land office.' });
    }
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A user with this phone number already exists' });
    }
    return sendCodeError(res, err, 'Registration failed');
  }
}

// FR01: confirm the phone number with the SMS code
async function verifyPhone(req, res) {
  const phone_number = normalisePhone(req.body.phone_number);
  try {
    await checkCode(phone_number, 'verify', req.body.code);
    const result = await pool.query(
      `UPDATE "user" SET phone_verified = true WHERE phone_number = $1 RETURNING user_id`,
      [phone_number]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'No account with this phone number' });
    res.json({ message: 'Phone number verified. You can now log in.' });
  } catch (err) {
    return sendCodeError(res, err, 'Verification failed');
  }
}

async function resendVerification(req, res) {
  const phone_number = normalisePhone(req.body.phone_number);
  try {
    const result = await pool.query('SELECT phone_verified FROM "user" WHERE phone_number = $1', [phone_number]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'No account with this phone number' });
    if (result.rows[0].phone_verified) return res.status(400).json({ error: 'This phone number is already verified' });
    const { devCode } = await issueCode(phone_number, 'verify');
    res.json({ message: 'A new code has been sent.', dev_code: devCode });
  } catch (err) {
    return sendCodeError(res, err, 'Could not send a code');
  }
}

function userPayload(user) {
  return {
    user_id: user.user_id,
    full_name: user.full_name,
    role: user.role,
    platform: user.platform,
    phone_number: user.phone_number,
    national_id: user.national_id,
    national_id_verified: Boolean(user.national_id_verified_at),
  };
}

// login(): String  (returns a JWT string, per the class diagram's return type)
async function login(req, res) {
  const phone_number = normalisePhone(req.body.phone_number);
  const { password } = req.body;
  if (!phone_number || !password) {
    return res.status(400).json({ error: 'phone_number and password are required' });
  }
  try {
    const result = await pool.query('SELECT * FROM "user" WHERE phone_number = $1', [phone_number]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.is_active) return res.status(403).json({ error: 'This account has been deactivated' });
    if (!user.phone_verified) {
      return res.status(403).json({ error: 'Confirm your phone number first', code: 'PHONE_NOT_VERIFIED' });
    }

    const token = jwt.sign(
      { user_id: user.user_id, role: user.role, full_name: user.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );
    res.json({ token, user: userPayload(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
}

async function me(req, res) {
  try {
    const result = await pool.query('SELECT * FROM "user" WHERE user_id = $1', [req.user.user_id]);
    res.json(userPayload(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load profile' });
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
  const { full_name, national_id } = req.body;
  try {
    if (national_id) {
      // national ID links the account to registered parcels, so it can be set
      // once; correcting it afterwards is an administrator action
      const current = await pool.query('SELECT national_id FROM "user" WHERE user_id = $1', [req.user.user_id]);
      const existing = current.rows[0].national_id;
      if (existing && existing !== national_id) {
        return res.status(409).json({ error: 'National ID is already set; contact an administrator to change it' });
      }
    }
    await pool.query(
      `UPDATE "user" SET full_name = COALESCE($1, full_name), national_id = COALESCE(national_id, $2)
       WHERE user_id = $3`,
      [full_name || null, national_id || null, req.user.user_id]
    );
    res.json({ message: 'Profile updated' });
  } catch (err) {
    if (err.constraint === 'user_national_id_citizen_unique') {
      return res.status(409).json({ error: 'This national ID is already linked to another account. If it is yours, visit the land office.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Update failed' });
  }
}

// resetPassword(): void — change your own password while logged in
async function resetPassword(req, res) {
  const { current_password, new_password } = req.body;
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'new_password must be at least 6 characters' });
  }
  try {
    const result = await pool.query('SELECT password_hash FROM "user" WHERE user_id = $1', [req.user.user_id]);
    if (!current_password || !(await bcrypt.compare(current_password, result.rows[0].password_hash))) {
      return res.status(401).json({ error: 'Your current password is not correct' });
    }
    const password_hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE "user" SET password_hash = $1 WHERE user_id = $2', [password_hash, req.user.user_id]);
    res.json({ message: 'Password changed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Password change failed' });
  }
}

// FR20: forgotten password — citizens get an SMS code. Staff are told to ask
// an administrator. The response doesn't reveal whether a number is
// registered, except to say staff accounts are reset by an administrator.
async function forgotPassword(req, res) {
  const phone_number = normalisePhone(req.body.phone_number);
  if (!phone_number) return res.status(400).json({ error: 'phone_number is required' });
  try {
    const result = await pool.query('SELECT role, is_active FROM "user" WHERE phone_number = $1', [phone_number]);
    const user = result.rows[0];
    const generic = { message: 'If this number has a citizen account, a reset code has been sent by SMS.' };
    if (!user || !user.is_active) return res.json(generic);
    if (user.role !== 'citizen') {
      return res.json({ message: 'Land officer and administrator passwords are reset by a DLOVS administrator.', staff: true });
    }
    const { devCode } = await issueCode(phone_number, 'reset');
    res.json({ ...generic, dev_code: devCode });
  } catch (err) {
    return sendCodeError(res, err, 'Could not send a reset code');
  }
}

async function resetPasswordWithCode(req, res) {
  const phone_number = normalisePhone(req.body.phone_number);
  const { code, new_password } = req.body;
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'new_password must be at least 6 characters' });
  }
  try {
    await checkCode(phone_number, 'reset', code);
    const password_hash = await bcrypt.hash(new_password, 10);
    // a successful SMS reset also proves the phone number
    await pool.query(
      `UPDATE "user" SET password_hash = $1, phone_verified = true WHERE phone_number = $2 AND role = 'citizen'`,
      [password_hash, phone_number]
    );
    res.json({ message: 'Password reset. You can now log in.' });
  } catch (err) {
    return sendCodeError(res, err, 'Password reset failed');
  }
}

module.exports = {
  register, verifyPhone, resendVerification, login, me, logout, updateProfile, resetPassword,
  forgotPassword, resetPasswordWithCode,
};
