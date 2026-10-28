import { describe, it, expect, beforeEach } from 'vitest';
import {
  login,
  createInvoice,
  commitInvoice,
  submitAcknowledgement,
  releaseInvoice,
  createPledge,
  settleInvoice,
  getInvoice,
  getBuyers,
} from '../api/endpoints.js';
import { ApiError } from '../api/client.js';
import { resetDb } from '../api/mock/db.js';

describe('Full Invoice Financing Lifecycle (Mock Integration)', () => {
  beforeEach(() => {
    resetDb();
  });

  it('runs complete lifecycle: create -> commit -> acknowledge -> release -> pledge -> duplicate blocked -> settle', async () => {
    // 1. Login as Supplier
    const supLogin = await login({
      email: 'supplier@demo.com',
      password: 'password1234',
    });
    expect(supLogin.user.role).toBe('SUPPLIER');

    // Get buyers list
    const buyers = await getBuyers();
    expect(buyers.length).toBeGreaterThan(0);
    const buyerId = buyers[0].id;

    // 2. Create invoice (DRAFT)
    const invRes = await createInvoice({
      invoiceNumber: 'INV-TEST-999',
      buyerId,
      amountMinorUnits: '500000', // ₹5,000.00
      currency: 'INR',
      issueDate: '2026-03-01',
      dueDate: '2026-04-01',
    });
    expect(invRes.invoice.status).toBe('DRAFT');
    expect(invRes.invoice.commitment).toBeNull();
    const invoiceId = invRes.invoice.id;

    // 3. Commit invoice (DRAFT -> PENDING_ACK)
    const commitRes = await commitInvoice(invoiceId);
    expect(commitRes.invoice.status).toBe('PENDING_ACK');
    expect(commitRes.invoice.commitment).toMatch(/^0x[a-f0-9]{64}$/i);

    // 4. Login as Buyer & Acknowledge
    const buyerLogin = await login({
      email: 'buyer@demo.com',
      password: 'password1234',
    });
    expect(buyerLogin.user.role).toBe('BUYER');

    const ackRes = await submitAcknowledgement(invoiceId, {
      decision: 'ACKNOWLEDGE',
    });
    expect(ackRes.invoice.status).toBe('ACKNOWLEDGED');

    // 5. Login back as Supplier & Release for financing
    await login({
      email: 'supplier@demo.com',
      password: 'password1234',
    });

    const releaseRes = await releaseInvoice(invoiceId);
    expect(releaseRes.invoice.status).toBe('AVAILABLE');

    // 6. Login as Financier & Submit financing pledge
    const finLogin = await login({
      email: 'financier@demo.com',
      password: 'password1234',
    });
    expect(finLogin.user.role).toBe('FINANCIER');

    const pledgeRes = await createPledge(invoiceId, {
      advanceMinorUnits: '400000', // ₹4,000.00 advance
      note: 'Advance facility agreement #101',
    });
    expect(pledgeRes.pledge.status).toBe('REGISTERED');
    expect(pledgeRes.pledge.pledgeMarker).toMatch(/^0x[a-f0-9]{64}$/i);

    // Check invoice is now PLEDGED
    const pledgedInv = await getInvoice(invoiceId);
    expect(pledgedInv.invoice.status).toBe('PLEDGED');

    // 7. DEMO MOMENT: Attempt DUPLICATE PLEDGE on the same invoice!
    try {
      await createPledge(invoiceId, {
        advanceMinorUnits: '350000',
        note: 'Attempting duplicate financing',
      });
      expect.fail('Expected duplicate pledge to throw ApiError');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.code).toBe('DUPLICATE_PLEDGE');
      expect((apiErr.details as { pledgeMarker?: string })?.pledgeMarker).toBe(
        pledgeRes.pledge.pledgeMarker,
      );
    }

    // 8. Financier settles the invoice (PLEDGED -> SETTLED)
    const settleRes = await settleInvoice(invoiceId);
    expect(settleRes.invoice.status).toBe('SETTLED');
  });
});
