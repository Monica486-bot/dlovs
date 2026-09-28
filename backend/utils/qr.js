// QR code generation + cryptographic signature utilities.
// Matches Sequence Diagram (Figure 5): the QR encodes a parcelId plus a
// signature so the mobile app can verify authenticity locally before ever
// calling the API (step 3-4 of the 12-step flow).

const crypto = require('crypto');
const QRCode = require('qrcode');

const QR_SECRET = process.env.QR_SIGNING_SECRET || 'dev-secret';

function signParcelId(parcelId) {
  return crypto
    .createHmac('sha256', QR_SECRET)
    .update(String(parcelId))
    .digest('hex')
    .slice(0, 16);
}

function verifySignature(parcelId, signature) {
  const expected = signParcelId(parcelId);
  // constant-time compare
  const a = Buffer.from(expected);
  const b = Buffer.from(signature || '');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// The QR payload is a small JSON blob: {p: parcelId, s: signature}
function buildQrPayload(parcelId) {
  const signature = signParcelId(parcelId);
  return { code: JSON.stringify({ p: parcelId, s: signature }), signature };
}

async function generateQrDataUrl(parcelId) {
  const { code } = buildQrPayload(parcelId);
  const dataUrl = await QRCode.toDataURL(code, { errorCorrectionLevel: 'M', margin: 2, width: 400 });
  return { code, dataUrl };
}

module.exports = { signParcelId, verifySignature, buildQrPayload, generateQrDataUrl };
