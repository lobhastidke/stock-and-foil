import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { initDb, closeDb, query } from '../db/index.js';

describe('Invoices Lifecycle & Authorisation Matrix API (/api/v1/invoices)', () => {
  const app = createApp();

  let supplierCookie: string;
  let buyerCookie: string;
  let financierCookie: string;
  let otherSupplierCookie: string;

  let supplierId: string;
  let buyerId: string;
  let financierId: string;
  let otherSupplierId: string;

  let invoiceId: string;

  beforeAll(async () => {
    await initDb();

    // Helper to register and extract cookie + id
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
      const cookie = res.headers['set-cookie'][0];
      return { id: res.body.data.id, cookie };
    }

    const s = await setupUser('supplier.inv@test.com', 'SUPPLIER', 'Supplier One');
    supplierId = s.id;
    supplierCookie = s.cookie;

    const b = await setupUser('buyer.inv@test.com', 'BUYER', 'Buyer One');
    buyerId = b.id;
    buyerCookie = b.cookie;

    const f = await setupUser('financier.inv@test.com', 'FINANCIER', 'Financier One');
    financierId = f.id;
    financierCookie = f.cookie;

    const s2 = await setupUser('supplier2.inv@test.com', 'SUPPLIER', 'Supplier Two');
    otherSupplierId = s2.id;
    otherSupplierCookie = s2.cookie;
  });

  afterAll(async () => {
    await closeDb();
  });

  describe('Creation & Authorisation Matrix on DRAFT Invoices', () => {
    it('allows SUPPLIER to create invoice in DRAFT status', async () => {
      const res = await request(app)
        .post('/api/v1/invoices')
        .set('Cookie', supplierCookie)
        .set('X-SF-CSRF', '1')
        .send({
          invoiceNumber: 'INV-TEST-001',
          buyerId,
          amountMinorUnits: '500000',
          currency: 'INR',
          issueDate: '2026-03-01',
          dueDate: '2026-04-01',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.invoiceNumber).toBe('INV-TEST-001');
      invoiceId = res.body.data.id;
    });

    it('rejects BUYER or FINANCIER attempting to create an invoice (403 FORBIDDEN)', async () => {
      const buyerRes = await request(app)
        .post('/api/v1/invoices')
        .set('Cookie', buyerCookie)
        .set('X-SF-CSRF', '1')
        .send({
          invoiceNumber: 'INV-FAKE-001',
          buyerId,
          amountMinorUnits: '1000',
          currency: 'INR',
          issueDate: '2026-01-01',
          dueDate: '2026-02-01',
        });
      expect(buyerRes.status).toBe(403);

      const finRes = await request(app)
        .post('/api/v1/invoices')
        .set('Cookie', financierCookie)
        .set('X-SF-CSRF', '1')
        .send({
          invoiceNumber: 'INV-FAKE-002',
          buyerId,
          amountMinorUnits: '1000',
          currency: 'INR',
          issueDate: '2026-01-01',
          dueDate: '2026-02-01',
        });
      expect(finRes.status).toBe(403);
    });

    it('assigned BUYER NEVER sees DRAFT invoices in their dashboard or by ID', async () => {
      // By list
      const listRes = await request(app).get('/api/v1/invoices').set('Cookie', buyerCookie);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.items.find((i: any) => i.id === invoiceId)).toBeUndefined();

      // By ID directly
      const idRes = await request(app).get(`/api/v1/invoices/${invoiceId}`).set('Cookie', buyerCookie);
      expect(idRes.status).toBe(403);
    });

    it('FINANCIER cannot see DRAFT invoices (403 FORBIDDEN)', async () => {
      const idRes = await request(app).get(`/api/v1/invoices/${invoiceId}`).set('Cookie', financierCookie);
      expect(idRes.status).toBe(403);
    });

    it('OTHER SUPPLIER cannot see or modify this invoice (403 FORBIDDEN)', async () => {
      const getRes = await request(app).get(`/api/v1/invoices/${invoiceId}`).set('Cookie', otherSupplierCookie);
      expect(getRes.status).toBe(403);

      const patchRes = await request(app)
        .patch(`/api/v1/invoices/${invoiceId}`)
        .set('Cookie', otherSupplierCookie)
        .set('X-SF-CSRF', '1')
        .send({ amountMinorUnits: '600000' });
      expect(patchRes.status).toBe(403);
    });

    it('SUPPLIER can modify invoice while in DRAFT status', async () => {
      const patchRes = await request(app)
        .patch(`/api/v1/invoices/${invoiceId}`)
        .set('Cookie', supplierCookie)
        .set('X-SF-CSRF', '1')
        .send({ amountMinorUnits: '550000' });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.amountMinorUnits).toBe('550000');
    });
  });

  describe('Document Upload, Sniffing & Access Control', () => {
    it('accepts valid PDF upload with correct magic bytes (%PDF)', async () => {
      // Minimal valid PDF binary: "%PDF-1.4 ... %%EOF"
      const pdfBase64 = Buffer.from('%PDF-1.4 test document content %%EOF').toString('base64');
      const res = await request(app)
        .post(`/api/v1/invoices/${invoiceId}/document`)
        .set('Cookie', supplierCookie)
        .set('X-SF-CSRF', '1')
        .send({
          filename: 'invoice-spec.pdf',
          mimeType: 'application/pdf',
          contentBase64: pdfBase64,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.document.filename).toBe('invoice-spec.pdf');
      expect(res.body.data.document.mimeType).toBe('application/pdf');
      expect(res.body.data.document.sha256).toBeDefined();
    });

    it('rejects document upload with fraudulent magic bytes (e.g. text pretending to be PDF)', async () => {
      const fakePdf = Buffer.from('Plain text claiming to be a PDF').toString('base64');
      const res = await request(app)
        .post(`/api/v1/invoices/${invoiceId}/document`)
        .set('Cookie', supplierCookie)
        .set('X-SF-CSRF', '1')
        .send({
          filename: 'malicious.pdf',
          mimeType: 'application/pdf',
          contentBase64: fakePdf,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('allows SUPPLIER to download decrypted document bytes', async () => {
      const res = await request(app)
        .get(`/api/v1/invoices/${invoiceId}/document`)
        .set('Cookie', supplierCookie);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.body.toString('utf8')).toContain('%PDF-1.4');
    });

    it('FINANCIER is strictly forbidden from downloading documents (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .get(`/api/v1/invoices/${invoiceId}/document`)
        .set('Cookie', financierCookie);

      expect(res.status).toBe(403);
    });
  });

  describe('Commitment Generation & Verification', () => {
    it('POST /invoices/:id/commit transitions DRAFT -> PENDING_ACK and generates commitment', async () => {
      const res = await request(app)
        .post(`/api/v1/invoices/${invoiceId}/commit`)
        .set('Cookie', supplierCookie)
        .set('X-SF-CSRF', '1')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PENDING_ACK');
      expect(res.body.data.commitment).toMatch(/^0x[0-9a-fA-F]{64}$/);

      // Verify salt_enc exists in DB but is NEVER returned in response
      expect(res.body.data.salt).toBeUndefined();
      expect(res.body.data.saltEnc).toBeUndefined();
    });

    it('forbids further modifications after commit (409 INVALID_TRANSITION)', async () => {
      const res = await request(app)
        .patch(`/api/v1/invoices/${invoiceId}`)
        .set('Cookie', supplierCookie)
        .set('X-SF-CSRF', '1')
        .send({ amountMinorUnits: '999999' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_TRANSITION');
    });

    it('POST /invoices/:id/verify-commitment confirms stored fields match commitment', async () => {
      const res = await request(app)
        .post(`/api/v1/invoices/${invoiceId}/verify-commitment`)
        .set('Cookie', supplierCookie)
        .set('X-SF-CSRF', '1')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(true);
      expect(res.body.data.commitment).toMatch(/^0x/);
    });

    it('tampering with any committed DB field causes verify-commitment to return valid: false', async () => {
      // Direct SQL tampering simulation
      await query('UPDATE invoices SET amount_minor_units = 999999 WHERE id = $1', [invoiceId]);

      const res = await request(app)
        .post(`/api/v1/invoices/${invoiceId}/verify-commitment`)
        .set('Cookie', supplierCookie)
        .set('X-SF-CSRF', '1')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(false);

      // Restore original amount
      await query('UPDATE invoices SET amount_minor_units = 550000 WHERE id = $1', [invoiceId]);
    });
  });

  describe('Buyer Acknowledgement Flow', () => {
    it('assigned BUYER can now see the invoice in PENDING_ACK', async () => {
      const res = await request(app).get(`/api/v1/invoices/${invoiceId}`).set('Cookie', buyerCookie);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('PENDING_ACK');
    });

    it('assigned BUYER can download document for review', async () => {
      const res = await request(app).get(`/api/v1/invoices/${invoiceId}/document`).set('Cookie', buyerCookie);
      expect(res.status).toBe(200);
    });

    it('unauthorized user cannot acknowledge invoice (403 FORBIDDEN)', async () => {
      const res = await request(app)
        .post(`/api/v1/invoices/${invoiceId}/acknowledgement`)
        .set('Cookie', supplierCookie)
        .set('X-SF-CSRF', '1')
        .send({ decision: 'ACKNOWLEDGE' });

      expect(res.status).toBe(403);
    });

    it('assigned BUYER acknowledges invoice transitioning PENDING_ACK -> ACKNOWLEDGED', async () => {
      const res = await request(app)
        .post(`/api/v1/invoices/${invoiceId}/acknowledgement`)
        .set('Cookie', buyerCookie)
        .set('X-SF-CSRF', '1')
        .send({ decision: 'ACKNOWLEDGE' });

      expect(res.status).toBe(200);
      expect(res.body.data.acknowledgement.decision).toBe('ACKNOWLEDGE');
      expect(res.body.data.invoice.status).toBe('ACKNOWLEDGED');
    });

    it('forbids second acknowledgement on same invoice (409 INVALID_TRANSITION)', async () => {
      const res = await request(app)
        .post(`/api/v1/invoices/${invoiceId}/acknowledgement`)
        .set('Cookie', buyerCookie)
        .set('X-SF-CSRF', '1')
        .send({ decision: 'ACKNOWLEDGE' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_TRANSITION');
    });
  });

  describe('Release to Financing Flow', () => {
    it('SUPPLIER releases invoice transitioning ACKNOWLEDGED -> AVAILABLE', async () => {
      const res = await request(app)
        .post(`/api/v1/invoices/${invoiceId}/release`)
        .set('Cookie', supplierCookie)
        .set('X-SF-CSRF', '1')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('AVAILABLE');
    });

    it('FINANCIER can now see invoice once it reaches AVAILABLE status', async () => {
      const res = await request(app).get(`/api/v1/invoices/${invoiceId}`).set('Cookie', financierCookie);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('AVAILABLE');
      // Document is still hidden
      expect(res.body.data.hasDocument).toBe(false);
    });
  });
});
