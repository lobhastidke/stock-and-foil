import { toUtf8Bytes, concat, keccak256 } from 'ethers';
import { query, DbClient } from '../db/index.js';

export interface AuditEventRecord {
  id: string;
  at: string;
  actorUserId?: string | null;
  action: string;
  invoiceId?: string | null;
  pledgeId?: string | null;
  source: 'LOCAL' | 'CHAIN';
  details: Record<string, any>;
  prevHash: string;
  eventHash: string;
}

const GENESIS_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Recursively serializes objects with alphabetically sorted keys and no whitespace.
 */
export function canonicalJsonStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJsonStringify).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((k) => `${JSON.stringify(k)}:${canonicalJsonStringify(obj[k])}`);
  return '{' + pairs.join(',') + '}';
}

/**
 * Deterministically computes the event hash in the append-only audit chain:
 * event_hash = keccak256( prev_hash_bytes32 || utf8(canonicalEventPayload) )
 */
export function computeEventHash(prevHash: string, eventPayload: Record<string, any>): string {
  const canonicalPayload = canonicalJsonStringify(eventPayload);
  const prevBytes = Buffer.from(prevHash.replace(/^0x/, ''), 'hex');
  const payloadBytes = toUtf8Bytes(canonicalPayload);
  return keccak256(concat([prevBytes, payloadBytes]));
}

/**
 * Appends a new tamper-evident event to the audit_events table.
 * Strictly guarantees that passwords, salts, and document bytes are NEVER included.
 */
export async function recordAuditEvent(
  event: {
    actorUserId?: string | null;
    action: string;
    invoiceId?: string | null;
    pledgeId?: string | null;
    source: 'LOCAL' | 'CHAIN';
    details?: Record<string, any>;
  },
  client?: DbClient
): Promise<AuditEventRecord> {
  const db = client || { query };

  // Fetch previous event's hash (or GENESIS_HASH if first event)
  const lastRowRes = await db.query(
    'SELECT event_hash FROM audit_events ORDER BY id DESC LIMIT 1'
  );
  const prevHash = lastRowRes.rows[0]?.event_hash || GENESIS_HASH;

  // Sanitize details: strip any accidental secrets
  const sanitizedDetails = { ...(event.details || {}) };
  delete (sanitizedDetails as any).password;
  delete (sanitizedDetails as any).passwordHash;
  delete (sanitizedDetails as any).salt;
  delete (sanitizedDetails as any).saltEnc;
  delete (sanitizedDetails as any).contentEnc;
  delete (sanitizedDetails as any).contentBase64;

  const payloadForHash = {
    action: event.action,
    actorUserId: event.actorUserId || null,
    details: sanitizedDetails,
    invoiceId: event.invoiceId || null,
    pledgeId: event.pledgeId || null,
    source: event.source,
  };

  const eventHash = computeEventHash(prevHash, payloadForHash);

  const insertRes = await db.query(
    `INSERT INTO audit_events 
       (actor_user_id, action, invoice_id, pledge_id, source, details, prev_hash, event_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, at, actor_user_id, action, invoice_id, pledge_id, source, details, prev_hash, event_hash`,
    [
      event.actorUserId || null,
      event.action,
      event.invoiceId || null,
      event.pledgeId || null,
      event.source,
      JSON.stringify(sanitizedDetails),
      prevHash,
      eventHash,
    ]
  );

  const row = insertRes.rows[0];
  return {
    id: row.id,
    at: row.at,
    actorUserId: row.actor_user_id,
    action: row.action,
    invoiceId: row.invoice_id,
    pledgeId: row.pledge_id,
    source: row.source,
    details: row.details,
    prevHash: row.prev_hash,
    eventHash: row.event_hash,
  };
}

/**
 * Validates the cryptographic integrity of the entire audit hash chain.
 * Returns { valid: true } if chain is intact, or details about the corrupted entry.
 */
export async function verifyAuditChain(): Promise<{ valid: boolean; brokenAtId?: string; reason?: string }> {
  const { rows } = await query(
    'SELECT id, at, actor_user_id, action, invoice_id, pledge_id, source, details, prev_hash, event_hash FROM audit_events ORDER BY id ASC'
  );

  let expectedPrevHash = GENESIS_HASH;

  for (const row of rows) {
    if (row.prev_hash !== expectedPrevHash) {
      return {
        valid: false,
        brokenAtId: row.id,
        reason: `prev_hash mismatch: expected ${expectedPrevHash}, found ${row.prev_hash}`,
      };
    }

    const payloadForHash = {
      action: row.action,
      actorUserId: row.actor_user_id || null,
      details: row.details,
      invoiceId: row.invoice_id || null,
      pledgeId: row.pledge_id || null,
      source: row.source,
    };

    const recomputedHash = computeEventHash(row.prev_hash, payloadForHash);
    if (recomputedHash.toLowerCase() !== row.event_hash.toLowerCase()) {
      return {
        valid: false,
        brokenAtId: row.id,
        reason: `event_hash tampering detected at id ${row.id}: recomputed ${recomputedHash} != stored ${row.event_hash}`,
      };
    }

    expectedPrevHash = row.event_hash;
  }

  return { valid: true };
}
