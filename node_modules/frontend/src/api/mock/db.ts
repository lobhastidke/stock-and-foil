/**
 * api/mock/db.ts
 *
 * In-memory "database" for the mock layer.
 * This is the ONLY state store for the mock — no localStorage, no indexedDB.
 * Resetting the page resets all data (which is intentional for demos).
 */

import type {
  User,
  Invoice,
  Pledge,
  AuditEvent,
  InvoiceStatus,
  ChainStatus,
} from '../types.js';

// -----------------------------------------------------------------------
// Internal document store (not returned to clients as-is)
// -----------------------------------------------------------------------
export interface StoredDocument {
  filename: string;
  mimeType: string;
  contentBase64: string; // raw base-64, no data-URI prefix
  sizeBytes: number;
  sha256: string;       // mock: just a hex string we compute
}

// -----------------------------------------------------------------------
// DB shape
// -----------------------------------------------------------------------
export interface MockDb {
  users: User[];
  /** Plain-text passwords (MOCK ONLY — never do this in a real system). */
  passwords: Map<string, string>;
  invoices: Invoice[];
  documents: Map<string, StoredDocument>; // key: invoiceId
  pledges: Pledge[];
  auditEvents: AuditEvent[];
  /** Pledge markers already used → duplicate prevention. */
  usedPledgeMarkers: Set<string>;
  /** Currently logged-in user (simulates the httpOnly cookie session). */
  currentSession: User | null;
}

// -----------------------------------------------------------------------
// ID + timestamp helpers
// -----------------------------------------------------------------------
export function uuid(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}

let auditSeq = 1;
export function nextAuditId(): number {
  return auditSeq++;
}

// -----------------------------------------------------------------------
// Deterministic "hash" for mock use only
// NOT cryptographically secure — purely for generating stable hex strings.
// -----------------------------------------------------------------------
export function mockHash(input: string): string {
  let h = 0x6b63_9420;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 0x9e37_79b9);
    h = (h ^ (h >>> 16)) >>> 0;
  }
  // Expand 32-bit hash → 64 hex chars (same length as keccak256 output)
  const base = (h >>> 0).toString(16).padStart(8, '0');
  // Vary each segment so it looks different (use unsigned >>> 0)
  const segs = [
    base,
    ((h ^ 0xdeadbeef) >>> 0).toString(16).padStart(8, '0'),
    ((h ^ 0xcafe1234) >>> 0).toString(16).padStart(8, '0'),
    ((h ^ 0xabcd1234) >>> 0).toString(16).padStart(8, '0'),
    ((h ^ 0x12345678) >>> 0).toString(16).padStart(8, '0'),
    ((h ^ 0xfeedf00d) >>> 0).toString(16).padStart(8, '0'),
    ((h ^ 0xbabe5678) >>> 0).toString(16).padStart(8, '0'),
    ((h ^ 0x87654321) >>> 0).toString(16).padStart(8, '0'),
  ];
  return segs.join('').slice(0, 64);
}

export function mockCommitment(seed: string): string {
  return '0x' + mockHash('commitment:' + seed);
}

export function mockPledgeMarker(commitment: string): string {
  return '0x' + mockHash('STOCKFOIL_PLEDGE_V1' + commitment);
}

/** Simple mock SHA-256 for document sha256 field. */
export function mockSha256(input: string): string {
  return mockHash('sha256:' + input);
}

// -----------------------------------------------------------------------
// Seed data: three demo users with known passwords
// -----------------------------------------------------------------------
const SEED_SUPPLIER_ID = uuid();
const SEED_BUYER_ID = uuid();
const SEED_FINANCIER_ID = uuid();

const seedNow = now();

export const SEED_USERS: User[] = [
  {
    id: SEED_SUPPLIER_ID,
    email: 'supplier@demo.com',
    displayName: 'Priya Sharma',
    organisation: 'ShopKart Exports Pvt. Ltd.',
    role: 'SUPPLIER',
    createdAt: seedNow,
  },
  {
    id: SEED_BUYER_ID,
    email: 'buyer@demo.com',
    displayName: 'Rohan Mehta',
    organisation: 'MegaMart India Pvt. Ltd.',
    role: 'BUYER',
    createdAt: seedNow,
  },
  {
    id: SEED_FINANCIER_ID,
    email: 'financier@demo.com',
    displayName: 'Anita Kapoor',
    organisation: 'QuickFin Capital',
    role: 'FINANCIER',
    createdAt: seedNow,
  },
];

const SEED_PASSWORDS: [string, string][] = [
  ['supplier@demo.com', 'password1234'],
  ['buyer@demo.com', 'password1234'],
  ['financier@demo.com', 'password1234'],
];

// -----------------------------------------------------------------------
// Seed invoice for demo purposes
// -----------------------------------------------------------------------
function makeSeedInvoice(): Invoice {
  const id = uuid();
  return {
    id,
    invoiceNumber: 'INV-2025-001',
    supplier: { id: SEED_SUPPLIER_ID, displayName: 'Priya Sharma' },
    buyer: { id: SEED_BUYER_ID, displayName: 'Rohan Mehta' },
    amountMinorUnits: '250000', // ₹2,500.00
    currency: 'INR',
    issueDate: '2025-01-15',
    dueDate: '2025-02-15',
    commitment: null,
    status: 'DRAFT' as InvoiceStatus,
    hasDocument: false,
    acknowledgement: null,
    registration: { chainStatus: 'LOCAL_ONLY' as ChainStatus, chainMode: 'MOCK', txHash: null },
    pledgeSummary: null,
    createdAt: seedNow,
    updatedAt: seedNow,
  };
}

// -----------------------------------------------------------------------
// Factory — creates a fresh DB (used on first load and in tests)
// -----------------------------------------------------------------------
export function createDb(): MockDb {
  return {
    users: [...SEED_USERS],
    passwords: new Map(SEED_PASSWORDS),
    invoices: [makeSeedInvoice()],
    documents: new Map(),
    pledges: [],
    auditEvents: [],
    usedPledgeMarkers: new Set(),
    currentSession: null,
  };
}

/** The singleton mock DB. Cleared between Vitest tests via resetDb(). */
export const db: MockDb = createDb();

/** Reset to initial seed state (used in tests). */
export function resetDb(): void {
  const fresh = createDb();
  db.users = fresh.users;
  db.passwords = fresh.passwords;
  db.invoices = fresh.invoices;
  db.documents = fresh.documents;
  db.pledges = fresh.pledges;
  db.auditEvents = fresh.auditEvents;
  db.usedPledgeMarkers = fresh.usedPledgeMarkers;
  db.currentSession = null;
  auditSeq = 1;
}
