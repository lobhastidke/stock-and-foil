/**
 * api/types.ts
 *
 * All types are copied EXACTLY from docs/AGENTS.md §2, §4, §5.
 * Do NOT add fields. Do NOT change enum strings.
 * If the contract changes, update this file and tell Members 2 + 3.
 */

// =====================================================================
// §2  COMMON ENUMS
// =====================================================================

export type Role = 'SUPPLIER' | 'BUYER' | 'FINANCIER';

export type InvoiceStatus =
  | 'DRAFT'
  | 'PENDING_ACK'
  | 'ACKNOWLEDGED'
  | 'REJECTED'
  | 'AVAILABLE'
  | 'PLEDGED'
  | 'SETTLED';

export type AckDecision = 'ACKNOWLEDGE' | 'REJECT';

export type PledgeStatus =
  | 'REQUESTED'
  | 'REGISTERED'
  | 'REJECTED_DUPLICATE'
  | 'FAILED'
  | 'SETTLED';

export type ChainStatus = 'LOCAL_ONLY' | 'PENDING' | 'CONFIRMED' | 'FAILED';

export type ChainMode = 'MOCK' | 'HARDHAT' | 'MST_TESTNET';

export type OnChainState =
  | 'NONE'
  | 'REGISTERED'
  | 'ACKNOWLEDGED'
  | 'REJECTED'
  | 'PLEDGED'
  | 'SETTLED';

// =====================================================================
// §5  API ERROR CODES
// =====================================================================

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_TRANSITION'
  | 'DUPLICATE_PLEDGE'
  | 'COMMITMENT_MISMATCH'
  | 'RATE_LIMITED'
  | 'CHAIN_UNAVAILABLE'
  | 'INTERNAL_ERROR';

// =====================================================================
// §5  SHAPES  (camelCase per the contract)
// =====================================================================

/** Full user object returned by auth endpoints. */
export interface User {
  id: string;          // UUID
  email: string;
  displayName: string;
  organisation: string;
  role: Role;
  createdAt: string;   // ISO-8601 UTC
}

/** Compact buyer shape returned by GET /users/buyers. */
export interface BuyerSummary {
  id: string;
  displayName: string;
  organisation: string;
}

/** Acknowledgement sub-object nested inside Invoice. */
export interface AcknowledgementInfo {
  decision: AckDecision;
  reason: string | null;
  createdAt: string;
  chainStatus: ChainStatus;
  txHash: string | null;
}

/** Chain registration sub-object nested inside Invoice. */
export interface RegistrationInfo {
  chainStatus: ChainStatus;
  chainMode: ChainMode;
  txHash: string | null;
}

/**
 * Pledge summary on the invoice — deliberately opaque (hides financier
 * identity from buyers and suppliers).
 */
export interface PledgeSummary {
  pledged: true;
}

/** Full invoice object as returned by the API. */
export interface Invoice {
  id: string;
  invoiceNumber: string;
  supplier: { id: string; displayName: string };
  buyer: { id: string; displayName: string };
  /** String of digits, no floats. INR 5,000.00 = "500000". */
  amountMinorUnits: string;
  currency: string;         // ISO-4217 uppercase e.g. "INR"
  issueDate: string;        // YYYY-MM-DD
  dueDate: string;          // YYYY-MM-DD
  commitment: string | null; // "0x" + 64 hex, or null before /commit
  status: InvoiceStatus;
  hasDocument: boolean;
  acknowledgement: AcknowledgementInfo | null;
  registration: RegistrationInfo;
  pledgeSummary: PledgeSummary | null;
  createdAt: string;
  updatedAt: string;
}

/** Full pledge object. */
export interface Pledge {
  id: string;
  invoiceId: string;
  commitment: string;
  pledgeMarker: string;
  financierId: string;
  /** String of digits. */
  advanceMinorUnits: string;
  note: string | null;
  status: PledgeStatus;
  createdAt: string;
  blockchainTxHash: string | null;
  blockchainStatus: ChainStatus;
  chainMode: ChainMode;
}

/** Single entry in the append-only audit log. */
export interface AuditEvent {
  id: number;
  at: string; // ISO-8601
  action: string;
  actor: { id: string; displayName: string } | null;
  source: 'LOCAL' | 'CHAIN';
  details: Record<string, unknown>;
}

/** Document metadata returned after upload. */
export interface DocumentInfo {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

/** GET /system/status response. */
export interface SystemStatus {
  chainMode: ChainMode;
  chainConfigured: boolean;
  contractAddress: string | null;
  chainId: string | null;
}

/** GET /pledge-markers/:marker response. */
export interface PledgeMarkerInfo {
  marker: string;
  used: boolean;
  status: PledgeStatus | null;
}

/** Paginated invoice list from GET /invoices. */
export interface PaginatedInvoices {
  items: Invoice[];
  page: number;
  pageSize: number;
  total: number;
}

// =====================================================================
// §2  ALLOWED STATUS TRANSITIONS  (for UI action gating only)
// The backend enforces; the UI mirrors to hide irrelevant buttons.
// =====================================================================

/** Actions the SUPPLIER may take on an invoice in a given status. */
export const SUPPLIER_ACTIONS: Partial<Record<InvoiceStatus, readonly string[]>> = {
  DRAFT: ['edit', 'upload_document', 'commit'],
  ACKNOWLEDGED: ['release'],
};

/** Actions the BUYER may take. */
export const BUYER_ACTIONS: Partial<Record<InvoiceStatus, readonly string[]>> = {
  PENDING_ACK: ['acknowledge', 'reject'],
};

/** Actions the FINANCIER may take. */
export const FINANCIER_ACTIONS: Partial<Record<InvoiceStatus, readonly string[]>> = {
  AVAILABLE: ['pledge'],
  PLEDGED: ['settle'],
};
