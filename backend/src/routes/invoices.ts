import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { validate } from '../middleware/validate.js';
import {
  createInvoice,
  getInvoices,
  getInvoiceById,
  updateInvoice,
  uploadDocument,
  downloadDocument,
  commitInvoice,
  verifyCommitmentService,
  releaseInvoice,
  settleInvoice,
} from '../services/invoices.js';
import { submitAcknowledgement } from '../services/acknowledgements.js';
import { requestPledge, getPledgesForInvoice } from '../services/pledges.js';
import { query } from '../db/index.js';
import { AppError } from '../middleware/errorHandler.js';

export const invoicesRouter = Router();

const createInvoiceSchema = z.object({
  invoiceNumber: z.string().min(1, 'invoiceNumber is required.'),
  buyerId: z.string().uuid('buyerId must be a valid UUID.'),
  amountMinorUnits: z.string().regex(/^\d+$/, 'amountMinorUnits must be a base-10 integer string.'),
  currency: z.string().length(3, 'currency must be a 3-letter code.'),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'issueDate must be YYYY-MM-DD.'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be YYYY-MM-DD.'),
});

const updateInvoiceSchema = z.object({
  invoiceNumber: z.string().min(1).optional(),
  buyerId: z.string().uuid().optional(),
  amountMinorUnits: z.string().regex(/^\d+$/).optional(),
  currency: z.string().length(3).optional(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const uploadDocumentSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  contentBase64: z.string().min(1, 'contentBase64 is required.'),
});

const ackSchema = z.object({
  decision: z.enum(['ACKNOWLEDGE', 'REJECT']),
  reason: z.string().optional(),
});

const pledgeSchema = z.object({
  advanceMinorUnits: z.string().regex(/^\d+$/, 'advanceMinorUnits must be a base-10 integer string.'),
  note: z.string().optional(),
});

// POST /invoices (SUPPLIER)
invoicesRouter.post(
  '/',
  requireAuth,
  requireRole('SUPPLIER'),
  validate({ body: createInvoiceSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invoice = await createInvoice(req.body, req.user!);
      res.status(201).json({ data: invoice });
    } catch (err) {
      next(err);
    }
  }
);

// GET /invoices (Role-scoped)
invoicesRouter.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 20;

    const result = await getInvoices(req.user!, { status, page, pageSize });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// GET /invoices/:id (Role-scoped)
invoicesRouter.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoice = await getInvoiceById(req.params.id, req.user!);
    res.json({ data: invoice });
  } catch (err) {
    next(err);
  }
});

// PATCH /invoices/:id (SUPPLIER, DRAFT only)
invoicesRouter.patch(
  '/:id',
  requireAuth,
  requireRole('SUPPLIER'),
  validate({ body: updateInvoiceSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invoice = await updateInvoice(req.params.id, req.body, req.user!);
      res.json({ data: invoice });
    } catch (err) {
      next(err);
    }
  }
);

// POST /invoices/:id/document (SUPPLIER)
invoicesRouter.post(
  '/:id/document',
  requireAuth,
  requireRole('SUPPLIER'),
  validate({ body: uploadDocumentSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await uploadDocument(req.params.id, req.body, req.user!);
      res.json({ data: { document: doc } });
    } catch (err) {
      next(err);
    }
  }
);

// GET /invoices/:id/document (SUPPLIER and assigned BUYER only)
invoicesRouter.get('/:id/document', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doc = await downloadDocument(req.params.id, req.user!);
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${doc.filename}"`);
    res.send(doc.buffer);
  } catch (err) {
    next(err);
  }
});

// POST /invoices/:id/commit (SUPPLIER)
invoicesRouter.post('/:id/commit', requireAuth, requireRole('SUPPLIER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoice = await commitInvoice(req.params.id, req.user!);
    res.json({ data: invoice });
  } catch (err) {
    next(err);
  }
});

// POST /invoices/:id/verify-commitment (SUPPLIER)
invoicesRouter.post('/:id/verify-commitment', requireAuth, requireRole('SUPPLIER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await verifyCommitmentService(req.params.id, req.user!);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

// POST /invoices/:id/acknowledgement (BUYER assigned)
invoicesRouter.post(
  '/:id/acknowledgement',
  requireAuth,
  requireRole('BUYER'),
  validate({ body: ackSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await submitAcknowledgement(req.params.id, req.body, req.user!);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// POST /invoices/:id/release (SUPPLIER)
invoicesRouter.post('/:id/release', requireAuth, requireRole('SUPPLIER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoice = await releaseInvoice(req.params.id, req.user!);
    res.json({ data: invoice });
  } catch (err) {
    next(err);
  }
});

// POST /invoices/:id/settle (FINANCIER)
invoicesRouter.post('/:id/settle', requireAuth, requireRole('FINANCIER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoice = await settleInvoice(req.params.id, req.user!);
    res.json({ data: invoice });
  } catch (err) {
    next(err);
  }
});

// POST /invoices/:id/pledges (FINANCIER)
invoicesRouter.post(
  '/:id/pledges',
  requireAuth,
  requireRole('FINANCIER'),
  validate({ body: pledgeSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pledge = await requestPledge(req.params.id, req.body, req.user!);
      res.status(201).json({ data: pledge });
    } catch (err) {
      next(err);
    }
  }
);

// GET /invoices/:id/pledges (Supplier of invoice or pledging financier)
invoicesRouter.get('/:id/pledges', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pledges = await getPledgesForInvoice(req.params.id, req.user!);
    res.json({ data: pledges });
  } catch (err) {
    next(err);
  }
});

// GET /invoices/:id/audit (Parties to the invoice)
invoicesRouter.get('/:id/audit', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check permission to view invoice first
    await getInvoiceById(req.params.id, req.user!);

    const { rows } = await query(
      `SELECT a.id, a.at, a.action, a.source, a.details,
              u.id AS actor_id, u.display_name AS actor_name
       FROM audit_events a
       LEFT JOIN users u ON u.id = a.actor_user_id
       WHERE a.invoice_id = $1
       ORDER BY a.id ASC`,
      [req.params.id]
    );

    const events = rows.map((r) => ({
      id: r.id,
      at: new Date(r.at).toISOString(),
      action: r.action,
      actor: r.actor_id ? { id: r.actor_id, displayName: r.actor_name } : null,
      source: r.source,
      details: r.details,
    }));

    res.json({ data: events });
  } catch (err) {
    next(err);
  }
});
