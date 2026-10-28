-- Stock & Foil Database Schema Migration 001
-- Idempotent initialization for both PostgreSQL and PGlite

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    organisation VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL CHECK (role IN ('SUPPLIER', 'BUYER', 'FINANCIER')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(128) NOT NULL,
    supplier_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    amount_minor_units BIGINT NOT NULL CHECK (amount_minor_units > 0),
    currency CHAR(3) NOT NULL,
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL CHECK (due_date >= issue_date),
    commitment TEXT UNIQUE,
    salt_enc BYTEA,
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
        'DRAFT', 'PENDING_ACK', 'ACKNOWLEDGED', 'REJECTED', 'AVAILABLE', 'PLEDGED', 'SETTLED'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_supplier_invoice_number UNIQUE (supplier_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS invoice_documents (
    invoice_id UUID PRIMARY KEY REFERENCES invoices(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 3145728),
    content_enc BYTEA NOT NULL,
    sha256 TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chain_txs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind VARCHAR(64) NOT NULL,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'FAILED')),
    tx_hash TEXT,
    block_number BIGINT,
    error_code VARCHAR(64),
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acknowledgements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL UNIQUE REFERENCES invoices(id) ON DELETE RESTRICT,
    invoice_commitment TEXT NOT NULL,
    buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    decision VARCHAR(32) NOT NULL CHECK (decision IN ('ACKNOWLEDGE', 'REJECT')),
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    chain_tx_id UUID REFERENCES chain_txs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS pledges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    commitment TEXT NOT NULL,
    pledge_marker TEXT NOT NULL,
    financier_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    advance_minor_units BIGINT NOT NULL CHECK (advance_minor_units > 0),
    note TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'REQUESTED' CHECK (status IN (
        'REQUESTED', 'REGISTERED', 'REJECTED_DUPLICATE', 'FAILED', 'SETTLED'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    blockchain_tx_hash TEXT,
    blockchain_status VARCHAR(32) NOT NULL DEFAULT 'LOCAL_ONLY' CHECK (blockchain_status IN (
        'LOCAL_ONLY', 'PENDING', 'CONFIRMED', 'FAILED'
    )),
    chain_mode VARCHAR(32) NOT NULL DEFAULT 'MOCK' CHECK (chain_mode IN ('MOCK', 'HARDHAT', 'MST_TESTNET'))
);

-- Crucial Duplicate Protection: Partial Unique Index
-- Blocks concurrent duplicate pledges on the exact same pledge_marker
CREATE UNIQUE INDEX IF NOT EXISTS idx_pledges_pledge_marker 
ON pledges(pledge_marker) 
WHERE status IN ('REQUESTED', 'REGISTERED', 'SETTLED');

CREATE TABLE IF NOT EXISTS audit_events (
    id BIGSERIAL PRIMARY KEY,
    at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(64) NOT NULL,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    pledge_id UUID REFERENCES pledges(id) ON DELETE SET NULL,
    source VARCHAR(16) NOT NULL CHECK (source IN ('LOCAL', 'CHAIN')),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    prev_hash TEXT NOT NULL,
    event_hash TEXT NOT NULL
);

-- Trigger function to enforce append-only immutability
CREATE OR REPLACE FUNCTION forbid_update_or_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Table % is strictly append-only. UPDATE and DELETE are prohibited.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_events_immutable ON audit_events;
CREATE TRIGGER trg_audit_events_immutable
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW
EXECUTE FUNCTION forbid_update_or_delete();

DROP TRIGGER IF EXISTS trg_acknowledgements_immutable ON acknowledgements;
CREATE TRIGGER trg_acknowledgements_immutable
BEFORE UPDATE OR DELETE ON acknowledgements
FOR EACH ROW
EXECUTE FUNCTION forbid_update_or_delete();
