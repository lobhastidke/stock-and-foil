import crypto from 'crypto';
import { config } from '../config.js';
import { query, transaction } from '../db/index.js';
import { getChainAdapter, Hex } from './chainWorker.js';
import { recordAuditEvent } from './audit.js';

/**
 * Constant-time comparison between client-provided token and CRON_SECRET.
 * Protects against timing side-channel attacks.
 */
export function verifyCronSecret(authHeader: string | undefined): boolean {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.slice(7).trim();
  const secretBuffer = Buffer.from(config.CRON_SECRET, 'utf8');
  const tokenBuffer = Buffer.from(token, 'utf8');

  if (secretBuffer.length !== tokenBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(secretBuffer, tokenBuffer);
}

export interface ReconcileResult {
  scanned: number;
  confirmed: number;
  failed: number;
  stillPending: number;
}

/**
 * Scans all chain_txs with status PENDING and reconciles them against the chain adapter.
 */
export async function reconcilePendingTransactions(): Promise<ReconcileResult> {
  const adapter = getChainAdapter();
  const { rows: pendingTxs } = await query(
    `SELECT id, kind, invoice_id, idempotency_key, status, tx_hash, attempts 
     FROM chain_txs 
     WHERE status = 'PENDING' 
     ORDER BY created_at ASC 
     LIMIT 50`
  );

  let confirmed = 0;
  let failed = 0;
  let stillPending = 0;

  for (const tx of pendingTxs) {
    try {
      if (tx.tx_hash) {
        const txStatus = await adapter.getTxStatus(tx.tx_hash as Hex);
        if (txStatus.status === 'CONFIRMED') {
          await transaction(async (client) => {
            await client.query(
              `UPDATE chain_txs 
               SET status = 'CONFIRMED', block_number = $1, updated_at = NOW() 
               WHERE id = $2`,
              [txStatus.blockNumber || null, tx.id]
            );

            // If it was a pledge tx, update pledge record
            if (tx.kind === 'REGISTER_PLEDGE') {
              await client.query(
                `UPDATE pledges 
                 SET blockchain_status = 'CONFIRMED', status = 'REGISTERED', updated_at = NOW() 
                 WHERE invoice_id = $1 AND blockchain_status = 'PENDING'`,
                [tx.invoice_id]
              );
              await client.query(
                `UPDATE invoices SET status = 'PLEDGED', updated_at = NOW() WHERE id = $1`,
                [tx.invoice_id]
              );
            }

            await recordAuditEvent(
              {
                action: 'CHAIN_TX_CONFIRMED',
                invoiceId: tx.invoice_id,
                source: 'CHAIN',
                details: { chainTxId: tx.id, kind: tx.kind, txHash: tx.tx_hash },
              },
              client
            );
          });
          confirmed++;
          continue;
        } else if (txStatus.status === 'FAILED') {
          await transaction(async (client) => {
            await client.query(
              `UPDATE chain_txs 
               SET status = 'FAILED', error_code = $1, updated_at = NOW() 
               WHERE id = $2`,
              [txStatus.errorCode || 'UNKNOWN', tx.id]
            );

            if (tx.kind === 'REGISTER_PLEDGE') {
              const newStatus = txStatus.errorCode === 'PLEDGE_MARKER_USED' ? 'REJECTED_DUPLICATE' : 'FAILED';
              await client.query(
                `UPDATE pledges 
                 SET blockchain_status = 'FAILED', status = $1, updated_at = NOW() 
                 WHERE invoice_id = $2 AND blockchain_status = 'PENDING'`,
                [newStatus, tx.invoice_id]
              );
            }

            await recordAuditEvent(
              {
                action: 'CHAIN_TX_FAILED',
                invoiceId: tx.invoice_id,
                source: 'CHAIN',
                details: { chainTxId: tx.id, kind: tx.kind, errorCode: txStatus.errorCode },
              },
              client
            );
          });
          failed++;
          continue;
        }
      }

      // If attempts exceeded max limit, mark failed
      if (tx.attempts >= 5) {
        await query(
          `UPDATE chain_txs SET status = 'FAILED', error_code = 'TIMEOUT', updated_at = NOW() WHERE id = $1`,
          [tx.id]
        );
        failed++;
      } else {
        await query(
          `UPDATE chain_txs SET attempts = attempts + 1, updated_at = NOW() WHERE id = $1`,
          [tx.id]
        );
        stillPending++;
      }
    } catch (err) {
      console.error(`Reconciliation error for chain_tx ${tx.id}:`, err);
      stillPending++;
    }
  }

  return {
    scanned: pendingTxs.length,
    confirmed,
    failed,
    stillPending,
  };
}
