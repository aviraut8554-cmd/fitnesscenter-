import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '@/lib/env';
import { ApiError } from '@/lib/http';

/**
 * Symmetric encryption for per-tenant provider secrets at rest.
 *
 * Algorithm: AES-256-GCM. The 32-byte key comes from SETTINGS_ENCRYPTION_KEY
 * (hex or base64). Each ciphertext is self-describing: we store
 * base64(iv[12] || authTag[16] || ciphertext) so decryption needs only the key.
 * GCM authenticates the ciphertext, so tampering is detected on decrypt.
 */

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/** Parse SETTINGS_ENCRYPTION_KEY into a 32-byte key or throw a clear 500. */
function requireKey(): Buffer {
  const raw = env.SETTINGS_ENCRYPTION_KEY;
  if (!raw) {
    throw new ApiError(
      500,
      'encryption_not_configured',
      'Encryption is not configured: set SETTINGS_ENCRYPTION_KEY (32-byte hex or base64) to store provider credentials',
    );
  }
  // Accept hex (64 chars) or base64; both must decode to exactly 32 bytes.
  let key: Buffer | null = null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    const b64 = Buffer.from(raw, 'base64');
    if (b64.length === KEY_BYTES) key = b64;
  }
  if (!key || key.length !== KEY_BYTES) {
    throw new ApiError(
      500,
      'encryption_misconfigured',
      'SETTINGS_ENCRYPTION_KEY must decode to exactly 32 bytes (hex or base64)',
    );
  }
  return key;
}

/** Whether a usable encryption key is configured (no throw). */
export function encryptionConfigured(): boolean {
  try {
    requireKey();
    return true;
  } catch {
    return false;
  }
}

/** Encrypt a UTF-8 string, returning base64(iv || tag || ciphertext). */
export function encryptSecret(plaintext: string): string {
  const key = requireKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

/** Decrypt a base64(iv || tag || ciphertext) blob back to its UTF-8 string. */
export function decryptSecret(payload: string): string {
  const key = requireKey();
  const buf = Buffer.from(payload, 'base64');
  if (buf.length <= IV_BYTES + TAG_BYTES) {
    throw new ApiError(500, 'decrypt_failed', 'Stored secret is malformed');
  }
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const enc = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    throw new ApiError(500, 'decrypt_failed', 'Could not decrypt stored secret');
  }
}
