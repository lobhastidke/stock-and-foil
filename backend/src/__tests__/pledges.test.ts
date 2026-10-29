import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { initDb, closeDb, query } from '../db/index.js';
import { computePledgeMarker } from '../crypto/marker.js';

describe('Pledges & Double-Financing Prevention API (/api/v1/invoices/:id/pledges)', () => {
  const app = createApp();

  let supplierCookie: string;
  let buyerCookie: string;
  let financier1Cookie: string;
  let financier2Cookie: string;

  let supplierId: string;
  let buyerId: string;
  let financier1Id: string;
  let financier2Id: string;

  let invoiceId: string;
  let invoiceCommitment: string;
  let expectedMarker: string;

  beforeAll(async () => {
    await initDb();

    async function setupUser(email: string, role: string, name: string) {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .set('X-SF-CSRF', '1')
        .send({
          email,
          password: 'password12345',
          displayName: name,
          organisation: `${name} Org`,
          role,
        });
      return { id: res.body.data.id, cookie: res.headers['set-cookie'][0] };
    }

    const s = await setupUser('supplier.pl@test.com', 'SUPPLIER', 'Supplier Pl');
    supplierId = s.id;
    supplierCookie = s.cookie;

    const b = await setupUser('buyer.pl@test.com', 'BUYER', 'Buyer Pl');
    buyerId = b.id;
    buyerCookie = b.cookie;

    const f1 = await setupUser('fin1.pl@test.com', 'FINANCIER', 'Financier One');
    financier1Id = f1.id;
    financier1Cookie = f1.cookie;

    const f2 = await setupUser('fin2.pl@test.com', 'FINANCIER', 'Financier Two');
    financier2Id = f2.id;
    financier2Cookie = f2.cookie;

    // Create, commit, acknowledge, and release an invoice to AVAILABLE status
    const createRes = await request(app)
      .post('/api/v1/invoices')
      .set('Cookie', supplierCookie)
      .set('X-SF-CSRF', '1')
      .send({
        invoiceNumber: 'INV-PLEDGE-001',
        buyerId,
        amountMinorUnits: '1000000', // 10,000.00
        currency: 'INR',
        issueDate: '2026-03-01',
        dueDate: '2026-04-01',
      });
    invoiceId = createRes.body.data.id;

    // Commit
    const commitRes = await request(app)
      .post(`/api/v1/invoices/${invoiceId}/commit`)
      .set('Cookie', supplierCookie)
      .set('X-SF-CSRF', '1')
      .send({});
    invoiceCommitment = commitRes.body.data.commitment;
    expectedMarker = computePledgeMarker(invoiceCommitment);

    // Acknowledge
    await request(app)
      .post(`/api/v1/invoices/${invoiceId}/acknowledgement`)
      .set('Cookie', buyerCookie)
      .set('X-SF-CSRF', '1')
      .send({ decision: 'ACKNOWLEDGE' });

    // Release to AVAILABLE
    await request(app)
      .post(`/api/v1/invoices/${invoiceId}/release`)
      .set('Cookie', supplierCookie)
      .set('X-SF-CSRF', '1')
      .send({});
  });

  afterAll(async () => {
    await closeDb();
  });

  describe('SQL-Level Partial Unique Index Verification', () => {
    it('idx_pledges_pledge_marker rejects duplicate pledge_marker on active status', async () => {
      const testMarker = '0x1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff';
      // First insert succeeds
      await query(
        `INSERT INTO pledges (invoice_id, commitment, pledge_marker, financier_id, advance_minor_units, status)
         VALUES ($1, $2, $3, $4, 500000, 'REQUESTED')`,
        [invoiceId, invoiceCommitment, testMarker, financier1Id]
      );

      // Second insert with the exact same pledge_marker MUST violate the unique constraint
      await expect(
        query(
          `INSERT INTO pledges (invoice_id, commitment, pledge_marker, financier_id, advance_minor_units, status)
           VALUES ($1, $2, $3, $4, 500000, 'REQUESTED')`,
          [invoiceId, invoiceCommitment, testMarker, financier2Id]
        )
      ).rejects.toThrow();

      // Clean up test marker rows
      await query('DELETE FROM pledges WHERE pledge_marker = $1', [testMarker]);
    });
  });

  describe('Single-Pledge & Duplicate-Pledge Rejection (The Demo Moment)', () => {
    let successfulPledgeId: string;

    it('Financier 1 pledges on AVAILABLE invoice: succeeds (201 Created)', async () => {
      const res = await request(app)
        .post(`/api/v1/invoices/${invoiceId}/pledges`)
        .set('Cookie', financier1Cookie)
        .set('X-SF-CSRF', '1')
        .send({
          advanceMinorUnits: '800000',
          note: 'Approved 80% financing advance.',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.pledgeMarker.toLowerCase()).toBe(expectedMarker.toLowerCase());
      expect(res.body.data.status).toBe('REGISTERED');
      expect(res.body.data.blockchainStatus).toBe('LOCAL_ONLY'); // Mock mode labels LOCAL_ONLY per Block A

      successfulPledgeId = res.body.data.id;

      // Invoice status transitioned to PLEDGED
      const invRes = await request(app).get(`/api/v1/invoices/${invoiceId}`).set('Cookie', financier1Cookie);
      expect(invRes.body.data.status).toBe('PLEDGED');
    });

    it('Financier 2 attempts duplicate pledge on same invoice: strictly rejected with 409 DUPLICATE_PLEDGE', async () => {
      const res = await request(app)
        .post(`/api/v1/invoices/${invoiceId}/pledges`)
        .set('Cookie', financier2Cookie)
        .set('X-SF-CSRF', '1')
        .send({
          advanceMinorUnits: '700000',
          note: 'Attempting to finance an already pledged invoice.',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_PLEDGE');

      // Check audit event was recorded
      const auditRes = await query(
        `SELECT action FROM audit_events WHERE invoice_id = $1 ORDER BY id DESC`,
        [invoiceId]
      );
      expect(auditRes.rows.some((r) => r.action === 'PLEDGE_REGISTERED')).toBe(true);
    });

    it('GET /pledge-markers/:marker shows used: true and status: REGISTERED', async () => {
      const res = await request(app)
        .get(`/api/v1/pledge-markers/${expectedMarker}`)
        .set('Cookie', financier2Cookie);

      expect(res.status).toBe(200);
      expect(res.body.data.used).toBe(true);
      expect(res.body.data.status).toBe('REGISTERED');
    });

    it('Financier 2 sees invoice status as PLEDGED with obscure pledgeSummary (hides who pledged)', async () => {
      const res = await request(app).get(`/api/v1/invoices/${invoiceId}`).set('Cookie', financier2Cookie);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PLEDGED');
      expect(res.body.data.pledgeSummary).toEqual({ pledged: true });
    });

    it('Pledging Financier can settle the invoice: transitions PLEDGED -> SETTLED', async () => {
      const res = await request(app)
        .post(`/api/v1/invoices/${invoiceId}/settle`)
        .set('Cookie', financier1Cookie)
        .set('X-SF-CSRF', '1')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('SETTLED');
    });
  });

  describe('Concurrent Pledge Attack Simulation (N simultaneous requests)', () => {
    it('fires 5 concurrent pledge requests on an AVAILABLE invoice: EXACTLY ONE succeeds', async () => {
      // Create a fresh AVAILABLE invoice for the race condition test
      const createRes = await request(app)
        .post('/api/v1/invoices')
        .set('Cookie', supplierCookie)
        .set('X-SF-CSRF', '1')
        .send({
          invoiceNumber: 'INV-RACE-001',
          buyerId,
          amountMinorUnits: '2000000',
          currency: 'INR',
          issueDate: '2026-03-01',
          dueDate: '2026-04-01',
        });
      const raceInvoiceId = createRes.body.data.id;

      await request(app)
        .post(`/api/v1/invoices/${raceInvoiceId}/commit`)
        .set('Cookie', supplierCookie)
        .set('X-SF-CSRF', '1')
        .send({});

      await request(app)
        .post(`/api/v1/invoices/${raceInvoiceId}/acknowledgement`)
        .set('Cookie', buyerCookie)
        .set('X-SF-CSRF', '1')
        .send({ decision: 'ACKNOWLEDGE' });

      await request(app)
        .post(`/api/v1/invoices/${raceInvoiceId}/release`)
        .set('Cookie', supplierCookie)
        .set('X-SF-CSRF', '1')
        .send({});

      // Fire 5 simultaneous pledge requests concurrently
      const N = 5;
      const promises = Array.from({ length: N }).map((_, i) =>
        request(app)
          .post(`/api/v1/invoices/${raceInvoiceId}/pledges`)
          .set('Cookie', i % 2 === 0 ? financier1Cookie : financier2Cookie)
          .set('X-SF-CSRF', '1')
          .send({
            advanceMinorUnits: '1000000',
            note: `Concurrent attempt #${i + 1}`,
          })
      );

      const results = await Promise.all(promises);

      const successCount = results.filter((r) => r.status === 201).length;
      const conflictCount = results.filter((r) => r.status === 409).length;

      expect(successCount).toBe(1);
      expect(conflictCount).toBe(N - 1);
    });
  });
});
