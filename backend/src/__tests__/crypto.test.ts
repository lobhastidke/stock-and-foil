import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import { toCanonicalJson, normalizeMinorUnits } from '../crypto/canonical.js';
import { computeCommitment, verifyCommitment, generateSalt } from '../crypto/commitment.js';
import { computePledgeMarker } from '../crypto/marker.js';
import { computeUserRef } from '../crypto/refs.js';
import { encryptString, decryptString, encryptData, decryptData } from '../crypto/encrypt.js';

describe('Cryptography Suite (Block A Section 3)', () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const vectorsPath = path.resolve(currentDir, '../../../docs/commitment-vectors.json');
  const vectors = JSON.parse(fs.readFileSync(vectorsPath, 'utf8'));

  describe('docs/commitment-vectors.json Test Vectors Verification', () => {
    it('verifies all test vectors match computed commitments, markers, and refs', () => {
      expect(vectors.length).toBeGreaterThanOrEqual(5);

      for (const v of vectors) {
        const canonical = toCanonicalJson(v.input);
        expect(canonical).toBe(v.canonicalJson);

        const commitment = computeCommitment(v.salt, canonical);
        expect(commitment.toLowerCase()).toBe(v.commitment.toLowerCase());

        const marker = computePledgeMarker(commitment);
        expect(marker.toLowerCase()).toBe(v.pledgeMarker.toLowerCase());

        const supplierRef = computeUserRef(v.input.supplierId);
        expect(supplierRef.toLowerCase()).toBe(v.supplierRef.toLowerCase());

        const buyerRef = computeUserRef(v.input.buyerId);
        expect(buyerRef.toLowerCase()).toBe(v.buyerRef.toLowerCase());

        const isValid = verifyCommitment(v.salt, v.input, v.commitment);
        expect(isValid).toBe(true);
      }
    });
  });

  describe('Canonicalization & Normalization Guarantees', () => {
    it('normalizes string "500000" and number 500000 and 00500000 identically', () => {
      expect(normalizeMinorUnits('500000')).toBe('500000');
      expect(normalizeMinorUnits('00500000')).toBe('500000');
      expect(normalizeMinorUnits(500000)).toBe('500000');
      expect(normalizeMinorUnits(BigInt(500000))).toBe('500000');
    });

    it('rejects zero, negative, or decimal amounts in minor units', () => {
      expect(() => normalizeMinorUnits('0')).toThrow();
      expect(() => normalizeMinorUnits('-500')).toThrow();
      expect(() => normalizeMinorUnits('500.25')).toThrow();
      expect(() => normalizeMinorUnits('abc')).toThrow();
    });

    it('normalizes Unicode NFC (combining acute vs precomposed é)', () => {
      const decomposed = 'INV-CAFE\u0301-01'; // 'E' + '\u0301'
      const precomposed = 'INV-CAFÉ-01'; // '\u00C9'
      const base = {
        invoiceNumber: decomposed,
        supplierId: '11111111-1111-1111-1111-111111111111',
        buyerId: '22222222-2222-2222-2222-222222222222',
        amountMinorUnits: '1000',
        currency: 'INR',
        issueDate: '2026-01-01',
        dueDate: '2026-02-01',
      };
      const json1 = toCanonicalJson(base);
      const json2 = toCanonicalJson({ ...base, invoiceNumber: precomposed });
      expect(json1).toBe(json2);
    });

    it('changing ANY committed field alters the commitment and fails verification', () => {
      const v = vectors[0];
      expect(verifyCommitment(v.salt, v.input, v.commitment)).toBe(true);

      // Tamper with amount
      expect(verifyCommitment(v.salt, { ...v.input, amountMinorUnits: '500001' }, v.commitment)).toBe(false);

      // Tamper with invoiceNumber
      expect(verifyCommitment(v.salt, { ...v.input, invoiceNumber: 'INV-2026-001X' }, v.commitment)).toBe(false);

      // Tamper with dueDate
      expect(verifyCommitment(v.salt, { ...v.input, dueDate: '2026-04-02' }, v.commitment)).toBe(false);

      // Tamper with currency
      expect(verifyCommitment(v.salt, { ...v.input, currency: 'USD' }, v.commitment)).toBe(false);
    });

    it('identical invoice data with two different random salts produces different commitments', () => {
      const v = vectors[0].input;
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      expect(salt1).not.toBe(salt2);

      const res1 = computeCommitment(salt1, toCanonicalJson(v));
      const res2 = computeCommitment(salt2, toCanonicalJson(v));
      expect(res1).not.toBe(res2);
    });
  });

  describe('AES-256-GCM Encryption & Tamper Resistance', () => {
    it('encrypts and decrypts strings correctly', () => {
      const secret = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const encrypted = encryptString(secret);
      const decrypted = decryptString(encrypted);
      expect(decrypted).toBe(secret);
    });

    it('fails decryption if ciphertext or auth tag is tampered', () => {
      const secret = 'Confidential Invoice Document Bytes';
      const encrypted = encryptData(Buffer.from(secret, 'utf8'));

      // Tamper a single byte in ciphertext
      encrypted[encrypted.length - 1] ^= 0xff;

      expect(() => decryptData(encrypted)).toThrow();
    });
  });
});
