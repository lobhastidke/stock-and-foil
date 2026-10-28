import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  loginSchema,
  invoiceFormSchema,
  acknowledgeSchema,
  pledgeFormSchema,
} from '../lib/validation.js';

describe('Zod form validation schemas', () => {
  describe('registerSchema', () => {
    it('accepts valid registration input', () => {
      const res = registerSchema.safeParse({
        email: 'user@example.com',
        password: 'ValidPassword123!',
        confirmPassword: 'ValidPassword123!',
        displayName: 'Acme Supplier',
        organisation: 'Acme Corp',
        role: 'SUPPLIER',
      });
      expect(res.success).toBe(true);
    });

    it('rejects short password (< 10 chars per contract)', () => {
      const res = registerSchema.safeParse({
        email: 'user@example.com',
        password: 'Short1!',
        confirmPassword: 'Short1!',
        displayName: 'Acme',
        organisation: 'Acme Corp',
        role: 'SUPPLIER',
      });
      expect(res.success).toBe(false);
    });

    it('rejects mismatched passwords', () => {
      const res = registerSchema.safeParse({
        email: 'user@example.com',
        password: 'ValidPassword123!',
        confirmPassword: 'DifferentPassword123!',
        displayName: 'Acme',
        organisation: 'Acme Corp',
        role: 'SUPPLIER',
      });
      expect(res.success).toBe(false);
    });
  });

  describe('loginSchema', () => {
    it('accepts valid email and password', () => {
      const res = loginSchema.safeParse({
        email: 'test@example.com',
        password: 'password123',
      });
      expect(res.success).toBe(true);
    });

    it('rejects invalid email', () => {
      const res = loginSchema.safeParse({
        email: 'not-an-email',
        password: 'password123',
      });
      expect(res.success).toBe(false);
    });
  });

  describe('invoiceFormSchema', () => {
    it('accepts valid invoice input', () => {
      const res = invoiceFormSchema.safeParse({
        invoiceNumber: 'INV-2026-001',
        buyerId: 'b0000000-0000-0000-0000-000000000002',
        amountMajor: '5000.00',
        currency: 'INR',
        issueDate: '2026-01-01',
        dueDate: '2026-02-01',
      });
      expect(res.success).toBe(true);
    });

    it('rejects when due date is before issue date', () => {
      const res = invoiceFormSchema.safeParse({
        invoiceNumber: 'INV-2026-001',
        buyerId: 'b0000000-0000-0000-0000-000000000002',
        amountMajor: '5000.00',
        currency: 'INR',
        issueDate: '2026-02-01',
        dueDate: '2026-01-01',
      });
      expect(res.success).toBe(false);
    });
  });

  describe('acknowledgeSchema', () => {
    it('accepts ACKNOWLEDGE without reason', () => {
      const res = acknowledgeSchema.safeParse({
        decision: 'ACKNOWLEDGE',
      });
      expect(res.success).toBe(true);
    });

    it('rejects REJECT without reason', () => {
      const res = acknowledgeSchema.safeParse({
        decision: 'REJECT',
      });
      expect(res.success).toBe(false);
    });

    it('accepts REJECT with reason', () => {
      const res = acknowledgeSchema.safeParse({
        decision: 'REJECT',
        reason: 'Goods not received',
      });
      expect(res.success).toBe(true);
    });
  });

  describe('pledgeFormSchema', () => {
    it('accepts valid advance amount', () => {
      const res = pledgeFormSchema.safeParse({
        advance: '4000.00',
        note: 'Pledge note',
      });
      expect(res.success).toBe(true);
    });

    it('rejects negative or non-numeric amount', () => {
      const res = pledgeFormSchema.safeParse({
        advance: '-100',
      });
      expect(res.success).toBe(false);
    });
  });
});
