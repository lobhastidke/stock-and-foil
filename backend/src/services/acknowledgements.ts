import { query, transaction } from '../db/index.js';
import { AuthUser, canAcknowledge } from '../domain/permissions.js';
import { assertTransition, AckDecision } from '../domain/invoiceStateMachine.js';
import { AppError } from '../middleware/errorHandler.js';
import { computeUserRef } from '../crypto/refs.js';
import { recordAuditEvent } from './audit.js';
import { getChainAdapter, Hex } from './chainWorker.js';
import { getInvoiceById } from './invoices.js';

export interface SubmitAcknowledgementParams {
  decision: AckDecision;
  reason?: string;
}

export async function submitAcknowledgement(
  invoiceId: string,
  params: SubmitAcknowledgementParams,
  user: AuthUser
) {
  if (user.role !== 'BUYER') {
    throw new AppError('FORBIDDEN', 'Only buyers can submit acknowledgements.', 403);
  }

  const { rows } = await query('SELECT * FROM invoices WHERE id = $1', [invoiceId]);
  if (rows.length === 0) {
    throw new AppError('NOT_FOUND', `Invoice with id '${invoiceId}' not found.`, 404);
  }
  const current = rows[0];

  if (current.buyer_id !== user.id) {
    throw new AppError('FORBIDDEN', 'Only the assigned buyer can acknowledge or reject this invoice.', 403);
  }

  if (current.status !== 'PENDING_ACK') {
    throw new AppError('INVALID_TRANSITION', `Invoice must be in PENDING_ACK status (current: ${current.status}).`, 409);
  }

  if (params.decision === 'REJECT' && (!params.reason || params.reason.trim().length === 0)) {
    throw new AppError('VALIDATION_ERROR', 'A reason is strictly required when rejecting an invoice.', 400);
  }

  const nextStatus = params.decision === 'ACKNOWLEDGE' ? 'ACKNOWLEDGED' : 'REJECTED';
  assertTransition(current.status, nextStatus);

  const cleanReason = params.reason ? params.reason.trim() : null;
  const buyerRef = computeUserRef(user.id);

  const { ackId, chainTxId } = await transaction(async (client) => {
    // Insert into chain_txs first
    const txRes = await client.query(
      `INSERT INTO chain_txs (kind, invoice_id, idempotency_key, status)
       VALUES ('RECORD_ACKNOWLEDGEMENT', $1, $2, 'PENDING')
       RETURNING id`,
      [invoiceId, `ack:${invoiceId}`]
    );
    const txId = txRes.rows[0].id;

    // Insert acknowledgement
    const ackRes = await client.query(
      `INSERT INTO acknowledgements 
         (invoice_id, invoice_commitment, buyer_id, decision, reason, chain_tx_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [invoiceId, current.commitment, user.id, params.decision, cleanReason, txId]
    );
    const ackRow = ackRes.rows[0];

    // Update invoice status
    await client.query(
      `UPDATE invoices SET status = $1, updated_at = NOW() WHERE id = $2`,
      [nextStatus, invoiceId]
    );

    // Write audit event
    const auditAction = params.decision === 'ACKNOWLEDGE' ? 'ACK_SUBMITTED' : 'INVOICE_REJECTED';
    await recordAuditEvent(
      {
        actorUserId: user.id,
        action: auditAction,
        invoiceId,
        source: 'LOCAL',
        details: { decision: params.decision, reason: cleanReason },
      },
      client
    );

    return { ackId: ackRow.id, chainTxId: txId };
  });

  // Call chain adapter asynchronously
  if (current.commitment) {
    const adapter = getChainAdapter();
    adapter
      .recordAcknowledgement({
        commitment: current.commitment as Hex,
        buyerRef: buyerRef as Hex,
        accepted: params.decision === 'ACKNOWLEDGE',
      })
      .then(async (txResult) => {
        await query(
          `UPDATE chain_txs 
           SET status = $1, tx_hash = $2, block_number = $3, updated_at = NOW() 
           WHERE id = $4`,
          [txResult.status, txResult.txHash || null, txResult.blockNumber || null, chainTxId]
        );
      })
      .catch((err) => {
        console.error(`Async recordAcknowledgement error for invoice ${invoiceId}:`, err);
      });
  }

  const updatedInvoice = await getInvoiceById(invoiceId, user);
  return {
    acknowledgement: {
      id: ackId,
      invoiceId,
      decision: params.decision,
      reason: cleanReason,
    },
    invoice: updatedInvoice,
  };
}
