/**
 * api/mock/invoices.mock.ts
 *
 * Handles all /invoices/* and /pledge-markers/* routes.
 * Enforces:
 *  - Role-based access exactly per contract §5
 *  - InvoiceStatus state machine exactly per contract §2
 *  - DUPLICATE_PLEDGE via usedPledgeMarkers set
 */

import {
  db,
  uuid,
  now,
  nextAuditId,
  mockCommitment,
  mockPledgeMarker,
  mockSha256,
  mockHash,
} from './db.js';
import { ok, created, err } from './index.js';
import type { Invoice, Pledge, AuditEvent, InvoiceStatus } from '../types.js';

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function requireAuth(): Response | null {
  if (!db.currentSession) return err(401, 'UNAUTHENTICATED', 'Not logged in');
  return null;
}

function addAudit(
  action: string,
  invoiceId?: string,
  pledgeId?: string,
  details: Record<string, unknown> = {},
): AuditEvent {
  const event: AuditEvent = {
    id: nextAuditId(),
    at: now(),
    action,
    actor: db.currentSession
      ? { id: db.currentSession.id, displayName: db.currentSession.displayName }
      : null,
    source: 'LOCAL',
    details: { invoiceId, pledgeId, ...details },
  };
  db.auditEvents.push(event);
  return event;
}

function roleView(invoice: Invoice): Invoice {
  // FINANCIER: only sees AVAILABLE and PLEDGED
  if (db.currentSession?.role === 'FINANCIER') {
    return invoice;
  }
  // BUYER: only sees invoices assigned to them (and not DRAFT)
  if (db.currentSession?.role === 'BUYER') {
    return invoice;
  }
  return invoice;
}

// -----------------------------------------------------------------------
// Route dispatcher
// -----------------------------------------------------------------------
export async function handleInvoices(
  method: string,
  path: string,
  body: unknown,
  params: URLSearchParams,
): Promise<Response> {
  const authErr = requireAuth();
  if (authErr) return authErr;

  const user = db.currentSession!;

  // /pledge-markers/:marker
  if (path.startsWith('/pledge-markers/')) {
    const marker = path.slice('/pledge-markers/'.length);
    const used = db.usedPledgeMarkers.has(marker);
    const pledge = db.pledges.find((p) => p.pledgeMarker === marker);
    return ok({ marker, used, status: pledge?.status ?? null });
  }

  // /invoices (collection)
  if (path === '/invoices') {
    if (method === 'POST') return createInvoice(body);
    if (method === 'GET') return listInvoices(params);
    return err(405, 'INTERNAL_ERROR', 'Method not allowed');
  }

  // /invoices/:id[/sub]
  const match = /^\/invoices\/([^/]+)(\/.*)?$/.exec(path);
  if (!match) return err(404, 'NOT_FOUND', 'Route not found');

  const id = match[1]!;
  const sub = match[2] ?? '';

  // sub-routes
  if (sub === '' || sub === '/') {
    if (method === 'GET') return getInvoice(id);
    if (method === 'PATCH') return updateInvoice(id, body);
  }
  if (sub === '/document') {
    if (method === 'POST') return uploadDocument(id, body);
    if (method === 'GET') return getDocument(id);
  }
  if (sub === '/commit' && method === 'POST') return commitInvoice(id);
  if (sub === '/verify-commitment' && method === 'POST') return verifyCommitment(id);
  if (sub === '/acknowledgement' && method === 'POST') return submitAcknowledgement(id, body);
  if (sub === '/release' && method === 'POST') return releaseInvoice(id);
  if (sub === '/settle' && method === 'POST') return settleInvoice(id);
  if (sub === '/pledges') {
    if (method === 'POST') return createPledge(id, body);
    if (method === 'GET') return listPledges(id);
  }
  if (sub === '/audit' && method === 'GET') return getAuditEvents(id);

  return err(404, 'NOT_FOUND', `Mock: unknown invoice sub-route ${method} ${sub}`);

  // ─────────────────────────────────────────────────────────────────────
  // Handler implementations (inner functions share the `user` variable)
  // ─────────────────────────────────────────────────────────────────────

  function createInvoice(b: unknown): Response {
    if (user.role !== 'SUPPLIER') return err(403, 'FORBIDDEN', 'Only suppliers can create invoices');
    const data = b as {
      invoiceNumber?: string;
      buyerId?: string;
      amountMinorUnits?: string;
      currency?: string;
      issueDate?: string;
      dueDate?: string;
    };
    if (!data.invoiceNumber || !data.buyerId || !data.amountMinorUnits || !data.currency || !data.issueDate || !data.dueDate) {
      return err(400, 'VALIDATION_ERROR', 'All invoice fields are required');
    }
    // Validate buyer exists
    const buyer = db.users.find((u) => u.id === data.buyerId && u.role === 'BUYER');
    if (!buyer) return err(400, 'VALIDATION_ERROR', 'Buyer not found');
    // Validate due >= issue
    if (data.dueDate < data.issueDate) {
      return err(400, 'VALIDATION_ERROR', 'Due date must be on or after issue date', {
        dueDate: 'Must be on or after issue date',
      });
    }
    // Check duplicate invoice number for this supplier
    const dup = db.invoices.find(
      (i) => i.supplier.id === user.id && i.invoiceNumber === data.invoiceNumber,
    );
    if (dup) return err(409, 'CONFLICT', 'Invoice number already exists for this supplier');

    const inv: Invoice = {
      id: uuid(),
      invoiceNumber: data.invoiceNumber,
      supplier: { id: user.id, displayName: user.displayName },
      buyer: { id: buyer.id, displayName: buyer.displayName },
      amountMinorUnits: data.amountMinorUnits,
      currency: data.currency.toUpperCase(),
      issueDate: data.issueDate,
      dueDate: data.dueDate,
      commitment: null,
      status: 'DRAFT',
      hasDocument: false,
      acknowledgement: null,
      registration: { chainStatus: 'LOCAL_ONLY', chainMode: 'MOCK', txHash: null },
      pledgeSummary: null,
      createdAt: now(),
      updatedAt: now(),
    };
    db.invoices.push(inv);
    addAudit('INVOICE_CREATED', inv.id);
    return created({ invoice: inv });
  }

  function listInvoices(p: URLSearchParams): Response {
    const statusFilter = p.get('status') as InvoiceStatus | null;
    let items = db.invoices;

    if (user.role === 'SUPPLIER') {
      items = items.filter((i) => i.supplier.id === user.id);
    } else if (user.role === 'BUYER') {
      items = items.filter((i) => i.buyer.id === user.id && i.status !== 'DRAFT');
    } else if (user.role === 'FINANCIER') {
      items = items.filter((i) => i.status === 'AVAILABLE' || i.status === 'PLEDGED');
    }

    if (statusFilter) {
      items = items.filter((i) => i.status === statusFilter);
    }

    const page = parseInt(p.get('page') ?? '1', 10);
    const pageSize = parseInt(p.get('pageSize') ?? '20', 10);
    const total = items.length;
    const start = (page - 1) * pageSize;
    const paged = items.slice(start, start + pageSize);

    return ok({ items: paged.map(roleView), page, pageSize, total });
  }

  function getInvoice(invoiceId: string): Response {
    const inv = db.invoices.find((i) => i.id === invoiceId);
    if (!inv) return err(404, 'NOT_FOUND', 'Invoice not found');

    // Role-based access
    if (user.role === 'SUPPLIER' && inv.supplier.id !== user.id) return err(403, 'FORBIDDEN', 'Not your invoice');
    if (user.role === 'BUYER' && (inv.buyer.id !== user.id || inv.status === 'DRAFT')) return err(403, 'FORBIDDEN', 'Not accessible');
    if (user.role === 'FINANCIER' && inv.status !== 'AVAILABLE' && inv.status !== 'PLEDGED') return err(403, 'FORBIDDEN', 'Not accessible');

    return ok({ invoice: roleView(inv) });
  }

  function updateInvoice(invoiceId: string, b: unknown): Response {
    if (user.role !== 'SUPPLIER') return err(403, 'FORBIDDEN', 'Only suppliers can edit invoices');
    const inv = db.invoices.find((i) => i.id === invoiceId && i.supplier.id === user.id);
    if (!inv) return err(404, 'NOT_FOUND', 'Invoice not found');
    if (inv.status !== 'DRAFT') return err(409, 'INVALID_TRANSITION', 'Can only edit DRAFT invoices');

    const data = b as Partial<{
      invoiceNumber: string;
      buyerId: string;
      amountMinorUnits: string;
      currency: string;
      issueDate: string;
      dueDate: string;
    }>;

    if (data.invoiceNumber) inv.invoiceNumber = data.invoiceNumber;
    if (data.amountMinorUnits) inv.amountMinorUnits = data.amountMinorUnits;
    if (data.currency) inv.currency = data.currency.toUpperCase();
    if (data.issueDate) inv.issueDate = data.issueDate;
    if (data.dueDate) inv.dueDate = data.dueDate;
    if (data.buyerId) {
      const buyer = db.users.find((u) => u.id === data.buyerId && u.role === 'BUYER');
      if (!buyer) return err(400, 'VALIDATION_ERROR', 'Buyer not found');
      inv.buyer = { id: buyer.id, displayName: buyer.displayName };
    }

    // Validate dates
    if (inv.dueDate < inv.issueDate) return err(400, 'VALIDATION_ERROR', 'Due date must be on or after issue date');

    inv.updatedAt = now();
    addAudit('INVOICE_UPDATED', inv.id);
    return ok({ invoice: inv });
  }

  function uploadDocument(invoiceId: string, b: unknown): Response {
    if (user.role !== 'SUPPLIER') return err(403, 'FORBIDDEN', 'Only suppliers can upload documents');
    const inv = db.invoices.find((i) => i.id === invoiceId && i.supplier.id === user.id);
    if (!inv) return err(404, 'NOT_FOUND', 'Invoice not found');

    const data = b as { filename?: string; mimeType?: string; contentBase64?: string };
    if (!data.filename || !data.mimeType || !data.contentBase64) {
      return err(400, 'VALIDATION_ERROR', 'filename, mimeType, and contentBase64 are required');
    }

    const allowed = ['application/pdf', 'image/png', 'image/jpeg'];
    if (!allowed.includes(data.mimeType)) {
      return err(400, 'VALIDATION_ERROR', 'Only PDF, PNG, JPG are allowed');
    }

    // Estimate size from base64 length
    const sizeBytes = Math.floor((data.contentBase64.length * 3) / 4);
    if (sizeBytes > 3 * 1024 * 1024) {
      return err(400, 'VALIDATION_ERROR', 'File must be ≤ 3 MB');
    }

    const sha256 = mockSha256(data.contentBase64);
    db.documents.set(invoiceId, {
      filename: data.filename,
      mimeType: data.mimeType,
      contentBase64: data.contentBase64,
      sizeBytes,
      sha256,
    });
    inv.hasDocument = true;
    inv.updatedAt = now();

    return ok({
      document: {
        filename: data.filename,
        mimeType: data.mimeType,
        sizeBytes,
        sha256,
      },
    });
  }

  function getDocument(invoiceId: string): Response {
    const inv = db.invoices.find((i) => i.id === invoiceId);
    if (!inv) return err(404, 'NOT_FOUND', 'Invoice not found');

    // Only supplier (owner) or assigned buyer
    const isOwner = user.role === 'SUPPLIER' && inv.supplier.id === user.id;
    const isAssignedBuyer = user.role === 'BUYER' && inv.buyer.id === user.id;
    if (!isOwner && !isAssignedBuyer) return err(403, 'FORBIDDEN', 'Not accessible');

    const doc = db.documents.get(invoiceId);
    if (!doc) return err(404, 'NOT_FOUND', 'No document uploaded');

    // Decode base64 → binary and return as a blob-style Response
    const binaryStr = atob(doc.contentBase64);
    const bytes = Uint8Array.from(binaryStr, (c) => c.charCodeAt(0));
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': doc.mimeType,
        'Content-Disposition': `attachment; filename="${doc.filename}"`,
      },
    });
  }

  function commitInvoice(invoiceId: string): Response {
    if (user.role !== 'SUPPLIER') return err(403, 'FORBIDDEN', 'Only suppliers can commit');
    const inv = db.invoices.find((i) => i.id === invoiceId && i.supplier.id === user.id);
    if (!inv) return err(404, 'NOT_FOUND', 'Invoice not found');
    if (inv.status !== 'DRAFT') return err(409, 'INVALID_TRANSITION', 'Only DRAFT invoices can be committed');

    // Generate mock commitment (deterministic from invoice fields)
    const seed = [inv.invoiceNumber, inv.supplier.id, inv.buyer.id, inv.amountMinorUnits, inv.currency, inv.issueDate, inv.dueDate].join('|');
    const commitment = mockCommitment(seed + inv.id);

    inv.commitment = commitment;
    inv.status = 'PENDING_ACK';
    inv.registration = { chainStatus: 'LOCAL_ONLY', chainMode: 'MOCK', txHash: null };
    inv.updatedAt = now();

    addAudit('COMMITMENT_GENERATED', inv.id, undefined, { commitment });
    return ok({ invoice: inv });
  }

  function verifyCommitment(invoiceId: string): Response {
    if (user.role !== 'SUPPLIER') return err(403, 'FORBIDDEN', 'Only suppliers can verify');
    const inv = db.invoices.find((i) => i.id === invoiceId && i.supplier.id === user.id);
    if (!inv) return err(404, 'NOT_FOUND', 'Invoice not found');
    if (!inv.commitment) return err(400, 'VALIDATION_ERROR', 'No commitment generated yet');
    // In the mock, recompute and confirm it matches (always true)
    return ok({ valid: true, commitment: inv.commitment });
  }

  function submitAcknowledgement(invoiceId: string, b: unknown): Response {
    if (user.role !== 'BUYER') return err(403, 'FORBIDDEN', 'Only buyers can acknowledge');
    const inv = db.invoices.find((i) => i.id === invoiceId && i.buyer.id === user.id);
    if (!inv) return err(404, 'NOT_FOUND', 'Invoice not found');
    if (inv.status !== 'PENDING_ACK') return err(409, 'INVALID_TRANSITION', 'Invoice is not awaiting acknowledgement');

    const data = b as { decision?: string; reason?: string };
    if (!data.decision || !['ACKNOWLEDGE', 'REJECT'].includes(data.decision)) {
      return err(400, 'VALIDATION_ERROR', 'decision must be ACKNOWLEDGE or REJECT');
    }
    if (data.decision === 'REJECT' && !data.reason?.trim()) {
      return err(400, 'VALIDATION_ERROR', 'Reason is required when rejecting', {
        reason: 'Reason is required when rejecting',
      });
    }

    const ack = {
      decision: data.decision as 'ACKNOWLEDGE' | 'REJECT',
      reason: data.reason ?? null,
      createdAt: now(),
      chainStatus: 'LOCAL_ONLY' as const,
      txHash: null,
    };

    inv.acknowledgement = ack;
    inv.status = data.decision === 'ACKNOWLEDGE' ? 'ACKNOWLEDGED' : 'REJECTED';
    inv.updatedAt = now();

    const action = data.decision === 'ACKNOWLEDGE' ? 'ACK_SUBMITTED' : 'INVOICE_REJECTED';
    addAudit(action, inv.id, undefined, { decision: data.decision, reason: data.reason });

    return ok({ acknowledgement: ack, invoice: inv });
  }

  function releaseInvoice(invoiceId: string): Response {
    if (user.role !== 'SUPPLIER') return err(403, 'FORBIDDEN', 'Only suppliers can release');
    const inv = db.invoices.find((i) => i.id === invoiceId && i.supplier.id === user.id);
    if (!inv) return err(404, 'NOT_FOUND', 'Invoice not found');
    if (inv.status !== 'ACKNOWLEDGED') return err(409, 'INVALID_TRANSITION', 'Invoice must be ACKNOWLEDGED to release');

    inv.status = 'AVAILABLE';
    inv.updatedAt = now();
    addAudit('INVOICE_RELEASED', inv.id);
    return ok({ invoice: inv });
  }

  function settleInvoice(invoiceId: string): Response {
    if (user.role !== 'FINANCIER') return err(403, 'FORBIDDEN', 'Only financiers can settle');
    const inv = db.invoices.find((i) => i.id === invoiceId);
    if (!inv) return err(404, 'NOT_FOUND', 'Invoice not found');
    if (inv.status !== 'PLEDGED') return err(409, 'INVALID_TRANSITION', 'Invoice must be PLEDGED to settle');

    // Verify the calling financier owns the pledge
    const pledge = db.pledges.find(
      (p) => p.invoiceId === invoiceId && p.financierId === user.id && p.status === 'REGISTERED',
    );
    if (!pledge) return err(403, 'FORBIDDEN', 'You are not the financier for this invoice');

    pledge.status = 'SETTLED';
    inv.status = 'SETTLED';
    inv.updatedAt = now();
    addAudit('INVOICE_SETTLED', inv.id, pledge.id);
    return ok({ invoice: inv });
  }

  function createPledge(invoiceId: string, b: unknown): Response {
    if (user.role !== 'FINANCIER') return err(403, 'FORBIDDEN', 'Only financiers can pledge');
    const inv = db.invoices.find((i) => i.id === invoiceId);
    if (!inv) return err(404, 'NOT_FOUND', 'Invoice not found');
    if (!inv.commitment) return err(422, 'COMMITMENT_MISMATCH', 'Invoice has no commitment');

    const pledgeMarker = mockPledgeMarker(inv.commitment);

    // *** THE MAIN DEMO MOMENT: DUPLICATE_PLEDGE ***
    if (db.usedPledgeMarkers.has(pledgeMarker) || inv.status === 'PLEDGED' || inv.status === 'SETTLED') {
      return err(409, 'DUPLICATE_PLEDGE', 'A pledge already exists for this commitment', {
        pledgeMarker,
      });
    }

    if (inv.status !== 'AVAILABLE') return err(409, 'INVALID_TRANSITION', 'Invoice must be AVAILABLE to pledge');

    const data = b as { advanceMinorUnits?: string; note?: string };
    if (!data.advanceMinorUnits) return err(400, 'VALIDATION_ERROR', 'advanceMinorUnits is required');

    // advanceMinorUnits must be <= invoice amount
    if (BigInt(data.advanceMinorUnits) > BigInt(inv.amountMinorUnits)) {
      return err(400, 'VALIDATION_ERROR', 'Advance cannot exceed invoice amount', {
        advanceMinorUnits: 'Cannot exceed invoice amount',
      });
    }

    // Mark as used
    db.usedPledgeMarkers.add(pledgeMarker);

    const pledge: Pledge = {
      id: uuid(),
      invoiceId,
      commitment: inv.commitment,
      pledgeMarker,
      financierId: user.id,
      advanceMinorUnits: data.advanceMinorUnits,
      note: data.note ?? null,
      status: 'REGISTERED',
      createdAt: now(),
      blockchainTxHash: null,
      blockchainStatus: 'LOCAL_ONLY',
      chainMode: 'MOCK',
    };

    db.pledges.push(pledge);
    inv.status = 'PLEDGED';
    inv.pledgeSummary = { pledged: true };
    inv.updatedAt = now();

    addAudit('PLEDGE_REGISTERED', inv.id, pledge.id, { pledgeMarker, advanceMinorUnits: data.advanceMinorUnits });

    // Add a fake "pledge requested" audit event first
    // (in the real system these would be two separate events from the queue)
    addAudit('PLEDGE_REQUESTED', inv.id, pledge.id);

    return created({ pledge });
  }

  function listPledges(invoiceId: string): Response {
    const inv = db.invoices.find((i) => i.id === invoiceId);
    if (!inv) return err(404, 'NOT_FOUND', 'Invoice not found');

    // Supplier of invoice or the pledging financier
    const isSupplier = user.role === 'SUPPLIER' && inv.supplier.id === user.id;
    const pledges = db.pledges.filter((p) => p.invoiceId === invoiceId);
    const isFinancier = user.role === 'FINANCIER' && pledges.some((p) => p.financierId === user.id);

    if (!isSupplier && !isFinancier) return err(403, 'FORBIDDEN', 'Not accessible');

    return ok(pledges);
  }

  function getAuditEvents(invoiceId: string): Response {
    const inv = db.invoices.find((i) => i.id === invoiceId);
    if (!inv) return err(404, 'NOT_FOUND', 'Invoice not found');

    // Only parties to the invoice can see the audit log
    const isSupplier = user.role === 'SUPPLIER' && inv.supplier.id === user.id;
    const isBuyer = user.role === 'BUYER' && inv.buyer.id === user.id;
    const pledges = db.pledges.filter((p) => p.invoiceId === invoiceId);
    const isFinancier = user.role === 'FINANCIER' && pledges.some((p) => p.financierId === user.id);

    if (!isSupplier && !isBuyer && !isFinancier) return err(403, 'FORBIDDEN', 'Not accessible');

    const events = db.auditEvents
      .filter((e) => (e.details as Record<string, unknown>)['invoiceId'] === invoiceId)
      .sort((a, b) => a.id - b.id);

    return ok(events);
  }
}

// We need mockHash for the pledge marker but it's only used inside createPledge.
// Re-export is handled by db.ts.
void mockHash; // suppress unused warning
