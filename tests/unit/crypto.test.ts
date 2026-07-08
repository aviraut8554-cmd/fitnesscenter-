import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret, encryptionConfigured } from '@/lib/crypto';

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a UTF-8 secret', () => {
    const plain = 'rzp_test_secret_ünîcode_🔐';
    const enc = encryptSecret(plain);
    expect(enc).not.toContain(plain);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it('produces different ciphertext each time (random IV)', () => {
    const a = encryptSecret('same-value');
    const b = encryptSecret('same-value');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('same-value');
    expect(decryptSecret(b)).toBe('same-value');
  });

  it('rejects tampered ciphertext (GCM auth tag)', () => {
    const enc = encryptSecret('do-not-tamper');
    const buf = Buffer.from(enc, 'base64');
    buf[buf.length - 1] ^= 0xff; // flip the last byte of the ciphertext
    expect(() => decryptSecret(buf.toString('base64'))).toThrow();
  });

  it('rejects a malformed (too short) payload', () => {
    expect(() => decryptSecret('AAAA')).toThrow();
  });

  it('reports encryption configured under the test key', () => {
    expect(encryptionConfigured()).toBe(true);
  });
});
