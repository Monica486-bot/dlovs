// Encrypted document storage (FR10, NFR10).
//
// Every file is encrypted with AES-256-GCM before it leaves this process, so
// encryption at rest doesn't depend on the storage provider. The stored blob
// is: 12-byte IV | 16-byte auth tag | ciphertext.
//
// Where blobs go:
//   - Cloudinary (private raw uploads) when CLOUDINARY_URL is set
//   - otherwise the local directory UPLOAD_DIR (default backend/uploads).
//     Note: Render's free web services have no persistent disk, so use
//     Cloudinary there.
//
// DOCUMENT_ENCRYPTION_KEY: 32 bytes as 64 hex characters. Generate one with
//   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// Losing this key makes every stored document unreadable.

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const useCloudinary = Boolean(process.env.CLOUDINARY_URL);
let cloudinary = null;
if (useCloudinary) {
  cloudinary = require('cloudinary').v2; // reads CLOUDINARY_URL from the environment
}

function encryptionKey() {
  const hex = process.env.DOCUMENT_ENCRYPTION_KEY;
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) return Buffer.from(hex, 'hex');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DOCUMENT_ENCRYPTION_KEY must be set to 64 hex characters in production');
  }
  // development fallback, derived from the JWT secret so it's stable across restarts
  return crypto.createHash('sha256').update(`dlovs-documents:${process.env.JWT_SECRET || 'dev'}`).digest();
}

function encrypt(buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}

function decrypt(blob) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), blob.subarray(0, 12));
  decipher.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]);
}

// Returns a storage reference to save in document.file_url.
async function saveDocument(buffer) {
  const blob = encrypt(buffer);
  const name = crypto.randomUUID();
  if (useCloudinary) {
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ resource_type: 'raw', type: 'private', folder: 'dlovs', public_id: `${name}.bin` }, (err, res) =>
          err ? reject(err) : resolve(res)
        )
        .end(blob);
    });
    return `cloudinary:${result.public_id}`;
  }
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, `${name}.bin`), blob);
  return `local:${name}.bin`;
}

// Returns the decrypted file contents.
async function readDocument(reference) {
  let blob;
  if (reference.startsWith('local:')) {
    const name = path.basename(reference.slice('local:'.length)); // basename: no path traversal
    blob = await fs.readFile(path.join(UPLOAD_DIR, name));
  } else if (reference.startsWith('cloudinary:')) {
    if (!cloudinary) throw new Error('Document is stored in Cloudinary but CLOUDINARY_URL is not set');
    const publicId = reference.slice('cloudinary:'.length);
    const url = cloudinary.utils.private_download_url(publicId, '', {
      resource_type: 'raw',
      type: 'private',
      expires_at: Math.floor(Date.now() / 1000) + 60,
    });
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Cloudinary download failed (${response.status})`);
    blob = Buffer.from(await response.arrayBuffer());
  } else {
    throw new Error('Unknown document storage reference');
  }
  return decrypt(blob);
}

module.exports = { saveDocument, readDocument, storageBackend: useCloudinary ? 'cloudinary' : 'local' };
