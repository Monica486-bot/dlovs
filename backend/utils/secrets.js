// Secrets come only from the environment (backend/.env locally, the Render
// dashboard in production). There are no built-in fallbacks: a missing secret
// stops the server instead of silently using a value anyone can read in the code.

const PLACEHOLDER = /^change_this/i;
const MIN_PRODUCTION_LENGTH = 32;

function secret(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Add it to backend/.env (see backend/.env.example).`);
  }
  if (process.env.NODE_ENV === 'production' && (PLACEHOLDER.test(value) || value.length < MIN_PRODUCTION_LENGTH)) {
    throw new Error(`${name} must be a random value of at least ${MIN_PRODUCTION_LENGTH} characters in production.`);
  }
  return value;
}

// Called once at start-up, so a misconfigured server fails immediately.
function checkSecrets() {
  secret('JWT_SECRET');
  secret('QR_SIGNING_SECRET');
}

module.exports = { secret, checkSecrets };
