import crypto from 'crypto';
import QRCode from 'qrcode';
import { secret } from './secrets';

const QR_SECRET = secret('QR_SIGNING_SECRET');
const PUBLIC_WEB_URL = (process.env.PUBLIC_WEB_URL || 'http://localhost:5173').replace(/\/+$/, '');

export interface QrPayload {
  code: string;
  signature: string;
}

export interface QrDataUrl extends QrPayload {
  dataUrl: string;
}

function signParcelId(parcelId: number | string, version = 1): string {
  const message = Number(version) === 1 ? String(parcelId) : `${parcelId}:v${version}`;
  return crypto.createHmac('sha256', QR_SECRET).update(message).digest('hex').slice(0, 16);
}

function sameSignature(expected: string, given: string | undefined | null): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(String(given || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function checkSignature(
  parcelId: number | string,
  currentVersion: number | string,
  signature: string
): 'valid' | 'superseded' | 'invalid' {
  if (sameSignature(signParcelId(parcelId, Number(currentVersion)), signature)) return 'valid';
  for (let v = Number(currentVersion) - 1; v >= 1; v--) {
    if (sameSignature(signParcelId(parcelId, v), signature)) return 'superseded';
  }
  return 'invalid';
}

export function buildQrPayload(parcelId: number | string, version = 1): QrPayload {
  const signature = signParcelId(parcelId, version);
  return { code: `${PUBLIC_WEB_URL}/verify/${parcelId}?s=${signature}`, signature };
}

export async function generateQrDataUrl(parcelId: number | string, version = 1): Promise<QrDataUrl> {
  const { code, signature } = buildQrPayload(parcelId, version);
  const dataUrl = await QRCode.toDataURL(code, { errorCorrectionLevel: 'M', margin: 2, width: 400 });
  return { code, signature, dataUrl };
}

export { signParcelId };
