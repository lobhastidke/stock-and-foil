import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { initDb, closeDb, query } from '../db/index.js';
import { getChainAdapter, MockChainAdapter, setChainAdapter } from '../services/chainWorker.js';

describe('Reconciliation & Internal Cron API (/api/v1/internal/reconcile)', () => {
  const app = createApp();
  let mockAdapter: MockChainAdapter;

  beforeAll(async () => {
    await initDb();
    mockAdapter = new MockChainAdapter();
    setChainAdapter(mockAdapter);
  });

  afterAll(async () => {
    await closeDb();
  });

  it('rejects reconcile request without Authorization header (401 UNAUTHENTICATED)', async () => {
    const res = await request(app)
      .post('/api/v1/internal/reconcile')
      .set('X-SF-CSRF', '1')
      .send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects reconcile request with invalid CRON_SECRET (401 UNAUTHENTICATED)', async () => {
    const res = await request(app)
      .post('/api/v1/internal/reconcile')
      .set('Authorization', 'Bearer invalid_secret_token')
      .set('X-SF-CSRF', '1')
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('successfully authenticates with valid Bearer CRON_SECRET and scans pending rows', async () => {
    const res = await request(app)
      .post('/api/v1/internal/reconcile')
      .set('Authorization', `Bearer ${config.CRON_SECRET}`)
      .set('X-SF-CSRF', '1')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.scanned).toBeGreaterThanOrEqual(0);
  });

  it('settles PENDING chain_txs when chain reports CONFIRMED status', async () => {
    // 1. Create a dummy user and invoice for this test
    const userRes = await query(
      `INSERT INTO users (email, password_hash, display_name, organisation, role)
       VALUES ('rec.user@test.com', 'hash', 'Rec User', 'Rec Org', 'SUPPLIER')
       RETURNING id`
    );
    const userId = userRes.rows[0].id;

    const invRes = await query(
      `INSERT INTO invoices (invoice_number, supplier_id, buyer_id, amount_minor_units, currency, issue_date, due_date, status)
       VALUES ('INV-REC-001', $1, $1, 1000, 'INR', '2026-01-01', '2026-02-01', 'AVAILABLE')
       RETURNING id`,
      [userId]
    );
    const invoiceId = invRes.rows[0].id;

    // 2. Insert a simulated pending chain_tx with known tx_hash in adapter
    const dummyTx = await mockAdapter.registerInvoice({
      commitment: '0x1111111111111111111111111111111111111111111111111111111111111111',
      supplierRef: '0x2222222222222222222222222222222222222222222222222222222222222222',
      buyerRef: '0x3333333333333333333333333333333333333333333333333333333333333333',
    });

    const txInsert = await query(
      `INSERT INTO chain_txs (kind, invoice_id, idempotency_key, status, tx_hash)
       VALUES ('REGISTER_INVOICE', $1, 'rec_test_key', 'PENDING', $2)
       RETURNING id`,
      [invoiceId, dummyTx.txHash]
    );
    const chainTxId = txInsert.rows[0].id;

    // 3. Trigger reconciliation
    const recRes = await request(app)
      .post('/api/v1/internal/reconcile')
      .set('Authorization', `Bearer ${config.CRON_SECRET}`)
      .set('X-SF-CSRF', '1')
      .send({});

    expect(recRes.status).toBe(200);
    expect(recRes.body.data.confirmed).toBeGreaterThanOrEqual(1);

    // Verify row in DB transitioned to CONFIRMED
    const updated = await query('SELECT status FROM chain_txs WHERE id = $1', [chainTxId]);
    expect(updated.rows[0].status).toBe('CONFIRMED');
  });
});
