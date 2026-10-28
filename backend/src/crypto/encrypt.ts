import crypto from 'crypto';
import { config } from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit authentication tag

function getKey(keyHex?: string): Buffer {
  const hex = keyHex || config.DOC_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('Encryption key must be exactly 64 hex characters (32 bytes).');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypts a plaintext Buffer or string with AES-256-GCM.
 * Output Buffer structure: [IV (12 bytes)] [Auth Tag (16 bytes)] [Ciphertext]
 */
export function encryptData(plaintext: Buffer | string, keyHex?: string): Buffer {
  const key = getKey(keyHex);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const inputBuffer = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf8');
  const ciphertext = Buffer.concat([cipher.update(inputBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, ciphertext]);
}

/**
 * Decrypts a payload encrypted with encryptData.
 * Authenticates ciphertext with GCM auth tag, throwing an error if data is tampered.
 */
export function decryptData(encryptedBuffer: Buffer, keyHex?: string): Buffer {
  if (encryptedBuffer.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Invalid encrypted payload: buffer too short.');
  }

  const key = getKey(keyHex);
  const iv = encryptedBuffer.subarray(0, IV_LENGTH);
  const authTag = encryptedBuffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = encryptedBuffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Convenience helper to encrypt a UTF-8 string.
 */
export function encryptString(text: string, keyHex?: string): Buffer {
  return encryptData(Buffer.from(text, 'utf8'), keyHex);
}

/**
 * Convenience helper to decrypt to a UTF-8 string.
 */
export function decryptString(encryptedBuffer: Buffer, keyHex?: string): string {
  return decryptData(encryptedBuffer, keyHex).toString('utf8');
}
