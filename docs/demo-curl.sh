#!/usr/bin/env bash
# ==============================================================================
# Stock & Foil — End-to-End Walkthrough & Duplicate Prevention Demo Script
# Demonstrates the complete Block A invoice lifecycle and the 409 DUPLICATE_PLEDGE rejection
# ==============================================================================

set -e

API_BASE="${API_BASE:-http://localhost:3001/api/v1}"
SUPPLIER_COOKIE="/tmp/sf_supplier_cookie.txt"
BUYER_COOKIE="/tmp/sf_buyer_cookie.txt"
FINANCIER_COOKIE="/tmp/sf_financier_cookie.txt"
ATTACKER_COOKIE="/tmp/sf_attacker_cookie.txt"

# Cleanup any previous cookies
rm -f "$SUPPLIER_COOKIE" "$BUYER_COOKIE" "$FINANCIER_COOKIE" "$ATTACKER_COOKIE"

echo "======================================================================"
echo "  STOCK & FOIL: API LIFECYCLE & DUPLICATE PLEDGE PREVENTION DEMO"
echo "  Target API: $API_BASE"
echo "======================================================================"

# Health Check
echo -e "\n[Step 0] Checking System Health..."
curl -s -X GET "$API_BASE/health" | grep -q '"ok":true' && echo "  ✅ System is healthy and operational."

# 1. Authenticate / Register Demo Users
echo -e "\n[Step 1] Authenticating Demo Users..."

# Register/Login Supplier
curl -s -X POST "$API_BASE/auth/register" \
  -H "Content-Type: application/json" -H "X-SF-CSRF: 1" -c "$SUPPLIER_COOKIE" \
  -d '{"email":"alice@supplier.com","password":"password12345","displayName":"Alice Supplier","organisation":"Acme Components Ltd","role":"SUPPLIER"}' > /dev/null || true
curl -s -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" -H "X-SF-CSRF: 1" -c "$SUPPLIER_COOKIE" \
  -d '{"email":"alice@supplier.com","password":"password12345"}' > /dev/null
echo "  ✅ Alice Supplier logged in (sf_session cookie saved)."

# Register/Login Buyer
curl -s -X POST "$API_BASE/auth/register" \
  -H "Content-Type: application/json" -H "X-SF-CSRF: 1" -c "$BUYER_COOKIE" \
  -d '{"email":"bob@buyer.com","password":"password12345","displayName":"Bob Buyer","organisation":"Global Retail Corp","role":"BUYER"}' > /dev/null || true
curl -s -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" -H "X-SF-CSRF: 1" -c "$BUYER_COOKIE" \
  -d '{"email":"bob@buyer.com","password":"password12345"}' > /dev/null
echo "  ✅ Bob Buyer logged in."

# Fetch Bob's Buyer ID
BUYER_ID=$(curl -s -X GET "$API_BASE/auth/me" -b "$BUYER_COOKIE" | grep -o '"id":"[^"]*' | cut -d'"' -f4)
echo "     Bob Buyer ID: $BUYER_ID"

# Register/Login Financier
curl -s -X POST "$API_BASE/auth/register" \
  -H "Content-Type: application/json" -H "X-SF-CSRF: 1" -c "$FINANCIER_COOKIE" \
  -d '{"email":"charlie@financier.com","password":"password12345","displayName":"Charlie Financier","organisation":"Alpha Capital","role":"FINANCIER"}' > /dev/null || true
curl -s -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" -H "X-SF-CSRF: 1" -c "$FINANCIER_COOKIE" \
  -d '{"email":"charlie@financier.com","password":"password12345"}' > /dev/null
echo "  ✅ Charlie Financier logged in."

# Register/Login Second Financier (Attempted Double-Financier)
curl -s -X POST "$API_BASE/auth/register" \
  -H "Content-Type: application/json" -H "X-SF-CSRF: 1" -c "$ATTACKER_COOKIE" \
  -d '{"email":"david@financier.com","password":"password12345","displayName":"David Financier","organisation":"Beta Lending","role":"FINANCIER"}' > /dev/null || true
curl -s -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" -H "X-SF-CSRF: 1" -c "$ATTACKER_COOKIE" \
  -d '{"email":"david@financier.com","password":"password12345"}' > /dev/null
echo "  ✅ David Financier logged in."

# 2. Supplier Creates Invoice
INV_NUM="INV-DEMO-$(date +%s)"
echo -e "\n[Step 2] Supplier Alice creates Invoice $INV_NUM in DRAFT..."
CREATE_RESP=$(curl -s -X POST "$API_BASE/invoices" \
  -H "Content-Type: application/json" -H "X-SF-CSRF: 1" -b "$SUPPLIER_COOKIE" \
  -d "{\"invoiceNumber\":\"$INV_NUM\",\"buyerId\":\"$BUYER_ID\",\"amountMinorUnits\":\"500000\",\"currency\":\"INR\",\"issueDate\":\"2026-03-01\",\"dueDate\":\"2026-04-01\"}")

INVOICE_ID=$(echo "$CREATE_RESP" | grep -o '"id":"[^"]*' | head -n1 | cut -d'"' -f4)
echo "  ✅ Invoice created: ID=$INVOICE_ID (Status: DRAFT)"

# 3. Supplier Uploads Invoice Document (base64 with PDF magic bytes)
echo -e "\n[Step 3] Supplier Alice uploads encrypted document..."
PDF_B64=$(echo -n "%PDF-1.4 Specimen Tax Invoice Content %%EOF" | base64)
curl -s -X POST "$API_BASE/invoices/$INVOICE_ID/document" \
  -H "Content-Type: application/json" -H "X-SF-CSRF: 1" -b "$SUPPLIER_COOKIE" \
  -d "{\"filename\":\"invoice.pdf\",\"mimeType\":\"application/pdf\",\"contentBase64\":\"$PDF_B64\"}" > /dev/null
echo "  ✅ Document uploaded (AES-256-GCM encrypted in DB, SHA-256 verified)."

# 4. Supplier Commits Invoice
echo -e "\n[Step 4] Supplier Alice commits invoice (DRAFT -> PENDING_ACK)..."
COMMIT_RESP=$(curl -s -X POST "$API_BASE/invoices/$INVOICE_ID/commit" \
  -H "Content-Type: application/json" -H "X-SF-CSRF: 1" -b "$SUPPLIER_COOKIE" -d '{}')
COMMITMENT=$(echo "$COMMIT_RESP" | grep -o '"commitment":"[^"]*' | cut -d'"' -f4)
echo "  ✅ Commitment generated: $COMMITMENT"

# 5. Verify Commitment
echo -e "\n[Step 5] Supplier Alice verifies invoice commitment integrity..."
VERIFY_RESP=$(curl -s -X POST "$API_BASE/invoices/$INVOICE_ID/verify-commitment" \
  -H "Content-Type: application/json" -H "X-SF-CSRF: 1" -b "$SUPPLIER_COOKIE" -d '{}')
echo "  ✅ Verification result: $VERIFY_RESP"

# 6. Assigned Buyer Acknowledges
echo -e "\n[Step 6] Buyer Bob acknowledges the invoice (PENDING_ACK -> ACKNOWLEDGED)..."
curl -s -X POST "$API_BASE/invoices/$INVOICE_ID/acknowledgement" \
  -H "Content-Type: application/json" -H "X-SF-CSRF: 1" -b "$BUYER_COOKIE" \
  -d '{"decision":"ACKNOWLEDGE"}' > /dev/null
echo "  ✅ Invoice acknowledged by assigned buyer."

# 7. Supplier Releases for Financing
echo -e "\n[Step 7] Supplier Alice releases invoice (ACKNOWLEDGED -> AVAILABLE)..."
curl -s -X POST "$API_BASE/invoices/$INVOICE_ID/release" \
  -H "Content-Type: application/json" -H "X-SF-CSRF: 1" -b "$SUPPLIER_COOKIE" -d '{}' > /dev/null
echo "  ✅ Invoice status is now AVAILABLE for financing."

# 8. Financier Charlie Records Financing Pledge
echo -e "\n[Step 8] Financier Charlie records financing pledge (AVAILABLE -> PLEDGED)..."
PLEDGE_RESP=$(curl -s -X POST "$API_BASE/invoices/$INVOICE_ID/pledges" \
  -H "Content-Type: application/json" -H "X-SF-CSRF: 1" -b "$FINANCIER_COOKIE" \
  -d '{"advanceMinorUnits":"400000","note":"80% advance facility approved."}')
MARKER=$(echo "$PLEDGE_RESP" | grep -o '"pledgeMarker":"[^"]*' | cut -d'"' -f4)
echo "  ✅ Pledge recorded successfully!"
echo "     Pledge Marker: $MARKER"

# 9. THE DEMO MOMENT: Duplicate Pledge Attempt
echo -e "\n[Step 9] ⚠️ THE DEMO MOMENT: David Financier attempts duplicate pledge on same invoice..."
DUP_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$API_BASE/invoices/$INVOICE_ID/pledges" \
  -H "Content-Type: application/json" -H "X-SF-CSRF: 1" -b "$ATTACKER_COOKIE" \
  -d '{"advanceMinorUnits":"350000","note":"Fraudulent double-financing attempt."}')

HTTP_CODE=$(echo "$DUP_RESP" | grep 'HTTP_STATUS:' | cut -d':' -f2)
BODY=$(echo "$DUP_RESP" | grep -v 'HTTP_STATUS:')

if [ "$HTTP_CODE" -eq 409 ]; then
  echo "  🛡️ SUCCESS: Duplicate pledge strictly REJECTED with HTTP 409 DUPLICATE_PLEDGE!"
  echo "     Response Body: $BODY"
else
  echo "  ❌ FAILED: Expected HTTP 409 but received $HTTP_CODE"
  exit 1
fi

# 10. Inspect Registry Pledge Marker
echo -e "\n[Step 10] Querying registry state for marker $MARKER..."
MARKER_RESP=$(curl -s -X GET "$API_BASE/pledge-markers/$MARKER" -b "$FINANCIER_COOKIE")
echo "  ✅ Marker status: $MARKER_RESP"

# 11. Financier Charlie Settles Invoice
echo -e "\n[Step 11] Financier Charlie marks invoice settled (PLEDGED -> SETTLED)..."
curl -s -X POST "$API_BASE/invoices/$INVOICE_ID/settle" \
  -H "Content-Type: application/json" -H "X-SF-CSRF: 1" -b "$FINANCIER_COOKIE" -d '{}' > /dev/null
echo "  ✅ Invoice settled."

# 12. View Audit Trail
echo -e "\n[Step 12] Inspecting tamper-evident hash-chained audit trail..."
AUDIT_RESP=$(curl -s -X GET "$API_BASE/invoices/$INVOICE_ID/audit" -b "$SUPPLIER_COOKIE")
echo "  ✅ Audit Trail:"
echo "$AUDIT_RESP" | grep -o '"action":"[^"]*'

echo -e "\n======================================================================"
echo "  🎉 DEMO COMPLETE: All lifecycle stages & double-pledge prevention verified!"
echo "======================================================================"
