// Password rule for every account, following NIST SP 800-63B: a minimum length
// and a block-list of guessable passwords, but no forced symbols or digits
// (they push people to predictable patterns like "Password1!").

export const PASSWORD_MIN_LENGTH = 8;
// bcrypt only uses the first 72 bytes; anything longer would be silently cut
const PASSWORD_MAX_BYTES = 72;

// Commonly breached passwords, plus local guesses. Compared in lower case.
const COMMON = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234', 'passw0rd', 'p@ssw0rd', 'p@ssword',
  '12345678', '123456789', '1234567890', '0123456789', '87654321', '987654321', '12341234', '11223344',
  '123123123', '147258369', '11111111', '00000000', '88888888', '99999999', '12121212',
  'qwerty12', 'qwerty123', 'qwertyuiop', 'qwer1234', '1q2w3e4r', '1qaz2wsx', 'zaq12wsx', 'asdfghjk', 'asdf1234',
  'abc12345', 'abcd1234', 'abcdefgh', 'iloveyou', 'iloveyou1', 'letmein1', 'welcome1', 'welcome123',
  'admin123', 'administrator', 'changeme', 'secret123', 'master123', 'trustno1', 'superman', 'football',
  'baseball', 'sunshine', 'princess', 'dragon123', 'monkey123', 'computer', 'internet',
  'dlovs123', 'dlovs1234', 'dlovs2026', 'juba1234', 'juba2026', 'southsudan', 'southsudan1', 'landoffice',
]);

// Returns why a password is refused, or null if it's acceptable.
export function passwordProblem(password: unknown, phoneNumber?: string | null): string | null {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
    return 'Password is too long (at most 72 characters)';
  }
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) {
    return 'This password is too common. Choose something harder to guess.';
  }
  // the phone number is often known to others, so it can't be the password
  const digits = password.replace(/[\s+()-]/g, '');
  const phoneDigits = String(phoneNumber || '').replace(/\D/g, '');
  if (/^\d+$/.test(digits) && phoneDigits.length >= 7 && (phoneDigits.endsWith(digits.slice(-9)) || digits.endsWith(phoneDigits.slice(-9)))) {
    return "Don't use your phone number as your password.";
  }
  return null;
}
