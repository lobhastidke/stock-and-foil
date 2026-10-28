import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDb, closeDb, query } from '../db/index.js';
import { recordAuditEvent, verifyAuditChain } from '../services/audit.js';

describe('Audit Events & Tamper-Evident Hash Chain', () => {
  beforeAll(async () => {
    await initDb();
  });

  afterAll(async () => {
    await closeDb();
  });

  it('append-only DB triggers strictly forbid UPDATE and DELETE operations', async () => {
    const event = await recordAuditEvent({
      action: 'TRIGGER_IMMUTABILITY_TEST',
      source: 'LOCAL',
      details: { test: true },
    });

    // Attempt UPDATE: must be rejected by Postgres append-only trigger
    await expect(
      query(`UPDATE audit_events SET action = 'ALTERED' WHERE id = $1`, [event.id])
    ).rejects.toThrow();

    // Attempt DELETE: must be rejected by Postgres append-only trigger
    await expect(
      query(`DELETE FROM audit_events WHERE id = $1`, [event.id])
    ).rejects.toThrow();
  });

  it('records consecutive audit events with a valid keccak256 hash chain', async () => {
    await recordAuditEvent({
      action: 'INVOICE_CREATED',
      source: 'LOCAL',
      details: { test: 'event 1' },
    });

    await recordAuditEvent({
      action: 'COMMITMENT_GENERATED',
      source: 'LOCAL',
      details: { test: 'event 2' },
    });

    const status = await verifyAuditChain();
    expect(status.valid).toBe(true);
  });

  it('strictly prohibits storing passwords, salts, or document bytes in audit details', async () => {
    const recorded = await recordAuditEvent({
      action: 'TEST_SECRET_STRIPPING',
      source: 'LOCAL',
      details: {
        safeField: 'ok',
        password: 'mySecretPassword',
        salt: '0x1234567890abcdef',
        saltEnc: Buffer.from('encryptedSalt'),
        contentBase64: 'rawDocBytes',
      },
    });

    expect(recorded.details.safeField).toBe('ok');
    expect((recorded.details as any).password).toBeUndefined();
    expect((recorded.details as any).salt).toBeUndefined();
    expect((recorded.details as any).saltEnc).toBeUndefined();
    expect((recorded.details as any).contentBase64).toBeUndefined();
  });

  it('detects tampering if a forged or corrupted event is inserted into the chain', async () => {
    // 1. Verify chain is valid initially
    const initialStatus = await verifyAuditChain();
    expect(initialStatus.valid).toBe(true);

    // 2. Fetch latest event hash
    const latestRes = await query('SELECT event_hash FROM audit_events ORDER BY id DESC LIMIT 1');
    const latestHash = latestRes.rows[0].event_hash;

    // 3. Insert a forged event with an invalid/mismatched event_hash
    const fakeHash = '0xbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbad0';
    const forgedInsert = await query(
      `INSERT INTO audit_events 
         (actor_user_id, action, source, details, prev_hash, event_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [null, 'FORGED_ATTACK_EVENT', 'LOCAL', JSON.stringify({ forged: true }), latestHash, fakeHash]
    );
    const forgedId = forgedInsert.rows[0].id;

    // 4. verifyAuditChain MUST catch the cryptographic tampering!
    const tamperedStatus = await verifyAuditChain();
    expect(tamperedStatus.valid).toBe(false);
    expect(tamperedStatus.brokenAtId).toBe(forgedId);
    expect(tamperedStatus.reason).toContain('event_hash tampering detected');
  });
});
