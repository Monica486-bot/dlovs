// Prints a new Ed25519 key pair for signing QR codes.
//   QR_SIGNING_PRIVATE_KEY goes in backend/.env (or Render) and stays secret.
//   The public key is served at GET /api/parcels/qr-public-key; it can also be
//   built into the app as EXPO_PUBLIC_QR_PUBLIC_KEY.
// A new key makes every printed QR code invalid, so after changing it run
// `npm run resign-qr` and reprint the markers.
const crypto = require('crypto');

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
console.log(`QR_SIGNING_PRIVATE_KEY=${privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')}`);
console.log(`EXPO_PUBLIC_QR_PUBLIC_KEY=${publicKey.export({ format: 'jwk' }).x}`);
