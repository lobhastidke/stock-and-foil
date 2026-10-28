/**
 * api/endpoints.ts
 *
 * One typed function per endpoint from docs/AGENTS.md §5.
 * Each function name mirrors the HTTP verb + resource name.
 * NEVER invent endpoints not in the contract.
 */

import { api } from './client.js';
import type {
  User,
  BuyerSummary,
  Invoice,
  PaginatedInvoices,
  Pledge,
  AuditEvent,
  DocumentInfo,
  SystemStatus,
  PledgeMarkerInfo,
  InvoiceStatus,
  AckDecision,
} from './types.js';

// =====================================================================
// Auth & Users
// =====================================================================

export function register(body: {
  email: string;
  password: string;
  displayName: string;
  organisation: string;
  role: string;
}) {
  return api.post<{ user: User }>('/auth/register', body);
}

export function login(body: { email: string; password: string }) {
  return api.post<{ user: User }>('/auth/login', body);
}

export function logout() {
  return api.post<{ ok: boolean }>('/auth/logout', {});
}

export function getMe() {
  return api.get<{ user: User }>('/auth/me');
}

/** Returns all buyers — used in the "Assign buyer" dropdown when creating an invoice. */
export function getBuyers() {
  return api.get<BuyerSummary[]>('/users/buyers');
}

// =====================================================================
// Invoices
// =====================================================================

export function createInvoice(body: {
  invoiceNumber: string;
  buyerId: string;
  /** String of digits, no floats. E.g. "500000" for ₹5,000.00. */
  amountMinorUnits: string;
  currency: string;
  issueDate: string;   // YYYY-MM-DD
  dueDate: string;     // YYYY-MM-DD
}) {
  return api.post<{ invoice: Invoice }>('/invoices', body);
}

export function listInvoices(params?: {
  status?: InvoiceStatus;
  page?: number;
  pageSize?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.status != null) qs.set('status', params.status);
  if (params?.page != null) qs.set('page', String(params.page));
  if (params?.pageSize != null) qs.set('pageSize', String(params.pageSize));
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return api.get<PaginatedInvoices>(`/invoices${query}`);
}

export function getInvoice(id: string) {
  return api.get<{ invoice: Invoice }>(`/invoices/${id}`);
}

/** Partial update — only allowed when invoice is DRAFT (server enforces). */
export function updateInvoice(
  id: string,
  body: Partial<{
    invoiceNumber: string;
    buyerId: string;
    amountMinorUnits: string;
    currency: string;
    issueDate: string;
    dueDate: string;
  }>,
) {
  return api.patch<{ invoice: Invoice }>(`/invoices/${id}`, body);
}

/** Upload supporting document (≤3 MB, pdf/png/jpg). */
export function uploadDocument(
  id: string,
  body: {
    filename: string;
    mimeType: string;
    /** Raw base-64 encoded file content. No data-URI prefix. */
    contentBase64: string;
  },
) {
  return api.post<{ document: DocumentInfo }>(`/invoices/${id}/document`, body);
}

/**
 * Returns the URL to open/download the document for an invoice.
 * Use window.open() or an <a> tag with this URL — do NOT use the JSON wrapper.
 * Auth cookie is sent automatically (credentials: 'include' is browser default
 * for same-origin navigation).
 */
export function documentUrl(invoiceId: string): string {
  const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/v1';
  return `${base}/invoices/${invoiceId}/document`;
}

/** DRAFT → PENDING_ACK. Generates salt + commitment. */
export function commitInvoice(id: string) {
  return api.post<{ invoice: Invoice }>(`/invoices/${id}/commit`, {});
}

/** Recomputes the commitment server-side and confirms it matches. */
export function verifyCommitment(id: string) {
  return api.post<{ valid: boolean; commitment: string }>(
    `/invoices/${id}/verify-commitment`,
    {},
  );
}

/** Buyer submits ACKNOWLEDGE or REJECT. */
export function submitAcknowledgement(
  id: string,
  body: { decision: AckDecision; reason?: string },
) {
  return api.post<{ acknowledgement: AcknowledgementInfo; invoice: Invoice }>(
    `/invoices/${id}/acknowledgement`,
    body,
  );
}

/** ACKNOWLEDGED → AVAILABLE (supplier releases for financing). */
export function releaseInvoice(id: string) {
  return api.post<{ invoice: Invoice }>(`/invoices/${id}/release`, {});
}

/** PLEDGED → SETTLED (financier who owns the pledge calls this). */
export function settleInvoice(id: string) {
  return api.post<{ invoice: Invoice }>(`/invoices/${id}/settle`, {});
}

// =====================================================================
// Pledges
// =====================================================================

export function createPledge(
  invoiceId: string,
  body: { advanceMinorUnits: string; note?: string },
) {
  return api.post<{ pledge: Pledge }>(`/invoices/${invoiceId}/pledges`, body);
}

export function listInvoicePledges(invoiceId: string) {
  return api.get<Pledge[]>(`/invoices/${invoiceId}/pledges`);
}

export function getPledge(id: string) {
  return api.get<{ pledge: Pledge }>(`/pledges/${id}`);
}

/**
 * Check whether a pledge marker has been used.
 * Useful after a 409 DUPLICATE_PLEDGE — the error details include the marker.
 */
export function getPledgeMarker(marker: string) {
  return api.get<PledgeMarkerInfo>(`/pledge-markers/${marker}`);
}

/** List all pledges belonging to the current financier. */
export function listMyPledges() {
  return api.get<{ items: Pledge[] }>('/pledges');
}

// =====================================================================
// Audit & System
// =====================================================================

export function getAuditEvents(invoiceId: string) {
  return api.get<AuditEvent[]>(`/invoices/${invoiceId}/audit`);
}

export function getSystemStatus() {
  return api.get<SystemStatus>('/system/status');
}

export function getHealth() {
  return api.get<{ ok: boolean }>('/health');
}

// -----------------------------------------------------------------------
// Private type used only in this file for the ack response shape
// -----------------------------------------------------------------------
interface AcknowledgementInfo {
  decision: AckDecision;
  reason: string | null;
  createdAt: string;
  chainStatus: string;
  txHash: string | null;
}
