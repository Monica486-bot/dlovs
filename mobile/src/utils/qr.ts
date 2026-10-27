const SIGNATURE = /^[0-9a-f]{16}$/;

// Reads a DLOVS QR code (verification URL or older JSON). The API checks the
// signature; the app can't hold the signing secret.
export interface ParcelQr {
  parcelId: string;
  signature: string;
}

export function parseParcelQr(data: string): ParcelQr | null {
  const text = String(data || '').trim();
  const url = text.match(/\/verify\/(\d+)\?(?:.*&)?s=([0-9a-f]+)/);
  if (url && SIGNATURE.test(url[2])) return { parcelId: url[1], signature: url[2] };
  try {
    const payload = JSON.parse(text) as { p?: unknown; s?: unknown } | null;
    const parcelId = payload?.p;
    const signature = payload?.s;
    if (parcelId == null || !/^\d+$/.test(String(parcelId)) || !SIGNATURE.test(String(signature))) return null;
    return { parcelId: String(parcelId), signature: signature as string };
  } catch (err) {
    return null;
  }
}
