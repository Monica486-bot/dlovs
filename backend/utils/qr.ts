import crypto from 'crypto';
import QRCode from 'qrcode';
import { secret } from './secrets';

// QR codes are signed with an Ed25519 private key that only the server holds.
// The mobile app carries the matching public key, so it can check a code
// offline but can never create one (NFR03, Figure 5 step 4).
const PRIVATE_KEY = crypto.createPrivateKey({
  key: Buffer.from(secret('QR_SIGNING_PRIVATE_KEY'), 'base64'),
  format: 'der',
  type: 'pkcs8',
});
const PUBLIC_KEY = crypto.createPublicKey(PRIVATE_KEY);
const PUBLIC_WEB_URL = (process.env.PUBLIC_WEB_URL || 'http://localhost:5173').replace(/\/+$/, '');

export interface QrPayload {
  code: string;
  signature: string;
}

export interface QrDataUrl extends QrPayload {
  dataUrl: string;
}

// The signed text. The app builds the same string to check a code, so the two
// must match exactly (mobile/src/utils/qr.ts).
function qrMessage(parcelId: number | string, version: number | string): Buffer {
  return Buffer.from(`DLOVS|${parcelId}|${version}`);
}

// Raw 32-byte public key, base64url, as the app stores it.
export const QR_PUBLIC_KEY = PUBLIC_KEY.export({ format: 'jwk' }).x as string;

export function signParcelId(parcelId: number | string, version: number | string = 1): string {
  return crypto.sign(null, qrMessage(parcelId, version), PRIVATE_KEY).toString('base64url');
}

function isSignedVersion(parcelId: number | string, version: number, signature: string): boolean {
  const bytes = Buffer.from(signature, 'base64url');
  return bytes.length === 64 && crypto.verify(null, qrMessage(parcelId, version), PUBLIC_KEY, bytes);
}

// A code names the version it was issued as. Codes from before a transfer are
// genuine but replaced; anything that doesn't verify is refused.
export function checkSignature(
  parcelId: number | string,
  currentVersion: number | string,
  signature: string,
  claimedVersion?: number | string
): 'valid' | 'superseded' | 'invalid' {
  const current = Number(currentVersion);
  const versions = claimedVersion !== undefined
    ? [Number(claimedVersion)]
    : Array.from({ length: current }, (_, i) => current - i);
  for (const version of versions) {
    if (!Number.isInteger(version) || version < 1 || version > current) continue;
    if (isSignedVersion(parcelId, version, signature)) return version === current ? 'valid' : 'superseded';
  }
  return 'invalid';
}

export function buildQrPayload(parcelId: number | string, version: number | string = 1): QrPayload {
  const signature = signParcelId(parcelId, version);
  return { code: `${PUBLIC_WEB_URL}/verify/${parcelId}?v=${version}&s=${signature}`, signature };
}

export async function generateQrDataUrl(parcelId: number | string, version: number | string = 1): Promise<QrDataUrl> {
  const { code, signature } = buildQrPayload(parcelId, version);
  const dataUrl = await QRCode.toDataURL(code, { errorCorrectionLevel: 'M', margin: 2, width: 400 });
  return { code, signature, dataUrl };
}
