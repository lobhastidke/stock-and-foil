import crypto from 'crypto';
import { query, transaction, DbClient } from '../db/index.js';
import { AuthUser, canViewInvoice, canModifyInvoice, canViewDocument, sanitizeInvoiceResponse } from '../domain/permissions.js';
import { assertTransition, assertEditable, InvoiceStatus } from '../domain/invoiceStateMachine.js';
import { validateMinorUnits, validateCurrency, validateInvoiceDates } from '../domain/money.js';
import { toCanonicalJson, CommittedInvoiceData } from '../crypto/canonical.js';
import { generateSalt, computeCommitment, verifyCommitment } from '../crypto/commitment.js';
import { computeUserRef } from '../crypto/refs.js';
import { encryptString, decryptString, encryptData, decryptData } from '../crypto/encrypt.js';
import { AppError } from '../middleware/errorHandler.js';
import { recordAuditEvent } from './audit.js';
import { getChainAdapter, Hex } from './chainWorker.js';

export interface CreateInvoiceParams {
  invoiceNumber: string;
  buyerId: string;
  amountMinorUnits: string;
  currency: string;
  issueDate: string;
  dueDate: string;
}

export interface UpdateInvoiceParams {
  invoiceNumber?: string;
  buyerId?: string;
  amountMinorUnits?: string;
  currency?: string;
  issueDate?: string;
  dueDate?: string;
}

export interface UploadDocumentParams {
  filename: string;
  mimeType: string;
  contentBase64: string;
}

/**
 * Sniffs magic bytes to verify file type against whitelist:
 * PDF: 0x25 0x50 0x44 0x46 (%PDF)
 * PNG: 0x89 0x50 0x4E 0x47 (\x89PNG)
 * JPEG: 0xFF 0xD8 0xFF
 */
function validateDocumentContent(buffer: Buffer, claimedMime: string): void {
  if (buffer.length === 0 || buffer.length > 3 * 1024 * 1024) {
    throw new AppError('VALIDATION_ERROR', 'Document size must be greater than 0 and at most 3MB.', 400);
  }

  const isPdf = buffer.length >= 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  const isPng = buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

  const mime = claimedMime.toLowerCase().trim();

  if (isPdf && (mime === 'application/pdf' || mime === 'pdf')) return;
  if (isPng && (mime === 'image/png' || mime === 'png')) return;
  if (isJpeg && (mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'jpeg' || mime === 'jpg')) return;

  throw new AppError(
    'VALIDATION_ERROR',
    `Invalid document content: format does not match claimed MIME type '${claimedMime}' or is not an allowed format (PDF/PNG/JPG).`,
    400
  );
}

/**
 * Formats a raw database row into the standardized Block A Invoice JSON object.
 */
function formatInvoiceRow(row: any, user: AuthUser) {
  const base = {
    id: row.id,
    invoiceNumber: row.invoice_number,
    supplier: {
      id: row.supplier_id,
      displayName: row.supplier_name,
    },
    buyer: {
      id: row.buyer_id,
      displayName: row.buyer_name,
    },
    amountMinorUnits: row.amount_minor_units.toString(),
    currency: row.currency,
    issueDate: typeof row.issue_date === 'string' ? row.issue_date.slice(0, 10) : new Date(row.issue_date).toISOString().slice(0, 10),
    dueDate: typeof row.due_date === 'string' ? row.due_date.slice(0, 10) : new Date(row.due_date).toISOString().slice(0, 10),
    commitment: row.commitment || null,
    status: row.status as InvoiceStatus,
    hasDocument: Boolean(row.has_document),
    acknowledgement: row.ack_decision
      ? {
          decision: row.ack_decision,
          reason: row.ack_reason || null,
          createdAt: new Date(row.ack_created_at).toISOString(),
          chainStatus: row.ack_chain_status || 'LOCAL_ONLY',
          txHash: row.ack_tx_hash || null,
        }
      : null,
    registration: row.commitment
      ? {
          chainStatus: row.reg_chain_status || 'CONFIRMED',
          chainMode: row.reg_chain_mode || 'MOCK',
          txHash: row.reg_tx_hash || null,
        }
      : {
          chainStatus: 'LOCAL_ONLY',
          chainMode: 'MOCK',
          txHash: null,
        },
    pledgeSummary: row.pledge_id
      ? {
          pledged: true,
        }
      : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };

  return sanitizeInvoiceResponse(base, user, row.pledge_financier_id);
}

const INVOICE_SELECT_SQL = `
  SELECT 
    i.*,
    s.display_name AS supplier_name,
    b.display_name AS buyer_name,
    (d.invoice_id IS NOT NULL) AS has_document,
    ack.decision AS ack_decision,
    ack.reason AS ack_reason,
    ack.created_at AS ack_created_at,
    ack_tx.status AS ack_chain_status,
    ack_tx.tx_hash AS ack_tx_hash,
    reg_tx.status AS reg_chain_status,
    'MOCK' AS reg_chain_mode,
    reg_tx.tx_hash AS reg_tx_hash,
    pl.id AS pledge_id,
    pl.financier_id AS pledge_financier_id
  FROM invoices i
  JOIN users s ON s.id = i.supplier_id
  JOIN users b ON b.id = i.buyer_id
  LEFT JOIN invoice_documents d ON d.invoice_id = i.id
  LEFT JOIN acknowledgements ack ON ack.invoice_id = i.id
  LEFT JOIN chain_txs ack_tx ON ack_tx.id = ack.chain_tx_id
  LEFT JOIN chain_txs reg_tx ON reg_tx.invoice_id = i.id AND reg_tx.kind = 'REGISTER_INVOICE'
  LEFT JOIN pledges pl ON pl.invoice_id = i.id AND pl.status IN ('REQUESTED', 'REGISTERED', 'SETTLED')
`;

export async function createInvoice(params: CreateInvoiceParams, user: AuthUser) {
  if (user.role !== 'SUPPLIER') {
    throw new AppError('FORBIDDEN', 'Only suppliers can create invoices.', 403);
  }

  const amountMinorUnits = validateMinorUnits(params.amountMinorUnits);
  const currency = validateCurrency(params.currency);
  validateInvoiceDates(params.issueDate, params.dueDate);

  // Verify buyer exists and is a BUYER
  const buyerCheck = await query('SELECT id, role FROM users WHERE id = $1', [params.buyerId]);
  if (buyerCheck.rows.length === 0 || buyerCheck.rows[0].role !== 'BUYER') {
    throw new AppError('VALIDATION_ERROR', 'The specified buyer does not exist or does not possess the BUYER role.', 400);
  }

  // Check unique (supplier_id, invoice_number)
  const existing = await query(
    'SELECT id FROM invoices WHERE supplier_id = $1 AND invoice_number = $2',
    [user.id, params.invoiceNumber.trim()]
  );
  if (existing.rows.length > 0) {
    throw new AppError('CONFLICT', `Invoice number '${params.invoiceNumber}' already exists for this supplier.`, 409);
  }

  const res = await transaction(async (client) => {
    const insertRes = await client.query(
      `INSERT INTO invoices 
         (invoice_number, supplier_id, buyer_id, amount_minor_units, currency, issue_date, due_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT')
       RETURNING id`,
      [
        params.invoiceNumber.trim(),
        user.id,
        params.buyerId,
        amountMinorUnits,
        currency,
        params.issueDate,
        params.dueDate,
      ]
    );
    const invoiceId = insertRes.rows[0].id;

    await recordAuditEvent(
      {
        actorUserId: user.id,
        action: 'INVOICE_CREATED',
        invoiceId,
        source: 'LOCAL',
        details: { invoiceNumber: params.invoiceNumber, amountMinorUnits, currency },
      },
      client
    );

    return invoiceId;
  });

  return getInvoiceById(res, user);
}

export async function getInvoices(
  user: AuthUser,
  filters: { status?: string; page?: number; pageSize?: number } = {}
) {
  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize || 20));
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  if (user.role === 'SUPPLIER') {
    conditions.push(`i.supplier_id = $${paramIdx++}`);
    params.push(user.id);
  } else if (user.role === 'BUYER') {
    conditions.push(`i.buyer_id = $${paramIdx++}`);
    params.push(user.id);
    conditions.push(`i.status != 'DRAFT'`); // Buyers NEVER see DRAFT invoices
  } else if (user.role === 'FINANCIER') {
    conditions.push(`i.status IN ('AVAILABLE', 'PLEDGED', 'SETTLED')`);
  }

  if (filters.status) {
    conditions.push(`i.status = $${paramIdx++}`);
    params.push(filters.status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRes = await query(`SELECT COUNT(*) AS total FROM invoices i ${whereClause}`, params);
  const total = parseInt(countRes.rows[0].total, 10);

  const listSql = `
    ${INVOICE_SELECT_SQL}
    ${whereClause}
    ORDER BY i.created_at DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}
  `;
  params.push(pageSize, offset);

  const { rows } = await query(listSql, params);
  const items = rows.map((r) => formatInvoiceRow(r, user));

  return {
    items,
    page,
    pageSize,
    total,
  };
}

export async function getInvoiceById(id: string, user: AuthUser) {
  const { rows } = await query(`${INVOICE_SELECT_SQL} WHERE i.id = $1`, [id]);
  if (rows.length === 0) {
    throw new AppError('NOT_FOUND', `Invoice with id '${id}' not found.`, 404);
  }

  const row = rows[0];
  const invoiceContext = {
    id: row.id,
    supplierId: row.supplier_id,
    buyerId: row.buyer_id,
    status: row.status as InvoiceStatus,
  };

  if (!canViewInvoice(user, invoiceContext)) {
    throw new AppError('FORBIDDEN', 'You are not authorized to view this invoice.', 403);
  }

  return formatInvoiceRow(row, user);
}

export async function updateInvoice(id: string, updates: UpdateInvoiceParams, user: AuthUser) {
  const { rows } = await query('SELECT * FROM invoices WHERE id = $1', [id]);
  if (rows.length === 0) {
    throw new AppError('NOT_FOUND', `Invoice with id '${id}' not found.`, 404);
  }
  const current = rows[0];

  if (!canModifyInvoice(user, { id, supplierId: current.supplier_id, buyerId: current.buyer_id, status: current.status })) {
    throw new AppError('FORBIDDEN', 'Invoices can only be modified by their supplier while in DRAFT status.', 403);
  }

  assertEditable(current.status);

  const amountMinorUnits = updates.amountMinorUnits ? validateMinorUnits(updates.amountMinorUnits) : current.amount_minor_units;
  const currency = updates.currency ? validateCurrency(updates.currency) : current.currency;
  const issueDate = updates.issueDate || (current.issue_date instanceof Date ? current.issue_date.toISOString().slice(0, 10) : String(current.issue_date).slice(0, 10));
  const dueDate = updates.dueDate || (current.due_date instanceof Date ? current.due_date.toISOString().slice(0, 10) : String(current.due_date).slice(0, 10));
  validateInvoiceDates(issueDate, dueDate);

  const buyerId = updates.buyerId || current.buyer_id;
  const invoiceNumber = updates.invoiceNumber ? updates.invoiceNumber.trim() : current.invoice_number;

  await transaction(async (client) => {
    await client.query(
      `UPDATE invoices 
       SET invoice_number = $1, buyer_id = $2, amount_minor_units = $3, currency = $4,
           issue_date = $5, due_date = $6, updated_at = NOW()
       WHERE id = $7`,
      [invoiceNumber, buyerId, amountMinorUnits, currency, issueDate, dueDate, id]
    );

    await recordAuditEvent(
      {
        actorUserId: user.id,
        action: 'INVOICE_UPDATED',
        invoiceId: id,
        source: 'LOCAL',
        details: { invoiceNumber, amountMinorUnits, currency },
      },
      client
    );
  });

  return getInvoiceById(id, user);
}

export async function uploadDocument(id: string, params: UploadDocumentParams, user: AuthUser) {
  const { rows } = await query('SELECT * FROM invoices WHERE id = $1', [id]);
  if (rows.length === 0) {
    throw new AppError('NOT_FOUND', `Invoice with id '${id}' not found.`, 404);
  }
  const current = rows[0];

  if (user.role !== 'SUPPLIER' || current.supplier_id !== user.id) {
    throw new AppError('FORBIDDEN', 'Only the supplier can upload documents for this invoice.', 403);
  }

  assertEditable(current.status);

  const buffer = Buffer.from(params.contentBase64, 'base64');
  validateDocumentContent(buffer, params.mimeType);

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const contentEnc = encryptData(buffer);

  await query(
    `INSERT INTO invoice_documents (invoice_id, filename, mime_type, size_bytes, content_enc, sha256)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (invoice_id) DO UPDATE 
     SET filename = EXCLUDED.filename, mime_type = EXCLUDED.mime_type, 
         size_bytes = EXCLUDED.size_bytes, content_enc = EXCLUDED.content_enc, 
         sha256 = EXCLUDED.sha256, created_at = NOW()`,
    [id, params.filename, params.mimeType, buffer.length, contentEnc, sha256]
  );

  return {
    filename: params.filename,
    mimeType: params.mimeType,
    sizeBytes: buffer.length,
    sha256,
  };
}

export async function downloadDocument(id: string, user: AuthUser) {
  const { rows } = await query(
    `SELECT i.supplier_id, i.buyer_id, i.status, d.filename, d.mime_type, d.content_enc 
     FROM invoices i 
     JOIN invoice_documents d ON d.invoice_id = i.id 
     WHERE i.id = $1`,
    [id]
  );

  if (rows.length === 0) {
    throw new AppError('NOT_FOUND', 'Invoice document not found.', 404);
  }

  const row = rows[0];
  const invoiceContext = {
    id,
    supplierId: row.supplier_id,
    buyerId: row.buyer_id,
    status: row.status as InvoiceStatus,
  };

  if (!canViewDocument(user, invoiceContext)) {
    throw new AppError('FORBIDDEN', 'You are not authorized to download this document.', 403);
  }

  const decrypted = decryptData(row.content_enc);
  return {
    filename: row.filename,
    mimeType: row.mime_type,
    buffer: decrypted,
  };
}

export async function commitInvoice(id: string, user: AuthUser) {
  const { rows } = await query('SELECT * FROM invoices WHERE id = $1', [id]);
  if (rows.length === 0) {
    throw new AppError('NOT_FOUND', `Invoice with id '${id}' not found.`, 404);
  }
  const current = rows[0];

  if (user.role !== 'SUPPLIER' || current.supplier_id !== user.id) {
    throw new AppError('FORBIDDEN', 'Only the invoice supplier can commit this invoice.', 403);
  }

  assertTransition(current.status, 'PENDING_ACK');

  // Build canonical invoice data
  const committedData: CommittedInvoiceData = {
    invoiceNumber: current.invoice_number,
    supplierId: current.supplier_id,
    buyerId: current.buyer_id,
    amountMinorUnits: current.amount_minor_units.toString(),
    currency: current.currency,
    issueDate: typeof current.issue_date === 'string' ? current.issue_date.slice(0, 10) : new Date(current.issue_date).toISOString().slice(0, 10),
    dueDate: typeof current.due_date === 'string' ? current.due_date.slice(0, 10) : new Date(current.due_date).toISOString().slice(0, 10),
  };

  const canonicalJson = toCanonicalJson(committedData);
  const salt = generateSalt();
  const commitment = computeCommitment(salt, canonicalJson);
  const saltEnc = encryptString(salt);

  const supplierRef = computeUserRef(current.supplier_id);
  const buyerRef = computeUserRef(current.buyer_id);

  await transaction(async (client) => {
    await client.query(
      `UPDATE invoices 
       SET status = 'PENDING_ACK', commitment = $1, salt_enc = $2, updated_at = NOW() 
       WHERE id = $3`,
      [commitment, saltEnc, id]
    );

    // Insert chain_txs pending record
    const txIdRes = await client.query(
      `INSERT INTO chain_txs (kind, invoice_id, idempotency_key, status)
       VALUES ('REGISTER_INVOICE', $1, $2, 'PENDING')
       RETURNING id`,
      [id, `register_invoice:${id}`]
    );
    const chainTxId = txIdRes.rows[0].id;

    await recordAuditEvent(
      {
        actorUserId: user.id,
        action: 'COMMITMENT_GENERATED',
        invoiceId: id,
        source: 'LOCAL',
        details: { commitment },
      },
      client
    );
  });

  // Call chain adapter asynchronously
  const adapter = getChainAdapter();
  adapter
    .registerInvoice({
      commitment: commitment as Hex,
      supplierRef: supplierRef as Hex,
      buyerRef: buyerRef as Hex,
    })
    .then(async (txResult) => {
      await query(
        `UPDATE chain_txs 
         SET status = $1, tx_hash = $2, block_number = $3, updated_at = NOW() 
         WHERE idempotency_key = $4`,
        [txResult.status, txResult.txHash || null, txResult.blockNumber || null, `register_invoice:${id}`]
      );
    })
    .catch((err) => {
      console.error(`Async chain registration error for invoice ${id}:`, err);
    });

  return getInvoiceById(id, user);
}

export async function verifyCommitmentService(id: string, user: AuthUser) {
  const { rows } = await query('SELECT * FROM invoices WHERE id = $1', [id]);
  if (rows.length === 0) {
    throw new AppError('NOT_FOUND', `Invoice with id '${id}' not found.`, 404);
  }
  const current = rows[0];

  if (user.role !== 'SUPPLIER' || current.supplier_id !== user.id) {
    throw new AppError('FORBIDDEN', 'Only the invoice supplier can verify its commitment.', 403);
  }

  if (!current.commitment || !current.salt_enc) {
    throw new AppError('VALIDATION_ERROR', 'Invoice has not been committed yet.', 400);
  }

  const salt = decryptString(current.salt_enc);
  const committedData: CommittedInvoiceData = {
    invoiceNumber: current.invoice_number,
    supplierId: current.supplier_id,
    buyerId: current.buyer_id,
    amountMinorUnits: current.amount_minor_units.toString(),
    currency: current.currency,
    issueDate: typeof current.issue_date === 'string' ? current.issue_date.slice(0, 10) : new Date(current.issue_date).toISOString().slice(0, 10),
    dueDate: typeof current.due_date === 'string' ? current.due_date.slice(0, 10) : new Date(current.due_date).toISOString().slice(0, 10),
  };

  const valid = verifyCommitment(salt, committedData, current.commitment);
  return {
    valid,
    commitment: current.commitment,
  };
}

export async function releaseInvoice(id: string, user: AuthUser) {
  const { rows } = await query('SELECT * FROM invoices WHERE id = $1', [id]);
  if (rows.length === 0) {
    throw new AppError('NOT_FOUND', `Invoice with id '${id}' not found.`, 404);
  }
  const current = rows[0];

  if (user.role !== 'SUPPLIER' || current.supplier_id !== user.id) {
    throw new AppError('FORBIDDEN', 'Only the supplier can release this invoice for financing.', 403);
  }

  assertTransition(current.status, 'AVAILABLE');

  await transaction(async (client) => {
    await client.query(
      `UPDATE invoices SET status = 'AVAILABLE', updated_at = NOW() WHERE id = $1`,
      [id]
    );
    await recordAuditEvent(
      {
        actorUserId: user.id,
        action: 'INVOICE_RELEASED',
        invoiceId: id,
        source: 'LOCAL',
      },
      client
    );
  });

  return getInvoiceById(id, user);
}

export async function settleInvoice(id: string, user: AuthUser) {
  const { rows } = await query(
    `SELECT i.*, p.id AS pledge_id, p.financier_id 
     FROM invoices i 
     LEFT JOIN pledges p ON p.invoice_id = i.id AND p.status IN ('REQUESTED', 'REGISTERED') 
     WHERE i.id = $1`,
    [id]
  );

  if (rows.length === 0) {
    throw new AppError('NOT_FOUND', `Invoice with id '${id}' not found.`, 404);
  }
  const current = rows[0];

  if (user.role !== 'FINANCIER') {
    throw new AppError('FORBIDDEN', 'Only financiers can settle invoices.', 403);
  }

  if (current.financier_id && current.financier_id !== user.id) {
    throw new AppError('FORBIDDEN', 'Only the financier who pledged this invoice can settle it.', 403);
  }

  assertTransition(current.status, 'SETTLED');

  await transaction(async (client) => {
    await client.query(
      `UPDATE invoices SET status = 'SETTLED', updated_at = NOW() WHERE id = $1`,
      [id]
    );
    if (current.pledge_id) {
      await client.query(
        `UPDATE pledges SET status = 'SETTLED', updated_at = NOW() WHERE id = $1`,
        [current.pledge_id]
      );
    }
    await recordAuditEvent(
      {
        actorUserId: user.id,
        action: 'INVOICE_SETTLED',
        invoiceId: id,
        pledgeId: current.pledge_id || null,
        source: 'LOCAL',
      },
      client
    );
  });

  // Record on chain adapter asynchronously
  if (current.commitment) {
    const adapter = getChainAdapter();
    const financierRef = computeUserRef(user.id);
    adapter.markSettled({
      commitment: current.commitment as Hex,
      financierRef: financierRef as Hex,
    }).catch((err) => {
      console.error(`Async markSettled error for invoice ${id}:`, err);
    });
  }

  return getInvoiceById(id, user);
}
