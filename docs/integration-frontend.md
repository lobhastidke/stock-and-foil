# Stock & Foil — Frontend Integration Documentation (`docs/integration-frontend.md`)

**Owner:** Member 1 (Frontend + UX Developer)  
**Branch:** `feature/frontend`  
**Contract Version:** v1 (`docs/AGENTS.md`)

---

## 1. What is Built

The frontend client for **Stock & Foil** ("Finance the invoice. Not the fraud.") is a single-page application built with React 18, TypeScript (strict mode), React Router v6, and Zod. It fully implements the contract specified in `docs/AGENTS.md` (Block A section 5) without external hosted UI kits, CDN fonts, or external authentication services.

### Core Modules & Capabilities

1. **Authentication & Session Management (`src/auth/`)**
   - Cookie-based session (`sf_session` httpOnly).
   - `AuthContext` hydrates session on initial load via `GET /auth/me`.
   - `RequireRole` route guard protecting Supplier, Buyer, and Financier views.
   - Seed credentials supported for demo:
     - Supplier: `supplier@demo.com` / `password1234`
     - Buyer: `buyer@demo.com` / `password1234`
     - Financier: `financier@demo.com` / `password1234`

2. **Complete Role Flows (`src/pages/`)**
   - **Supplier**:
     - `SupplierDashboard`: Filter invoices by status, cards linking to detail.
     - `InvoiceCreate`: Form with buyer dropdown (`GET /users/buyers`), amount input in major units converted to minor units string without floats, issue and due dates validation (`dueDate >= issueDate`).
     - `InvoiceDetail`: Document upload (≤ 3MB, PDF/PNG/JPG), commitment generation via `POST /invoices/:id/commit`, commitment verification via `POST /invoices/:id/verify-commitment`, release to financing (`POST /invoices/:id/release`), registration chain badge, audit timeline.
   - **Buyer**:
     - `BuyerDashboard`: View assigned invoices with status filters and prominent "Action Required" banners for `PENDING_ACK`.
     - `AcknowledgeInvoice`: View invoice face value and attached document; form to submit `ACKNOWLEDGE` or `REJECT` (rejection requires reason string); audit log.
   - **Financier**:
     - `FinancierDashboard`: Available invoices tab and My Pledges tab.
     - `PledgeReview`: Financing advance input (validated `<= invoice amount`), commitment inspection, submit financing pledge.
     - **The Demo Moment:** If a second pledge is attempted on an already pledged invoice/marker, catches `409 DUPLICATE_PLEDGE` and displays the dedicated duplicate prevention alert showing the rejected `pledgeMarker` and a button to query registry marker state (`GET /pledge-markers/:marker`).
     - `PledgeStatus`: Pledge status, advance amount, deterministic `pledgeMarker` (`keccak256("STOCKFOIL_PLEDGE_V1", commitment)`), `ChainBadge` with polling, and `Settle Invoice` action (`POST /invoices/:id/settle`).
   - **Public & Transparency**:
     - `About`: Project overview, system and chain mode status (`GET /system/status`), honest limits, and 5-step evaluator demo guide.

3. **Financial Precision (`src/lib/money.ts`)**
   - All monetary values are handled as integer minor-unit strings (e.g. INR 5,000.00 = `"500000"`).
   - Zero JavaScript floating-point conversions (`parseFloat` or `Number`) used in monetary logic.

4. **In-Memory Mock Layer (`src/api/mock/`)**
   - Activated automatically when `VITE_USE_MOCK=true`.
   - Simulates all endpoints from Contract §5, enforcing the state machine, document handling, audit events, and `409 DUPLICATE_PLEDGE`.
   - Allows full offline development and end-to-end testing with zero backend running.

5. **Blockchain UX Rules (`src/components/ChainBadge/`)**
   - `LOCAL_ONLY` → Grey "Local record (not on-chain)".
   - `PENDING` → Amber "Pending".
   - `CONFIRMED` + `MOCK` → Green "Confirmed (mock)" (never linked to explorer).
   - `CONFIRMED` + `HARDHAT` / `MST_TESTNET` → Green "Confirmed on <mode>" (links only if `VITE_EXPLORER_TX_URL` is set).
   - `FAILED` → Red "Failed".

---

## 2. How to Run Locally

### Prerequisites
- Node.js >= 18 (Tested on Node v24.13.0)
- npm >= 9

### Install Dependencies
From the repository root:
```bash
npm install
```

### Run Dev Server (Mock Mode)
The frontend comes pre-configured with `VITE_USE_MOCK=true` in `frontend/.env`.
```bash
npm run dev
# Or:
npm run dev -w frontend
```
The app will start at `http://localhost:5173`.

### Switch from Mock to Real Backend
To switch from mock mode to Member 2's live backend server:
1. Edit `frontend/.env`:
   ```ini
   VITE_USE_MOCK=false
   VITE_API_BASE=/api/v1
   ```
2. Ensure Member 2's Express backend is running on `http://localhost:3001`. Vite automatically proxies `/api` requests to port 3001 in development.

---

## 3. How to Test

Run the full automated test suite with Vitest:
```bash
npm run test -w frontend
```

### Test Coverage Summary (40/40 Passing):
- `src/__tests__/money.test.ts`: Conversions, string manipulations, padding, comparisons.
- `src/__tests__/validation.test.ts`: Zod schema rules for registration, login, invoice creation, acknowledgements, and pledges.
- `src/__tests__/StatusBadge.test.tsx`: Correct badge and color coding for all contract invoice statuses.
- `src/__tests__/ChainBadge.test.tsx`: Display rules for `LOCAL_ONLY`, `PENDING`, `CONFIRMED` (mock vs testnet), and `FAILED`.
- `src/__tests__/RequireRole.test.tsx`: Route guards, unauthenticated redirects, and role mismatch redirects.
- `src/__tests__/flow.integration.test.tsx`: Full lifecycle integration test covering Supplier create & commit -> Buyer acknowledge -> Supplier release -> Financier pledge -> Duplicate pledge rejection (`409 DUPLICATE_PLEDGE`) -> Settlement.

To build the production bundle:
```bash
npm run build -w frontend
```

---

## 4. What Others Must Know (Integration Notes)

### For Member 2 (Backend & DB):
1. **CSRF Header:** Every mutation (`POST`, `PATCH`, `DELETE`) from the frontend sends `X-SF-CSRF: 1` and `Content-Type: application/json`.
2. **Auth Cookie:** The frontend assumes the session cookie `sf_session` is set as `httpOnly`, `SameSite=Strict`. No client-side JWT token storage is used.
3. **Pledge Summary Privacy:** As per contract §5, `pledgeSummary: { pledged: true }` hides the financier identity from buyers and suppliers.
4. **Duplicate Pledge Details:** When returning `409 DUPLICATE_PLEDGE`, the backend should return `{ error: { code: 'DUPLICATE_PLEDGE', message: '...', details: { pledgeMarker: '0x...' } } }`. The frontend displays this marker and gives the user an option to inspect it via `GET /pledge-markers/:marker`.
5. **Document Downloads:** Document URLs are opened directly via `GET /api/v1/invoices/:id/document` using the browser's credentials; make sure appropriate `Content-Type` headers are sent.

### For Member 3 (Chain Adapter & Smart Contracts):
1. **Never Label Mock as On-Chain:** The frontend strictly respects the `chainMode` and `chainStatus` flags. Mocks are labeled as "mock" or "Local record (not on-chain)".
2. **Explorer Links:** No explorer links are displayed unless `VITE_EXPLORER_TX_URL` is set with a verified explorer base URL.
3. **Pending Polling:** While an invoice or pledge has `chainStatus === 'PENDING'`, the UI polls every 5 seconds for status updates.
