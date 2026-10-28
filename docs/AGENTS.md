=====================================================================
STOCK & FOIL: SHARED PROJECT CONTEXT + INTEGRATION CONTRACT (v1)
=====================================================================

PROJECT
Stock & Foil ("Finance the invoice. Not the fraud.") is a privacy-preserving
receivables-financing registry for the MST Blockchain Buildathon #2.
Suppliers register invoice commitments, buyers acknowledge them, financiers
record financing pledges. The registry rejects a second pledge on the same
commitment. Confidential invoice data stays off-chain; the chain stores only
commitments, markers, opaque refs and states.

THREE ROLES in the app: SUPPLIER, BUYER, FINANCIER.
THREE DEVELOPERS: Member 1 = frontend, Member 2 = backend + crypto + DB,
Member 3 = Solidity contracts + chain adapter + MST integration.
Each works in their own Antigravity conversation. Do not invent anything that
conflicts with this contract. If you think it must change, STOP and tell your
human (see "Changing the contract").

HONEST LIMITS (must appear in UI copy and docs, never contradicted)
- Duplicate prevention works only WITHIN the Stock & Foil registry, not across
  independent platforms.
- A hash, an acknowledgement, or a proof does not guarantee invoice
  authenticity, payment, or legal enforceability.
- Demo auth is NOT real identity verification (no KYC).
- Funding is simulated. No real loans or bank transfers. Synthetic data only.
- ZK proofs are a FUTURE enhancement. Do not build or claim them for the MVP.
- Local/mock records are never labelled "on-chain".

HARD RULES
- No external application APIs or hosted AI/auth/storage/RPC-as-a-service
  dependencies (no Gemini, OpenAI, Firebase, Supabase, Pinata, Alchemy,
  Infura, Moralis, Google login, etc.). Open-source libraries only.
  Single exception: Vercel hosting and a Postgres DATABASE_URL in production.
- Local-first: everything works locally with NO deployed contract and NO MST
  access. MST is integrated last.
- Never invent MST RPC URLs, chain IDs, explorer URLs, faucet URLs or deploy
  steps. Verify them in MST's official documentation at integration time.
- Never commit secrets. Never put private keys in frontend code, logs, Git or
  screenshots. Provide .env.example only.
- Keep dependencies minimal. Explain code in simple language (student
  project). Prefer a working, secure MVP over cleverness.

---------------------------------------------------------------------
1. REPO LAYOUT (npm workspaces, one Vercel project)
---------------------------------------------------------------------
stock-and-foil/
  package.json        (workspaces: frontend, backend, chain, contracts)
  vercel.json
  api/index.ts        (Vercel entry: exports the Express app from backend)
  frontend/           OWNER: Member 1   (React + TS + Vite)
  backend/            OWNER: Member 2   (Node + TS + Express, SQL migrations)
  chain/              OWNER: Member 3   (package @stockfoil/chain: ChainAdapter
                                         interface, MockAdapter, EvmAdapter)
  contracts/          OWNER: Member 3   (Hardhat + Solidity + tests + deploy)
  docs/               SHARED: CONTRACT.md (this block), ARCHITECTURE.md,
                      API.md (owner Member 2), CHAIN.md (owner Member 3),
                      DEMO.md, integration notes
  README.md  .gitignore  .env.example  AGENTS.md
Rule: only the owner edits their folder. Shared files change only via PR that
all three approve.

---------------------------------------------------------------------
2. COMMON ENUMS (identical strings in DB, API, frontend, adapter)
---------------------------------------------------------------------
Role:            SUPPLIER | BUYER | FINANCIER
InvoiceStatus:   DRAFT | PENDING_ACK | ACKNOWLEDGED | REJECTED | AVAILABLE
                 | PLEDGED | SETTLED
AckDecision:     ACKNOWLEDGE | REJECT
PledgeStatus:    REQUESTED | REGISTERED | REJECTED_DUPLICATE | FAILED | SETTLED
ChainStatus:     LOCAL_ONLY | PENDING | CONFIRMED | FAILED
ChainMode:       MOCK | HARDHAT | MST_TESTNET
OnChainState:    NONE | REGISTERED | ACKNOWLEDGED | REJECTED | PLEDGED | SETTLED

Allowed InvoiceStatus transitions (nothing else is legal):
  DRAFT        -> PENDING_ACK     (supplier calls /commit)
  PENDING_ACK  -> ACKNOWLEDGED    (assigned buyer, ACKNOWLEDGE)
  PENDING_ACK  -> REJECTED        (assigned buyer, REJECT)
  ACKNOWLEDGED -> AVAILABLE       (supplier calls /release)
  AVAILABLE    -> PLEDGED         (financier, pledge succeeds)
  PLEDGED      -> SETTLED         (financier calls /settle)
  REJECTED is terminal. SETTLED is terminal.
Editing invoice fields is allowed only in DRAFT.

Invoice status vs on-chain state:
  DRAFT -> NONE | PENDING_ACK -> REGISTERED | ACKNOWLEDGED -> ACKNOWLEDGED
  REJECTED -> REJECTED | AVAILABLE -> ACKNOWLEDGED (no chain call)
  PLEDGED -> PLEDGED | SETTLED -> SETTLED

---------------------------------------------------------------------
3. COMMITMENT SCHEME (same for local MVP and on-chain: keccak256 only)
---------------------------------------------------------------------
Committed fields (v1): invoiceNumber, supplierId, buyerId,
  amountMinorUnits, currency, issueDate, dueDate.
Canonical form: JSON with keys sorted alphabetically, no whitespace, plus
  "v":1. Strings trimmed and Unicode NFC-normalised. invoiceNumber kept
  case-sensitive. currency uppercase ISO-4217 (e.g. "INR"). amountMinorUnits is
  a base-10 integer STRING without leading zeros (INR 5,000.00 = "500000").
  Dates are "YYYY-MM-DD". Ids are the lowercase UUID strings.
salt:       32 random bytes (crypto.randomBytes), hex "0x..." (bytes32).
commitment = keccak256( salt_bytes32 || utf8(canonicalJson) )   -> 0x + 64 hex
pledgeMarker = keccak256( abi.encodePacked("STOCKFOIL_PLEDGE_V1", commitment) )
  (domain string is UTF-8 bytes, no padding. One marker per commitment, so one
  pledge per commitment.)
supplierRef / buyerRef / financierRef (on-chain) =
  keccak256(utf8("STOCKFOIL_USER_V1:" + userId))   (opaque, no PII on-chain)
The salt is returned to NOBODY via the API. It is stored encrypted (AES-256-GCM,
key DOC_ENCRYPTION_KEY). Never log it. Never hash only invoice number/amount.
A shared test vector file docs/commitment-vectors.json (Member 2 creates,
Member 3 verifies the contract/adapter produce identical marker values).

On-chain (public): commitment, pledgeMarker, supplierRef, buyerRef,
  financierRef, OnChainState, timestamps, events.
Off-chain only (confidential): invoice number, amount, dates, names, documents,
  salt, emails, passwords.

---------------------------------------------------------------------
4. DATA MODEL (DB tables use snake_case; API JSON uses camelCase)
---------------------------------------------------------------------
users(id uuid pk, email unique, password_hash, display_name, organisation,
      role, created_at)
invoices(id uuid pk, invoice_number, supplier_id fk, buyer_id fk,
         amount_minor_units bigint, currency char(3), issue_date date,
         due_date date, commitment text unique null, salt_enc bytea null,
         status, created_at, updated_at,
         unique(supplier_id, invoice_number))
invoice_documents(invoice_id pk fk, filename, mime_type, size_bytes,
                  content_enc bytea, sha256 text, created_at)
acknowledgements(id uuid pk, invoice_id fk, invoice_commitment, buyer_id fk,
                 decision, reason null, created_at,
                 chain_tx_id fk null)   -- one per invoice (unique invoice_id)
pledges(id uuid pk, invoice_id fk, commitment, pledge_marker, financier_id fk,
        advance_minor_units bigint, note null, status, created_at,
        updated_at, blockchain_tx_hash null, blockchain_status, chain_mode)
  -- DB duplicate protection: PARTIAL UNIQUE INDEX on pledges(pledge_marker)
  -- WHERE status IN ('REQUESTED','REGISTERED','SETTLED').
chain_txs(id uuid pk, kind, invoice_id, idempotency_key unique, status,
          tx_hash null, block_number null, error_code null,
          attempts int, created_at, updated_at)
audit_events(id bigserial pk, at timestamptz, actor_user_id null, action,
             invoice_id null, pledge_id null, source, details jsonb,
             prev_hash, event_hash)
  -- append-only: DB triggers forbid UPDATE/DELETE; hash chain
  -- event_hash = keccak256(prev_hash || canonical(event)).
  -- source is 'LOCAL' or 'CHAIN' (never mix them up).
Audit actions: INVOICE_CREATED, INVOICE_UPDATED, COMMITMENT_GENERATED,
  ACK_SUBMITTED, INVOICE_REJECTED, INVOICE_RELEASED, PLEDGE_REQUESTED,
  PLEDGE_REGISTERED, PLEDGE_DUPLICATE_REJECTED, PLEDGE_FAILED,
  INVOICE_SETTLED, CHAIN_TX_SUBMITTED, CHAIN_TX_CONFIRMED, CHAIN_TX_FAILED.

---------------------------------------------------------------------
5. HTTP API CONTRACT  (base path /api/v1, JSON only)
---------------------------------------------------------------------
Auth: httpOnly, Secure (in prod), SameSite=Strict cookie "sf_session" holding a
signed JWT (12h). Every state-changing request (POST/PATCH/DELETE) must send
headers: Content-Type: application/json  AND  X-SF-CSRF: 1 (else 403).
Success envelope:  { "data": ... }
Error envelope:    { "error": { "code": "STRING", "message": "human text",
                                 "details": optional } }
Error codes -> HTTP: VALIDATION_ERROR 400, UNAUTHENTICATED 401, FORBIDDEN 403,
  NOT_FOUND 404, CONFLICT 409, INVALID_TRANSITION 409,
  DUPLICATE_PLEDGE 409, COMMITMENT_MISMATCH 422, RATE_LIMITED 429,
  CHAIN_UNAVAILABLE 503, INTERNAL_ERROR 500.
Money in JSON: amountMinorUnits is a STRING of digits. Dates "YYYY-MM-DD".
Timestamps ISO-8601 UTC.

Auth & users
 POST /auth/register   {email,password(min 10),displayName,organisation,
                        role}                       -> {user}   (sets cookie)
 POST /auth/login      {email,password}             -> {user}   (sets cookie)
 POST /auth/logout     {}                           -> {ok:true}
 GET  /auth/me                                      -> {user}
 GET  /users/buyers                                 -> [{id,displayName,
                                                       organisation}]
   user = {id,email,displayName,organisation,role,createdAt}

Invoices (role-scoped: supplier sees own; buyer sees assigned & not DRAFT;
financier sees AVAILABLE and PLEDGED only)
 POST  /invoices       {invoiceNumber,buyerId,amountMinorUnits,currency,
                        issueDate,dueDate}          -> {invoice}   SUPPLIER
 GET   /invoices?status=&page=&pageSize=            -> {items:[invoice],
                                                        page,pageSize,total}
 GET   /invoices/:id                                -> {invoice}
 PATCH /invoices/:id   (same fields, partial, DRAFT only) -> {invoice} SUPPLIER
 POST  /invoices/:id/document {filename,mimeType,contentBase64}  SUPPLIER
        (<=3 MB; pdf/png/jpg only)                  -> {document:{filename,
                                                      mimeType,sizeBytes,sha256}}
 GET   /invoices/:id/document                       -> file bytes  SUPPLIER and
                                                       assigned BUYER only
 POST  /invoices/:id/commit {}        DRAFT -> PENDING_ACK; generates salt +
                                      commitment, registers on chain adapter
                                      (async)       -> {invoice}   SUPPLIER
 POST  /invoices/:id/verify-commitment {}           -> {valid:boolean,
                                                       commitment}  SUPPLIER
 POST  /invoices/:id/acknowledgement {decision,reason?}  BUYER (assigned)
                                                    -> {acknowledgement,invoice}
 POST  /invoices/:id/release {}   ACKNOWLEDGED -> AVAILABLE  SUPPLIER -> {invoice}
 POST  /invoices/:id/settle {}    PLEDGED -> SETTLED         FINANCIER (the
                                                       pledging one) -> {invoice}

Pledges
 POST /invoices/:id/pledges {advanceMinorUnits,note?}   FINANCIER
        -> 201 {pledge}  or 409 DUPLICATE_PLEDGE (with details.pledgeMarker)
 GET  /invoices/:id/pledges        -> [pledge]  (supplier of invoice, the
                                      pledging financier)
 GET  /pledges/:id                 -> {pledge}
 GET  /pledge-markers/:marker      -> {marker,used:boolean,
                                       status: PledgeStatus|null}  any signed-in
 GET  /pledges                     -> {items:[pledge]} mine

Audit & system
 GET  /invoices/:id/audit          -> [auditEvent]   parties to the invoice
 GET  /system/status               -> {chainMode,chainConfigured,
                                       contractAddress|null,chainId|null}
 GET  /health                      -> {ok:true}
 POST /internal/reconcile          (header Authorization: Bearer CRON_SECRET)
                                     retries/refreshes PENDING chain_txs

invoice = {id,invoiceNumber,supplier:{id,displayName},
           buyer:{id,displayName},amountMinorUnits,currency,issueDate,dueDate,
           commitment|null,status,hasDocument,
           acknowledgement|null:{decision,reason,createdAt,
                                  chainStatus,txHash|null},
           registration:{chainStatus,chainMode,txHash|null},
           pledgeSummary|null:{pledged:true}  (financier view hides who),
           createdAt,updatedAt}
pledge = {id,invoiceId,commitment,pledgeMarker,financierId,
          advanceMinorUnits,note,status,createdAt,
          blockchainTxHash|null,blockchainStatus,chainMode}
auditEvent = {id,at,action,actor:{id,displayName}|null,source,details}
The salt and password_hash are NEVER returned.

---------------------------------------------------------------------
6. CHAIN ADAPTER CONTRACT  (package @stockfoil/chain, owner Member 3)
---------------------------------------------------------------------
type Hex = `0x${string}`;
interface TxResult { status:'CONFIRMED'|'FAILED'|'PENDING'; txHash?:Hex;
  blockNumber?:number; errorCode?:'PLEDGE_MARKER_USED'|'WRONG_STATE'|
  'UNAUTHORIZED'|'NOT_FOUND'|'NETWORK'|'UNKNOWN'; }
interface ChainAdapter {
  mode(): 'MOCK'|'HARDHAT'|'MST_TESTNET';
  registerInvoice(a:{commitment:Hex;supplierRef:Hex;buyerRef:Hex}):Promise<TxResult>;
  recordAcknowledgement(a:{commitment:Hex;buyerRef:Hex;accepted:boolean}):Promise<TxResult>;
  registerPledge(a:{commitment:Hex;pledgeMarker:Hex;financierRef:Hex}):Promise<TxResult>;
  markSettled(a:{commitment:Hex;financierRef:Hex}):Promise<TxResult>;
  isPledgeMarkerUsed(marker:Hex):Promise<boolean>;
  getInvoiceState(commitment:Hex):Promise<OnChainState>;
  getTxStatus(txHash:Hex):Promise<TxResult>;
  getEvents(f?:{fromBlock?:number;commitment?:Hex}):Promise<ChainEvent[]>;
}
Factory: createChainAdapter(env) -> picks implementation from CHAIN_MODE.
MockAdapter: in-memory/DB-backed fake with the SAME rules as the contract
  (state machine + marker uniqueness). Its tx hashes are fake and MUST be
  labelled LOCAL_ONLY by the backend. Used on Vercel until MST integration.
Backend never imports ethers/contract code; it only uses this interface.

Pending / failure workflow (blockchain and DB are NOT one atomic transaction):
 1. Backend writes DB change + a chain_txs row (PENDING, idempotency_key) in
    ONE DB transaction.
 2. After commit it calls the adapter. Result updates chain_txs and
    blockchain_status (CONFIRMED / FAILED / still PENDING).
 3. If the chain succeeded but the DB update failed, or the call timed out,
    /internal/reconcile (Vercel Cron, every 5 min) uses getTxStatus /
    getInvoiceState / isPledgeMarkerUsed to settle PENDING rows.
 4. Duplicate pledge: the DB partial unique index rejects it first. If the
    chain reverts PLEDGE_MARKER_USED, pledge -> REJECTED_DUPLICATE and an audit
    event is written. Other chain failures -> FAILED (marker is freed).
 5. Idempotency: the same idempotency_key must never be sent twice.

---------------------------------------------------------------------
7. ENVIRONMENT VARIABLES (.env.example, no real values)
---------------------------------------------------------------------
NODE_ENV, PORT(local api, default 3001), DATABASE_URL (empty = use PGlite
local), JWT_SECRET, DOC_ENCRYPTION_KEY (32 bytes hex), CRON_SECRET,
CHAIN_MODE (MOCK|HARDHAT|MST_TESTNET, default MOCK), CHAIN_RPC_URL,
CHAIN_ID, CONTRACT_ADDRESS, OPERATOR_PRIVATE_KEY (server only, testnet-only
key), VITE_API_BASE (default /api/v1).

---------------------------------------------------------------------
8. VERCEL DEPLOYMENT
---------------------------------------------------------------------
One Vercel project, repo root. vercel.json: build frontend (Vite, output
frontend/dist); rewrite /api/(.*) -> /api (api/index.ts exports the Express
app); SPA fallback to /index.html; cron entry calling /api/v1/internal/reconcile.
Serverless functions are stateless: no local disk writes, no in-memory state
that must survive, no long-running processes, set a sensible maxDuration.
Preview deployments per PR are used for team review. Production demo runs
CHAIN_MODE=MOCK until MST is integrated; then MST_TESTNET with verified values.

---------------------------------------------------------------------
9. GIT, OWNERSHIP, COMMUNICATION
---------------------------------------------------------------------
Branches: feature/frontend, feature/backend, feature/contracts (+ short
sub-branches e.g. feature/backend-audit). Commit small, message style
"backend: add pledge unique index". Open a PR into main; at least one other
member reviews; main must always build and pass tests. Never force-push main.
Never edit another member's folder; ask them or request via PR comment.
Changing the contract: write the proposed change as a diff to docs/CONTRACT.md,
tell your human, and wait for all three members to approve before coding to it.
Each member delivers docs/integration-<role>.md: what is built, how to run,
how to test, what others must know.
Integration order: (1) skeleton + contract agreed, (2) backend + frontend on
mock chain, (3) contract + adapter local Hardhat, (4) backend switches to real
adapter on Hardhat, (5) full local e2e, (6) Vercel deploy in MOCK mode,
(7) MST verification + deploy, (8) MST e2e + demo.

---------------------------------------------------------------------
10. HOW YOU (the Antigravity agent) MUST WORK
---------------------------------------------------------------------
- Start in Planning mode. FIRST inspect the repo and installed tools (Node
  version, npm, OS), then produce an Implementation Plan artifact (exact files,
  order, commands, risks) and STOP for my approval before writing code.
- Keep a Task List artifact up to date. Build in small increments; run tests
  after each; paste exact commands and results. Fix failures, never hide them.
- No placeholder implementations of core features. No TODO-stubs for security.
- Ask before running destructive commands, installing many packages, or
  touching files outside your folder. Keep dependencies minimal.
- Explain each file in simple language. When finished, produce a Walkthrough
  artifact and your docs/integration-<role>.md.
- Save the Ownership + HARD RULES above in AGENTS.md (or your workspace rules)
  if it is not already present, and obey it.
=====================================================================