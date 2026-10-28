// Reads and checks DLOVS QR codes. A code is a verification URL,
// <web>/verify/<parcel>?v=<version>&s=<signature>, where the signature is
// Ed25519 over "DLOVS|<parcel>|<version>". The server signs with its private
// key; the app checks with the public key, so a forged code is caught even
// offline (NFR03, Figure 5 step 4). The app can never create a code.
import AsyncStorage from '@react-native-async-storage/async-storage';
import nacl from 'tweetnacl';
import { api } from '../api/client';

export interface ParcelQr {
  parcelId: string;
  version: string;
  signature: string;
}

const SIGNATURE = /^[A-Za-z0-9_-]{86}$/;
const KEY_STORAGE = 'dlovs_qr_public_key_v1';
const BUILT_IN_KEY = process.env.EXPO_PUBLIC_QR_PUBLIC_KEY || null;

function queryValue(query: string, name: string): string | null {
  for (const pair of query.split('&')) {
    const [key, value = ''] = pair.split('=');
    if (key === name) return decodeURIComponent(value);
  }
  return null;
}

export function parseParcelQr(data: string): ParcelQr | null {
  const match = String(data || '').trim().match(/\/verify\/(\d+)\?([^#]*)/);
  if (!match) return null;
  const version = queryValue(match[2], 'v');
  const signature = queryValue(match[2], 's');
  if (!version || !/^\d+$/.test(version) || !signature || !SIGNATURE.test(signature)) return null;
  return { parcelId: match[1], version, signature };
}

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function fromBase64Url(text: string): Uint8Array {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of text) {
    const value = BASE64URL.indexOf(char);
    if (value < 0) throw new Error('not base64url');
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

// True only if the server's private key signed this parcel and version.
export function isGenuineQr(qr: ParcelQr, publicKey: string): boolean {
  try {
    const key = fromBase64Url(publicKey);
    const signature = fromBase64Url(qr.signature);
    if (key.length !== 32 || signature.length !== 64) return false;
    const message = Uint8Array.from(`DLOVS|${qr.parcelId}|${qr.version}`, (c) => c.charCodeAt(0));
    return nacl.sign.detached.verify(message, signature, key);
  } catch (err) {
    return false;
  }
}

// The key last fetched from the server, else the one built into the app.
export async function getQrPublicKey(): Promise<string | null> {
  try {
    return (await AsyncStorage.getItem(KEY_STORAGE)) || BUILT_IN_KEY;
  } catch (err) {
    return BUILT_IN_KEY;
  }
}

// Called at start-up; keeps the key so codes can be checked offline later.
export async function refreshQrPublicKey(): Promise<void> {
  try {
    const { public_key: key } = await api.get<{ public_key: string }>('/parcels/qr-public-key');
    if (/^[A-Za-z0-9_-]{43}$/.test(key)) await AsyncStorage.setItem(KEY_STORAGE, key);
  } catch (err) {
    // offline: keep the stored key
  }
}
