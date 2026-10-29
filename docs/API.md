# Stock & Foil — HTTP API Reference (`docs/API.md`)

**Owner:** Member 2 (Backend, Database, Cryptography)  
**Contract Version:** v1 (`docs/CONTRACT.md`)  
**Base Path:** `/api/v1`

---

## 1. Authentication & Security Architecture

### Session Cookie (`sf_session`)
All authenticated endpoints require an `httpOnly`, `SameSite=Strict`, `Secure` (in production) cookie named `sf_session`.
- The cookie contains a signed HMAC-SHA256 JWT expiring in 12 hours.
- Credentials (`password`, `password_hash`, `salt`, `salt_enc`) are **never returned or logged**.

### CSRF & Content-Type Headers
Every state-changing HTTP request (`POST`, `PATCH`, `DELETE`) **must** include:
```http
Content-Type: application/json
X-SF-CSRF: 1
```
Requests failing either check are immediately rejected with `403 FORBIDDEN` or `400 VALIDATION_ERROR`.

### Rate Limiting
- `POST /auth/login` and `POST /auth/register` are rate-limited to 20 requests per 15 minutes per IP address. Exceeding this limit returns `429 RATE_LIMITED`.

---

## 2. Standard Request & Response Envelopes

### Success Envelope
Every successful response returns HTTP 200 (or 201 Created) with a top-level `data` key:
```json
{
  "data": { ... }
}
```

### Error Envelope
Every failure response returns an appropriate HTTP status code with a top-level `error` key:
```json
{
  "error": {
    "code": "STRING",
    "message": "Human readable description",
    "details": {} 
  }
}
```

### Error Code to HTTP Status Mapping
| Error Code | HTTP Status | Description |
| :--- | :--- | :--- |
| `VALIDATION_ERROR` | 400 | Request body, query, or path parameter failed Zod or business rule validation. |
| `UNAUTHENTICATED` | 401 | Missing, invalid, or expired session cookie. |
| `FORBIDDEN` | 403 | Missing CSRF header or user's role lacks permission for the resource/action. |
| `NOT_FOUND` | 404 | Resource with specified ID was not found. |
| `CONFLICT` | 409 | Duplicate unique constraint violation (e.g. existing email or invoice number). |
| `INVALID_TRANSITION` | 409 | Illegal lifecycle transition attempt or editing a non-DRAFT invoice. |
| `DUPLICATE_PLEDGE` | 409 | Double-financing attempt: invoice commitment has already received a pledge. |
| `COMMITMENT_MISMATCH`| 422 | Recomputed commitment does not match stored commitment. |
| `RATE_LIMITED` | 429 | Rate limit exceeded on authentication endpoints. |
| `CHAIN_UNAVAILABLE` | 503 | Blockchain RPC or network connectivity failure. |
| `INTERNAL_ERROR` | 500 | Unhandled server error (zero client-exposed stack traces). |

---

## 3. Authorisation Matrix

| Action / Endpoint | SUPPLIER | BUYER | FINANCIER | Public / Unauth |
| :--- | :---: | :---: | :---: | :---: |
| `POST /auth/register` & `login` | ✅ | ✅ | ✅ | ✅ |
| `GET /auth/me` | ✅ | ✅ | ✅ | ❌ (401) |
| `GET /users/buyers` | ✅ | ✅ | ✅ | ❌ (401) |
| `POST /invoices` (Create) | ✅ (own only) | ❌ (403) | ❌ (403) | ❌ (401) |
| `GET /invoices` (List) | ✅ (own invoices) | ✅ (assigned, non-DRAFT) | ✅ (AVAILABLE & PLEDGED only) | ❌ (401) |
| `GET /invoices/:id` (View) | ✅ (own invoice) | ✅ (assigned, non-DRAFT) | ✅ (AVAILABLE & PLEDGED only) | ❌ (401) |
| `PATCH /invoices/:id` (Edit) | ✅ (DRAFT only) | ❌ (403) | ❌ (403) | ❌ (401) |
| `POST /invoices/:id/document` | ✅ (DRAFT only) | ❌ (403) | ❌ (403) | ❌ (401) |
| `GET /invoices/:id/document` | ✅ (own invoice) | ✅ (assigned only) | ❌ Strictly Forbidden (403) | ❌ (401) |
| `POST /invoices/:id/commit` | ✅ (own, DRAFT) | ❌ (403) | ❌ (403) | ❌ (401) |
| `POST /invoices/:id/verify-commitment`| ✅ (own invoice)| ❌ (403) | ❌ (403) | ❌ (401) |
| `POST /invoices/:id/acknowledgement` | ❌ (403) | ✅ (assigned, PENDING_ACK) | ❌ (403) | ❌ (401) |
| `POST /invoices/:id/release` | ✅ (own, ACKNOWLEDGED)| ❌ (403) | ❌ (403) | ❌ (401) |
| `POST /invoices/:id/pledges` | ❌ (403) | ❌ (403) | ✅ (AVAILABLE only) | ❌ (401) |
| `GET /invoices/:id/pledges` | ✅ (own invoice)| ❌ (403) | ✅ (pledging financier) | ❌ (401) |
| `GET /pledge-markers/:marker` | ✅ | ✅ | ✅ | ❌ (401) |
| `GET /pledges` (My Pledges) | ❌ (403) | ❌ (403) | ✅ (own pledges) | ❌ (401) |
| `POST /invoices/:id/settle` | ❌ (403) | ❌ (403) | ✅ (the pledging financier)| ❌ (401) |
| `GET /invoices/:id/audit` | ✅ (own invoice)| ✅ (assigned) | ✅ (if party to pledge) | ❌ (401) |
| `GET /system/status` & `/health` | ✅ | ✅ | ✅ | ✅ |
| `POST /internal/reconcile` | ❌ (401) | ❌ (401) | ❌ (401) | Bearer CRON_SECRET |

---

## 4. Endpoint Specifications & cURL Examples

### A. Authentication & Users

#### 1. Register User
```bash
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -H "X-SF-CSRF: 1" \
  -c cookies.txt \
  -d '{
    "email": "supplier@demo.com",
    "password": "password1234",
    "displayName": "Alice Supplier",
    "organisation": "Acme Components Ltd",
    "role": "SUPPLIER"
  }'
```
**Response (201 Created):**
```json
{
  "data": {
    "id": "11111111-1111-1111-1111-111111111111",
    "email": "supplier@demo.com",
    "displayName": "Alice Supplier",
    "organisation": "Acme Components Ltd",
    "role": "SUPPLIER",
    "createdAt": "2026-03-01T10:00:00.000Z"
  }
}
```

#### 2. Log In
```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -H "X-SF-CSRF: 1" \
  -c cookies.txt \
  -d '{
    "email": "supplier@demo.com",
    "password": "password1234"
  }'
```

#### 3. Current User (`/auth/me`)
```bash
curl -X GET http://localhost:3001/api/v1/auth/me \
  -b cookies.txt
```

#### 4. List Buyers (`/users/buyers`)
```bash
curl -X GET http://localhost:3001/api/v1/users/buyers \
  -b cookies.txt
```

---

### B. Invoices Lifecycle

#### 1. Create Invoice (Supplier Only)
```bash
curl -X POST http://localhost:3001/api/v1/invoices \
  -H "Content-Type: application/json" \
  -H "X-SF-CSRF: 1" \
  -b cookies.txt \
  -d '{
    "invoiceNumber": "INV-2026-001",
    "buyerId": "22222222-2222-2222-2222-222222222222",
    "amountMinorUnits": "500000",
    "currency": "INR",
    "issueDate": "2026-03-01",
    "dueDate": "2026-04-01"
  }'
```

#### 2. Upload Document (Supplier Only, DRAFT only)
```bash
curl -X POST http://localhost:3001/api/v1/invoices/{id}/document \
  -H "Content-Type: application/json" \
  -H "X-SF-CSRF: 1" \
  -b cookies.txt \
  -d '{
    "filename": "tax_invoice.pdf",
    "mimeType": "application/pdf",
    "contentBase64": "JVBERi0xLjQKJcTl8uXrp/Og0MTGCjEgMCBvYmo...=="
  }'
```

#### 3. Commit Invoice (Supplier Only, DRAFT -> PENDING_ACK)
```bash
curl -X POST http://localhost:3001/api/v1/invoices/{id}/commit \
  -H "Content-Type: application/json" \
  -H "X-SF-CSRF: 1" \
  -b cookies.txt \
  -d '{}'
```

#### 4. Verify Commitment (Supplier Only)
```bash
curl -X POST http://localhost:3001/api/v1/invoices/{id}/verify-commitment \
  -H "Content-Type: application/json" \
  -H "X-SF-CSRF: 1" \
  -b cookies.txt \
  -d '{}'
```

#### 5. Submit Acknowledgement (Assigned Buyer Only, PENDING_ACK)
```bash
curl -X POST http://localhost:3001/api/v1/invoices/{id}/acknowledgement \
  -H "Content-Type: application/json" \
  -H "X-SF-CSRF: 1" \
  -b buyer_cookies.txt \
  -d '{
    "decision": "ACKNOWLEDGE"
  }'
```

#### 6. Release Invoice for Financing (Supplier Only, ACKNOWLEDGED -> AVAILABLE)
```bash
curl -X POST http://localhost:3001/api/v1/invoices/{id}/release \
  -H "Content-Type: application/json" \
  -H "X-SF-CSRF: 1" \
  -b cookies.txt \
  -d '{}'
```

---

### C. Financing Pledges & Double-Financing Prevention

#### 1. Request Financing Pledge (Financier Only, AVAILABLE -> PLEDGED)
```bash
curl -X POST http://localhost:3001/api/v1/invoices/{id}/pledges \
  -H "Content-Type: application/json" \
  -H "X-SF-CSRF: 1" \
  -b financier_cookies.txt \
  -d '{
    "advanceMinorUnits": "400000",
    "note": "80% invoice advance facility approved."
  }'
```
**Response (201 Created):**
```json
{
  "data": {
    "id": "33333333-3333-3333-3333-333333333333",
    "invoiceId": "11111111-1111-1111-1111-111111111111",
    "commitment": "0xef701a52c86aa733646fce72c16bea2f7f4599997a7198dc8c1a07516628707e",
    "pledgeMarker": "0x2d43b001b37ceb63c135d10f914f82e48e947b209fae61d39ac0411fd0811c74",
    "financierId": "44444444-4444-4444-4444-444444444444",
    "advanceMinorUnits": "400000",
    "note": "80% invoice advance facility approved.",
    "status": "REGISTERED",
    "createdAt": "2026-03-01T12:00:00.000Z",
    "blockchainTxHash": "0x1234...",
    "blockchainStatus": "LOCAL_ONLY",
    "chainMode": "MOCK"
  }
}
```

#### 2. Duplicate Pledge Attempt (The Demo Moment)
Attempting a second pledge on the same invoice returns HTTP 409:
```json
{
  "error": {
    "code": "DUPLICATE_PLEDGE",
    "message": "Duplicate pledge rejected: this invoice commitment has already received a financing pledge.",
    "details": {
      "pledgeMarker": "0x2d43b001b37ceb63c135d10f914f82e48e947b209fae61d39ac0411fd0811c74"
    }
  }
}
```

#### 3. Inspect Registry Pledge Marker
```bash
curl -X GET http://localhost:3001/api/v1/pledge-markers/0x2d43b001b37ceb63c135d10f914f82e48e947b209fae61d39ac0411fd0811c74 \
  -b cookies.txt
```
**Response (200 OK):**
```json
{
  "data": {
    "marker": "0x2d43b001b37ceb63c135d10f914f82e48e947b209fae61d39ac0411fd0811c74",
    "used": true,
    "status": "REGISTERED"
  }
}
```

#### 4. Settle Invoice (Financier Only, PLEDGED -> SETTLED)
```bash
curl -X POST http://localhost:3001/api/v1/invoices/{id}/settle \
  -H "Content-Type: application/json" \
  -H "X-SF-CSRF: 1" \
  -b financier_cookies.txt \
  -d '{}'
```

---

### D. Audit & Background Reconciliation

#### 1. Retrieve Tamper-Evident Audit Trail
```bash
curl -X GET http://localhost:3001/api/v1/invoices/{id}/audit \
  -b cookies.txt
```
**Response (200 OK):**
```json
{
  "data": [
    {
      "id": "1",
      "at": "2026-03-01T10:00:00.000Z",
      "action": "INVOICE_CREATED",
      "actor": { "id": "...", "displayName": "Alice Supplier" },
      "source": "LOCAL",
      "details": { "invoiceNumber": "INV-2026-001", "amountMinorUnits": "500000" }
    },
    {
      "id": "2",
      "at": "2026-03-01T10:05:00.000Z",
      "action": "COMMITMENT_GENERATED",
      "actor": { "id": "...", "displayName": "Alice Supplier" },
      "source": "LOCAL",
      "details": { "commitment": "0xef701..." }
    }
  ]
}
```

#### 2. Background Reconciliation (Vercel Cron / Internal)
```bash
curl -X POST http://localhost:3001/api/v1/internal/reconcile \
  -H "Authorization: Bearer stockfoil_dev_cron_secret_12345" \
  -H "Content-Type: application/json" \
  -H "X-SF-CSRF: 1"
```
**Response (200 OK):**
```json
{
  "data": {
    "scanned": 1,
    "confirmed": 1,
    "failed": 0,
    "stillPending": 0
  }
}
```
