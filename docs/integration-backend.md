# Stock & Foil — Backend Integration Documentation (`docs/integration-backend.md`)

**Owner:** Member 2 (Backend + Database + Cryptography Developer)  
**Branch:** `feature/backend`  
**Contract Version:** v1 (`docs/CONTRACT.md`)  
**Base Path:** `/api/v1`

---

## 1. What is Built

The backend for **Stock & Foil** ("Finance the invoice. Not the fraud.") is a production-grade, serverless-ready TypeScript Express API enforcing the data model, cryptographic commitment scheme, invoice lifecycle, and double-pledge prevention registry for MST Blockchain Buildathon #2.

### Core Modules & Deliverables

1. **Authentication & Session (`backend/src/auth/`)**
   - Pure-JavaScript `bcryptjs` password hashing with 12 salt rounds (guaranteeing 100% serverless portability without native build headaches).
   - 12-hour signed JWT stored in an `httpOnly`, `SameSite=Strict`, `Secure` (in production) cookie named `sf_session`.
   - Generic login errors preventing user enumeration.
   - CSRF protection: every mutation (`POST`, `PATCH`, `DELETE`) requires `X-SF-CSRF: 1` and `Content-Type: application/json` headers (returns `403 FORBIDDEN` otherwise).
   - Rate limiting on `/auth/login` and `/auth/register` (max 20 requests per 15 min).

2. **Dual-Database Layer & Migrations (`backend/src/db/`)**
   - Plain SQL idempotent migration `001_init.sql` (no heavy ORM).
   - Seamless dual-mode: in-process `@electric-sql/pglite` (WebAssembly Postgres) for local development and zero-setup CI/CD testing; standard `pg.Pool` when `DATABASE_URL` is set in production.
   - Append-only DB triggers preventing `UPDATE` and `DELETE` on `audit_events` and `acknowledgements`.

3. **Deterministic Cryptographic Commitment Suite (`backend/src/crypto/`)**
   - RFC 8785 canonical JSON serializer: sorted keys, no whitespace, Unicode NFC normalized, strings trimmed, base-10 minor units strings (`"500000"` for INR 5,000.00).
   - `commitment = keccak256( salt_bytes32 || utf8(canonicalJson) )`. We use `keccak256` because it matches the EVM native hashing opcode used by Member 3, eliminating cross-domain translation bugs.
   - Deterministic `pledgeMarker = keccak256( abi.encodePacked("STOCKFOIL_PLEDGE_V1", commitment) )`.
   - Opaque on-chain user references: `userRef = keccak256(utf8("STOCKFOIL_USER_V1:" + userId))`.
   - Confidentiality at rest: 32-byte salts (`salt_enc`) and documents (`content_enc`) encrypted with AES-256-GCM using `DOC_ENCRYPTION_KEY`. Salts are never logged and never exposed via the API.
   - Shared test vectors file: `docs/commitment-vectors.json` (5 verified vectors).

4. **Invoice State Machine & Authorisation Matrix (`backend/src/domain/`)**
   - `invoiceStateMachine.ts` is the single source of truth for allowed transitions:
     - `DRAFT -> PENDING_ACK` (Supplier calls `/commit`)
     - `PENDING_ACK -> ACKNOWLEDGED` (Assigned Buyer acknowledges)
     - `PENDING_ACK -> REJECTED` (Assigned Buyer rejects with required reason)
     - `ACKNOWLEDGED -> AVAILABLE` (Supplier releases for financing)
     - `AVAILABLE -> PLEDGED` (Financier pledge succeeds)
     - `PLEDGED -> SETTLED` (Pledging Financier settles)
     - Any illegal move throws `409 INVALID_TRANSITION`.
   - Authorisation matrix:
     - Suppliers only see and modify their own invoices.
     - Buyers only see assigned invoices, and **never in DRAFT**.
     - Financiers see only `AVAILABLE` and `PLEDGED` invoices; confidential documents are hidden; identities of other pledging financiers are obscured.

5. **Atomic Pledge & Double-Financing Prevention (`backend/src/services/pledges.ts`)**
   - Atomic database transaction: locks invoice row (`SELECT ... FOR UPDATE`), checks `status = 'AVAILABLE'`, computes `pledgeMarker`, inserts into `pledges` as `REQUESTED`, and creates a pending `chain_txs` record.
   - Partial unique index:
     ```sql
     CREATE UNIQUE INDEX idx_pledges_pledge_marker 
     ON pledges(pledge_marker) 
     WHERE status IN ('REQUESTED', 'REGISTERED', 'SETTLED');
     ```
   - Concurrent race attempts strictly fail with `409 DUPLICATE_PLEDGE`, write an audit event `PLEDGE_DUPLICATE_REJECTED`, and return the conflicting `pledgeMarker`.

6. **Append-Only Tamper-Evident Audit Chain (`backend/src/services/audit.ts`)**
   - Audit hash chain: `event_hash = keccak256( prev_hash || canonical(event) )`.
   - `verifyAuditChain()` scans all records to detect any modification or forgery.

7. **Reconciliation & Serverless Function Entry (`backend/src/services/reconcile.ts` & `api/index.ts`)**
   - `POST /internal/reconcile` protected by constant-time `CRON_SECRET` comparison. Resolves pending chain transactions.
   - Root `api/index.ts` exports the Express app for Vercel Serverless Functions with zero disk writes.

---

## 2. How to Run Locally

### Prerequisites
- Node.js >= 20
- npm >= 9

### Setup & Run
From the repository root:
```bash
# 1. Install all dependencies (frontend, backend, chain)
npm install

# 2. Seed synthetic demo users (Alice Supplier, Bob Buyer, Charlie Financier)
npm run seed -w backend

# 3. Start local backend API server on http://localhost:3001
npm run dev -w backend
```

The server automatically runs migrations on startup using in-process PGlite (no external PostgreSQL server or Docker needed!).

### Demo User Accounts
| Role | Email | Password | Organisation |
| :--- | :--- | :--- | :--- |
| **Supplier** | `supplier@demo.com` | `password1234` | Acme Components Ltd |
| **Buyer** | `buyer@demo.com` | `password1234` | Global Retail Corp |
| **Financier** | `financier@demo.com` | `password1234` | Alpha Capital Finance |

---

## 3. How to Test

Run the full automated test suite with Vitest:
```bash
npm run test -w backend
```

### Test Coverage Summary:
- `crypto.test.ts`: Canonical JSON RFC 8785, Unicode NFC normalization, zero leading zeros, test vectors file, tampering detection, AES-256-GCM encryption.
- `auth.test.ts`: Registration, bcrypt hashing, cookie session, user enumeration prevention, CSRF header enforcement, logout.
- `invoices.test.ts`: Complete authorization matrix across all roles, illegal lifecycle transitions, document upload magic bytes sniffing, commitment verification.
- `pledges.test.ts`: Atomic locking, duplicate pledge rejection, marker queries, settlement, concurrent race conditions (firing N simultaneous requests).
- `audit.test.ts`: Tamper-evident hash chain verification, secret stripping, DB append-only trigger immutability.
- `reconcile.test.ts`: Constant-time `CRON_SECRET` authentication, settling pending chain transactions.

---

## 4. Notes for Other Members

### For Member 1 (Frontend)
- The backend serves API routes under `/api/v1`.
- In `frontend/.env`, set:
  ```ini
  VITE_USE_MOCK=false
  VITE_API_BASE=/api/v1
  ```
- Vite proxies `/api` requests to port `3001` in development.
- Ensure all mutations (`POST`, `PATCH`, `DELETE`) pass header `X-SF-CSRF: 1` and `Content-Type: application/json`.
- When catching double-financing errors, check `error.code === 'DUPLICATE_PLEDGE'` and inspect `error.details.pledgeMarker`.

### For Member 3 (Solidity Contracts & Chain Adapter)
- The backend imports the chain exclusively through the `ChainAdapter` interface specified in Block A section 6.
- The shared test vectors file `docs/commitment-vectors.json` defines 5 canonical inputs, salts, commitments, pledge markers, and user references. Member 3's Hardhat tests must verify that the smart contract functions produce identical values!
- Commitments are 32 bytes (`bytes32`). Markers are `keccak256(abi.encodePacked("STOCKFOIL_PLEDGE_V1", commitment))`.

---

## 5. Vercel Serverless Deployment & Cron Configuration

### Vercel Environment Variables
Configure the following in the Vercel Project Settings:
- `NODE_ENV`: `production`
- `DATABASE_URL`: Connection string to a hosted PostgreSQL instance (e.g. Neon, AWS RDS, Supabase Postgres).
- `JWT_SECRET`: Random 64-hex string for signing session JWTs.
- `DOC_ENCRYPTION_KEY`: Exactly 64 hex characters (32 bytes) for AES-256-GCM encryption.
- `CRON_SECRET`: Random secret string for authenticating reconciliation cron jobs.
- `CHAIN_MODE`: `MOCK` (or `MST_TESTNET` once verified).

### Proposed `vercel.json` Cron Configuration
The shared root `vercel.json` should include the cron trigger for background reconciliation every 5 minutes:
```json
{
  "crons": [
    {
      "path": "/api/v1/internal/reconcile",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

---

## 6. Honest Limits (Must Never Be Contradicted)
1. **Duplicate prevention works strictly WITHIN the Stock & Foil registry**, not across independent platforms.
2. A hash, commitment, or acknowledgement **does NOT guarantee invoice authenticity, physical delivery, or legal enforceability**.
3. Demo authentication is **NOT real identity verification (no KYC)**.
4. Funding is **simulated**; no real fiat or bank transfers occur.
5. ZK proofs are a future roadmap enhancement; they are **not claimed for the MVP**.
6. Local and mock records are **never labeled "on-chain"**.
