const PLACEHOLDER = /^change_this/i;
const MIN_PRODUCTION_LENGTH = 32;

export function secret(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Add it to backend/.env (see backend/.env.example).`);
  }
  if (process.env.NODE_ENV === 'production' && (PLACEHOLDER.test(value) || value.length < MIN_PRODUCTION_LENGTH)) {
    throw new Error(`${name} must be a random value of at least ${MIN_PRODUCTION_LENGTH} characters in production.`);
  }
  return value;
}

export function checkSecrets(): void {
  secret('JWT_SECRET');
  secret('QR_SIGNING_PRIVATE_KEY');
}
