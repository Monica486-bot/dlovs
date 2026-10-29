require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcrypt');
const pool = require('../dist/db/pool').default;
const { passwordProblem } = require('../dist/utils/passwords');

// Creates the first administrator account.
// Usage: npm run create-admin -- "Full Name" "+211900000000" "password"
async function main() {
  const [fullName, phoneNumber, password] = process.argv.slice(2);
  if (!fullName || !phoneNumber || !password) {
    console.error('Usage: npm run create-admin -- "Full Name" "+211900000000" "password"');
    process.exit(1);
  }
  const weak = passwordProblem(password, phoneNumber);
  if (weak) {
    console.error(weak);
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    `INSERT INTO "user" (full_name, phone_number, password_hash, role, platform, phone_verified)
     VALUES ($1, $2, $3, 'administrator', 'web', true)
     ON CONFLICT (phone_number) DO UPDATE SET role = 'administrator', platform = 'web', is_active = true, phone_verified = true
     RETURNING user_id, (xmax = 0) AS inserted`,
    [fullName, phoneNumber, passwordHash]
  );
  const { user_id, inserted } = result.rows[0];
  console.log(
    inserted
      ? `Administrator created: ${fullName} (${phoneNumber}), user #${user_id}`
      : `Existing account ${phoneNumber} (user #${user_id}) promoted to administrator; its password was not changed`
  );
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
