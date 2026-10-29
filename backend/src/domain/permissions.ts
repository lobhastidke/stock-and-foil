import { InvoiceStatus } from './invoiceStateMachine.js';

export type Role = 'SUPPLIER' | 'BUYER' | 'FINANCIER';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  organisation: string;
  role: Role;
}

export interface InvoiceContext {
  id: string;
  supplierId: string;
  buyerId: string;
  status: InvoiceStatus;
}

export interface PledgeContext {
  id: string;
  financierId: string;
  status: string;
}

/**
 * Authorization Matrix Rules:
 * - SUPPLIER: sees and modifies only their own invoices.
 * - BUYER: sees only assigned invoices, and NEVER in DRAFT status. Can acknowledge/reject in PENDING_ACK.
 * - FINANCIER: sees only AVAILABLE, PLEDGED, or SETTLED invoices. Never sees attached documents.
 *   Cannot see other financiers' pledge identities. Can pledge on AVAILABLE; can settle their own pledged invoices.
 */

export function canViewInvoice(user: AuthUser, invoice: InvoiceContext): boolean {
  if (user.role === 'SUPPLIER') {
    return invoice.supplierId === user.id;
  }
  if (user.role === 'BUYER') {
    return invoice.buyerId === user.id && invoice.status !== 'DRAFT';
  }
  if (user.role === 'FINANCIER') {
    return ['AVAILABLE', 'PLEDGED', 'SETTLED'].includes(invoice.status);
  }
  return false;
}

export function canModifyInvoice(user: AuthUser, invoice: InvoiceContext): boolean {
  return user.role === 'SUPPLIER' && invoice.supplierId === user.id;
}

export function canViewDocument(user: AuthUser, invoice: InvoiceContext): boolean {
  if (user.role === 'SUPPLIER') {
    return invoice.supplierId === user.id;
  }
  if (user.role === 'BUYER') {
    return invoice.buyerId === user.id && invoice.status !== 'DRAFT';
  }
  // Financier is NEVER permitted to download or view confidential invoice documents
  return false;
}

export function canUploadDocument(user: AuthUser, invoice: InvoiceContext): boolean {
  return user.role === 'SUPPLIER' && invoice.supplierId === user.id && invoice.status === 'DRAFT';
}

export function canCommitInvoice(user: AuthUser, invoice: InvoiceContext): boolean {
  return user.role === 'SUPPLIER' && invoice.supplierId === user.id && invoice.status === 'DRAFT';
}

export function canAcknowledge(user: AuthUser, invoice: InvoiceContext): boolean {
  return user.role === 'BUYER' && invoice.buyerId === user.id && invoice.status === 'PENDING_ACK';
}

export function canRelease(user: AuthUser, invoice: InvoiceContext): boolean {
  return user.role === 'SUPPLIER' && invoice.supplierId === user.id && invoice.status === 'ACKNOWLEDGED';
}

export function canPledge(user: AuthUser, invoice: InvoiceContext): boolean {
  return user.role === 'FINANCIER' && invoice.status === 'AVAILABLE';
}

export function canSettle(user: AuthUser, invoice: InvoiceContext, pledge?: PledgeContext): boolean {
  if (user.role !== 'FINANCIER' || invoice.status !== 'PLEDGED') {
    return false;
  }
  if (pledge) {
    return pledge.financierId === user.id;
  }
  return true;
}

/**
 * Filter invoice payload sent to client based on requester role.
 * Financier view hides document availability and other financiers' details.
 */
export function sanitizeInvoiceResponse<T extends Record<string, any>>(
  invoice: T,
  user: AuthUser,
  pledgeFinancierId?: string | null
): T {
  const sanitized = { ...invoice };

  if (user.role === 'FINANCIER') {
    delete sanitized.saltEnc;
    sanitized.hasDocument = false; // Hide confidential document existence
    if (sanitized.status === 'PLEDGED' || sanitized.status === 'SETTLED') {
      const isMyPledge = pledgeFinancierId === user.id;
      if (!isMyPledge) {
        // Obscure identity of other pledging financiers
        sanitized.pledgeSummary = { pledged: true };
      }
    }
  }

  return sanitized;
}
