import { query, transaction } from '../db/index.js';
import { AuthUser } from '../domain/permissions.js';
import { assertTransition } from '../domain/invoiceStateMachine.js';
import { validateMinorUnits } from '../domain/money.js';
import { computePledgeMarker } from '../crypto/marker.js';
import { computeUserRef } from '../crypto/refs.js';
import { AppError } from '../middleware/errorHandler.js';
import { recordAuditEvent } from './audit.js';
import { getChainAdapter, Hex } from './chainWorker.js';

export interface CreatePledgeParams {
  advanceMinorUnits: string;
  note?: string;
}

export interface PledgeResponse {
  id: string;
  invoiceId: string;
  commitment: string;
  pledgeMarker: string;
  financierId: string;
  advanceMinorUnits: string;
  note: string | null;
  status: string;
  createdAt: string;
  blockchainTxHash: string | null;
  blockchainStatus: string;
  chainMode: string;
}

function formatPledgeRow(row: any): PledgeResponse {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    commitment: row.commitment,
    pledgeMarker: row.pledge_marker,
    financierId: row.financier_id,
    advanceMinorUnits: row.advance_minor_units.toString(),
    note: row.note || null,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    blockchainTxHash: row.blockchain_tx_hash || null,
    blockchainStatus: row.blockchain_status,
    chainMode: row.chain_mode,
  };
}

export async function requestPledge(
  invoiceId: string,
  params: CreatePledgeParams,
  user: AuthUser
): Promise<PledgeResponse> {
  if (user.role !== 'FINANCIER') {
    throw new AppError('FORBIDDEN', 'Only financiers can record financing pledges.', 403);
  }

  const advanceMinorUnits = validateMinorUnits(params.advanceMinorUnits);
  const cleanNote = params.note ? params.note.trim() : null;

  let pledgeId: string;
  let commitment: string;
  let pledgeMarker: string;
  let chainTxId: string;

  try {
    // 1. ATOMIC DATABASE TRANSACTION
    const txResult = await transaction(async (client) => {
      // Lock invoice row with SELECT ... FOR UPDATE
      const invRes = await client.query(
        'SELECT id, status, commitment, amount_minor_units FROM invoices WHERE id = $1 FOR UPDATE',
        [invoiceId]
      );

      if (invRes.rows.length === 0) {
        throw new AppError('NOT_FOUND', `Invoice with id '${invoiceId}' not found.`, 404);
      }
      const invoice = invRes.rows[0];

      if (invoice.status === 'PLEDGED' || invoice.status === 'SETTLED') {
        const marker = invoice.commitment ? computePledgeMarker(invoice.commitment) : 'unknown';
        throw new AppError(
          'DUPLICATE_PLEDGE',
          'This invoice commitment has already received a financing pledge.',
          409,
          { pledgeMarker: marker }
        );
      }

      if (invoice.status !== 'AVAILABLE') {
        throw new AppError(
          'INVALID_TRANSITION',
          `Cannot pledge invoice with status '${invoice.status}'. Invoices must be in AVAILABLE status to receive a pledge.`,
          409
        );
      }

      if (!invoice.commitment) {
        throw new AppError('VALIDATION_ERROR', 'Invoice does not have a registered commitment.', 400);
      }

      if (BigInt(advanceMinorUnits) > BigInt(invoice.amount_minor_units)) {
        throw new AppError(
          'VALIDATION_ERROR',
          `Advance amount (${advanceMinorUnits}) cannot exceed total invoice face value (${invoice.amount_minor_units}).`,
          400
        );
      }

      commitment = invoice.commitment;
      pledgeMarker = computePledgeMarker(commitment);

      // Insert into pledges table
      // The partial unique index on pledge_marker strictly prevents concurrent duplicates!
      const plRes = await client.query(
        `INSERT INTO pledges 
           (invoice_id, commitment, pledge_marker, financier_id, advance_minor_units, note, status, blockchain_status, chain_mode)
         VALUES ($1, $2, $3, $4, $5, $6, 'REQUESTED', 'LOCAL_ONLY', 'MOCK')
         RETURNING id, created_at`,
        [invoiceId, commitment, pledgeMarker, user.id, advanceMinorUnits, cleanNote]
      );
      const newPledgeId = plRes.rows[0].id;

      // Insert into chain_txs pending record
      const ctxRes = await client.query(
        `INSERT INTO chain_txs (kind, invoice_id, idempotency_key, status)
         VALUES ('REGISTER_PLEDGE', $1, $2, 'PENDING')
         RETURNING id`,
        [invoiceId, `pledge:${newPledgeId}`]
      );
      const newChainTxId = ctxRes.rows[0].id;

      // Write audit event
      await recordAuditEvent(
        {
          actorUserId: user.id,
          action: 'PLEDGE_REQUESTED',
          invoiceId,
          pledgeId: newPledgeId,
          source: 'LOCAL',
          details: { advanceMinorUnits, pledgeMarker },
        },
        client
      );

      return { newPledgeId, newChainTxId, commitment, pledgeMarker };
    });

    pledgeId = txResult.newPledgeId;
    commitment = txResult.commitment;
    pledgeMarker = txResult.pledgeMarker;
    chainTxId = txResult.newChainTxId;
  } catch (err: any) {
    // If unique violation caught on pledge_marker
    if (err?.code === '23505' || err?.message?.includes('idx_pledges_pledge_marker')) {
      const computedMarker = commitment! ? computePledgeMarker(commitment!) : 'unknown';
      await recordAuditEvent({
        actorUserId: user.id,
        action: 'PLEDGE_DUPLICATE_REJECTED',
        invoiceId,
        source: 'LOCAL',
        details: { pledgeMarker: computedMarker },
      }).catch(() => {});

      throw new AppError(
        'DUPLICATE_PLEDGE',
        'Duplicate pledge rejected: this invoice commitment has already received a financing pledge.',
        409,
        { pledgeMarker: computedMarker }
      );
    }
    throw err;
  }

  // 2. CHAIN WORKFLOW EXECUTION
  const adapter = getChainAdapter();
  const financierRef = computeUserRef(user.id);

  try {
    const chainResult = await adapter.registerPledge({
      commitment: commitment as Hex,
      pledgeMarker: pledgeMarker as Hex,
      financierRef: financierRef as Hex,
    });

    if (chainResult.status === 'CONFIRMED') {
      const isMock = adapter.mode() === 'MOCK';
      const finalBlockchainStatus = isMock ? 'LOCAL_ONLY' : 'CONFIRMED';

      await transaction(async (client) => {
        await client.query(
          `UPDATE pledges 
           SET status = 'REGISTERED', blockchain_status = $1, blockchain_tx_hash = $2, updated_at = NOW() 
           WHERE id = $3`,
          [finalBlockchainStatus, chainResult.txHash || null, pledgeId]
        );

        await client.query(
          `UPDATE invoices SET status = 'PLEDGED', updated_at = NOW() WHERE id = $1`,
          [invoiceId]
        );

        await client.query(
          `UPDATE chain_txs 
           SET status = 'CONFIRMED', tx_hash = $1, block_number = $2, updated_at = NOW() 
           WHERE id = $3`,
          [chainResult.txHash || null, chainResult.blockNumber || null, chainTxId]
        );

        await recordAuditEvent(
          {
            actorUserId: user.id,
            action: 'PLEDGE_REGISTERED',
            invoiceId,
            pledgeId,
            source: isMock ? 'LOCAL' : 'CHAIN',
            details: { pledgeMarker, txHash: chainResult.txHash },
          },
          client
        );
      });
    } else if (chainResult.errorCode === 'PLEDGE_MARKER_USED') {
      await transaction(async (client) => {
        await client.query(
          `UPDATE pledges SET status = 'REJECTED_DUPLICATE', blockchain_status = 'FAILED', updated_at = NOW() WHERE id = $1`,
          [pledgeId]
        );
        await client.query(
          `UPDATE chain_txs SET status = 'FAILED', error_code = 'PLEDGE_MARKER_USED', updated_at = NOW() WHERE id = $1`,
          [chainTxId]
        );
        await recordAuditEvent(
          {
            actorUserId: user.id,
            action: 'PLEDGE_DUPLICATE_REJECTED',
            invoiceId,
            pledgeId,
            source: 'CHAIN',
            details: { pledgeMarker },
          },
          client
        );
      });

      throw new AppError(
        'DUPLICATE_PLEDGE',
        'Duplicate pledge rejected by chain: pledge marker is already used.',
        409,
        { pledgeMarker }
      );
    } else {
      // Other chain failure
      await transaction(async (client) => {
        await client.query(
          `UPDATE pledges SET status = 'FAILED', blockchain_status = 'FAILED', updated_at = NOW() WHERE id = $1`,
          [pledgeId]
        );
        await client.query(
          `UPDATE chain_txs SET status = 'FAILED', error_code = $1, updated_at = NOW() WHERE id = $2`,
          [chainResult.errorCode || 'UNKNOWN', chainTxId]
        );
        await recordAuditEvent(
          {
            actorUserId: user.id,
            action: 'PLEDGE_FAILED',
            invoiceId,
            pledgeId,
            source: 'CHAIN',
            details: { errorCode: chainResult.errorCode },
          },
          client
        );
      });

      throw new AppError(
        'CHAIN_UNAVAILABLE',
        `Chain registration failed with code: ${chainResult.errorCode || 'UNKNOWN'}.`,
        503
      );
    }
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    console.error(`Pledge chain worker exception for pledge ${pledgeId}:`, err);
  }

  return getPledgeById(pledgeId, user);
}

export async function getPledgeById(id: string, user: AuthUser): Promise<PledgeResponse> {
  const { rows } = await query(
    `SELECT p.*, i.supplier_id 
     FROM pledges p 
     JOIN invoices i ON i.id = p.invoice_id 
     WHERE p.id = $1`,
    [id]
  );

  if (rows.length === 0) {
    throw new AppError('NOT_FOUND', `Pledge with id '${id}' not found.`, 404);
  }

  const row = rows[0];
  const isPledgingFinancier = user.role === 'FINANCIER' && row.financier_id === user.id;
  const isInvoiceSupplier = user.role === 'SUPPLIER' && row.supplier_id === user.id;

  if (!isPledgingFinancier && !isInvoiceSupplier) {
    throw new AppError('FORBIDDEN', 'You are not authorized to view this pledge.', 403);
  }

  return formatPledgeRow(row);
}

export async function getPledgesForInvoice(invoiceId: string, user: AuthUser): Promise<PledgeResponse[]> {
  const invRes = await query('SELECT supplier_id FROM invoices WHERE id = $1', [invoiceId]);
  if (invRes.rows.length === 0) {
    throw new AppError('NOT_FOUND', `Invoice with id '${invoiceId}' not found.`, 404);
  }

  const invoice = invRes.rows[0];
  const isSupplier = user.role === 'SUPPLIER' && invoice.supplier_id === user.id;

  let sql = 'SELECT * FROM pledges WHERE invoice_id = $1';
  const params: any[] = [invoiceId];

  if (!isSupplier) {
    if (user.role === 'FINANCIER') {
      sql += ' AND financier_id = $2';
      params.push(user.id);
    } else {
      throw new AppError('FORBIDDEN', 'You are not authorized to view pledges for this invoice.', 403);
    }
  }

  sql += ' ORDER BY created_at DESC';
  const { rows } = await query(sql, params);
  return rows.map(formatPledgeRow);
}

export async function getMyPledges(user: AuthUser): Promise<{ items: PledgeResponse[] }> {
  if (user.role !== 'FINANCIER') {
    throw new AppError('FORBIDDEN', 'Only financiers have pledges.', 403);
  }

  const { rows } = await query(
    'SELECT * FROM pledges WHERE financier_id = $1 ORDER BY created_at DESC',
    [user.id]
  );

  return { items: rows.map(formatPledgeRow) };
}

export async function getPledgeMarkerStatus(marker: string, _user: AuthUser) {
  const cleanMarker = marker.trim().toLowerCase();
  const { rows } = await query(
    `SELECT pledge_marker, status 
     FROM pledges 
     WHERE LOWER(pledge_marker) = $1 AND status IN ('REQUESTED', 'REGISTERED', 'SETTLED') 
     LIMIT 1`,
    [cleanMarker]
  );

  if (rows.length > 0) {
    return {
      marker: cleanMarker,
      used: true,
      status: rows[0].status,
    };
  }

  return {
    marker: cleanMarker,
    used: false,
    status: null,
  };
}
