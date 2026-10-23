const crypto = require('crypto');
const QRCode = require('qrcode');
const { secret } = require('./secrets');

const QR_SECRET = secret('QR_SIGNING_SECRET');
// Where the web app's public pages live (no trailing slash).
const PUBLIC_WEB_URL = (process.env.PUBLIC_WEB_URL || 'http://localhost:5173').replace(/\/+$/, '');

// FR05 / FR11: the signature covers a version number that changes on each transfer
// Version 1 signs the bare parcel ID, which keeps every code printed before
// versioning existed valid.
function signParcelId(parcelId, version = 1) {
  const message = Number(version) === 1 ? String(parcelId) : `${parcelId}:v${version}`;
  return crypto.createHmac('sha256', QR_SECRET).update(message).digest('hex').slice(0, 16);
}

function sameSignature(expected, given) {
  const a = Buffer.from(expected);
  const b = Buffer.from(String(given || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// 'valid': the parcel's current code
// 'superseded': a genuine code from before the latest transfer
// 'invalid': not a code DLOVS issued for this parcel
function checkSignature(parcelId, currentVersion, signature) {
  if (sameSignature(signParcelId(parcelId, currentVersion), signature)) return 'valid';
  for (let v = Number(currentVersion) - 1; v >= 1; v--) {
    if (sameSignature(signParcelId(parcelId, v), signature)) return 'superseded';
  }
  return 'invalid';
}

// FR05: the QR code is the parcel's verification URL
function buildQrPayload(parcelId, version = 1) {
  const signature = signParcelId(parcelId, version);
  return { code: `${PUBLIC_WEB_URL}/verify/${parcelId}?s=${signature}`, signature };
}

async function generateQrDataUrl(parcelId, version = 1) {
  const { code, signature } = buildQrPayload(parcelId, version);
  const dataUrl = await QRCode.toDataURL(code, { errorCorrectionLevel: 'M', margin: 2, width: 400 });
  return { code, signature, dataUrl };
}

module.exports = { signParcelId, checkSignature, buildQrPayload, generateQrDataUrl };
