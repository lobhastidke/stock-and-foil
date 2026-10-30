/**
 * pages/PledgeStatus/index.tsx
 *
 * Detailed pledge status & settlement page for financiers:
 * - Shows pledge advance, marker hash, commitment, blockchain status
 * - Displays associated invoice details
 * - Polls while blockchainStatus is PENDING
 * - Allows settling the pledge when REGISTERED (calling settleInvoice)
 * - Shows audit timeline
 */

import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Layout } from '../../components/Layout/Layout.js';
import { StatusBadge } from '../../components/StatusBadge/StatusBadge.js';
import { ChainBadge } from '../../components/ChainBadge/ChainBadge.js';
import { MoneyText } from '../../components/MoneyText/MoneyText.js';
import { AuditTimeline } from '../../components/AuditTimeline/AuditTimeline.js';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { ErrorBanner } from '../../components/ErrorBanner/ErrorBanner.js';
import { LoadingState } from '../../components/LoadingState/LoadingState.js';
import {
  getPledge,
  getInvoice,
  settleInvoice,
} from '../../api/endpoints.js';
import { ROUTES } from '../../routes.js';
import type { Pledge, Invoice } from '../../api/types.js';
import styles from './PledgeStatus.module.css';

export default function PledgeStatus() {
  const { id } = useParams<{ id: string }>();

  const [pledge, setPledge] = useState<Pledge | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // Settlement action
  const [showSettleDialog, setShowSettleDialog] = useState(false);
  const [settling, setSettling] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [copiedMarker, setCopiedMarker] = useState(false);

  async function loadData() {
    if (!id) return;
    try {
      setError(null);
      const plRes = await getPledge(id);
      setPledge(plRes.pledge);

      const invRes = await getInvoice(plRes.pledge.invoiceId);
      setInvoice(invRes.invoice);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [id]);

  // Polling while blockchainStatus is PENDING
  useEffect(() => {
    if (!pledge || pledge.blockchainStatus !== 'PENDING') return;
    const timer = setInterval(() => {
      void loadData();
    }, 5000);
    return () => clearInterval(timer);
  }, [pledge?.blockchainStatus]);

  async function handleSettle() {
    if (!invoice) return;
    setSettling(true);
    setActionError(null);
    try {
      await settleInvoice(invoice.id);
      setShowSettleDialog(false);
      await loadData();
    } catch (err) {
      setActionError(err);
    } finally {
      setSettling(false);
    }
  }

  async function handleCopyMarker() {
    if (!pledge) return;
    await navigator.clipboard.writeText(pledge.pledgeMarker);
    setCopiedMarker(true);
    setTimeout(() => setCopiedMarker(false), 2000);
  }

  if (loading) {
    return (
      <Layout>
        <LoadingState message="Loading pledge status…" />
      </Layout>
    );
  }

  if (error || !pledge) {
    return (
      <Layout>
        <div className="mb-6">
          <Link to={ROUTES.financierDashboard} className="btn btn-ghost btn-sm">
            ← Back to Financier Portal
          </Link>
        </div>
        <ErrorBanner error={error ?? new Error('Pledge not found')} />
      </Layout>
    );
  }

  const canSettle = pledge.status === 'REGISTERED' && invoice?.status === 'PLEDGED';

  return (
    <Layout>
      <div className="mb-4">
        <Link to={ROUTES.financierDashboard} className="btn btn-ghost btn-sm">
          ← Back to Financier Portal
        </Link>
      </div>

      {Boolean(actionError) && <ErrorBanner error={actionError} />}

      <div className="page-header">
        <div>
          <div className={styles.titleRow}>
            <h1 className="page-title">Pledge Details</h1>
            <span className={`badge badge-${pledge.status.toLowerCase()}`}>
              {pledge.status}
            </span>
          </div>
          <p className="text-secondary text-sm mt-1">
            Registered on {new Date(pledge.createdAt).toLocaleString()} · ID: <code>{pledge.id}</code>
          </p>
        </div>

        {canSettle && (
          <div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowSettleDialog(true)}
              id="settle-btn"
            >
              🏁 Settle Invoice
            </button>
          </div>
        )}
      </div>

      <div className={styles.grid}>
        {/* Left Column: Pledge Details */}
        <div className={styles.mainCol}>
          <div className="card mb-6">
            <h2 className="card-title">Financing Overview</h2>
            <div className={styles.metaList}>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Advance Financed</span>
                <span className={styles.metaValueHighlight}>
                  <MoneyText minorUnits={pledge.advanceMinorUnits} />
                </span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Pledge Status</span>
                <span className={styles.metaValue}>{pledge.status}</span>
              </div>
              {pledge.note && (
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Financier Note</span>
                  <span className={styles.metaValue}>{pledge.note}</span>
                </div>
              )}
            </div>
          </div>

          {/* Cryptographic Pledge Marker */}
          <div className="card mb-6">
            <div className={styles.markerHeader}>
              <h2 className="card-title mb-0">Unique Pledge Marker</h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => { void handleCopyMarker(); }}
              >
                {copiedMarker ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-secondary text-xs mb-3 mt-1">
              <code>keccak256(&quot;STOCKFOIL_PLEDGE_V1&quot;, commitment)</code>.
              This deterministic marker ensures only one pledge can ever be registered for this commitment.
            </p>
            <code className="code-block text-xs">{pledge.pledgeMarker}</code>
          </div>

          {/* Invoice Summary */}
          {invoice && (
            <div className="card mb-6">
              <div className={styles.cardHeaderFlex}>
                <h2 className="card-title mb-0">Associated Invoice</h2>
                <StatusBadge status={invoice.status} />
              </div>
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <Link to={ROUTES.pledgeReview(invoice.id)} className="btn btn-secondary btn-sm w-full" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
                  🚨 Attempt Another Pledge on This Invoice (Test Fraud Prevention)
                </Link>
              </div>
              <div className={styles.metaList} style={{ marginTop: 'var(--space-4)' }}>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Invoice Number</span>
                  <span className={styles.metaValue}>{invoice.invoiceNumber}</span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Face Value</span>
                  <span className={styles.metaValue}>
                    <MoneyText minorUnits={invoice.amountMinorUnits} currency={invoice.currency} />
                  </span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Buyer</span>
                  <span className={styles.metaValue}>{invoice.buyer.displayName}</span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Supplier</span>
                  <span className={styles.metaValue}>{invoice.supplier.displayName}</span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Due Date</span>
                  <span className={styles.metaValue}>{invoice.dueDate}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Blockchain Status & Timeline */}
        <div className={styles.sideCol}>
          <div className="card mb-6">
            <h2 className="card-title">Blockchain Status</h2>
            <div className="mb-3">
              <ChainBadge
                chainStatus={pledge.blockchainStatus}
                chainMode={pledge.chainMode}
                txHash={pledge.blockchainTxHash}
                label="Pledge"
              />
            </div>
            <p className="text-muted text-xs">
              Operating mode: <code>{pledge.chainMode}</code>.
            </p>
          </div>

          {/* Audit Timeline */}
          {invoice && (
            <div className="card">
              <h2 className="card-title">Invoice Audit History</h2>
              <AuditTimeline invoiceId={invoice.id} />
            </div>
          )}
        </div>
      </div>

      {/* Settle Confirm Dialog */}
      <ConfirmDialog
        isOpen={showSettleDialog}
        title="Settle Invoice"
        confirmLabel="Confirm Settlement"
        isLoading={settling}
        onConfirm={() => { void handleSettle(); }}
        onCancel={() => setShowSettleDialog(false)}
      >
        <p className="text-sm text-secondary mb-3">
          Settling marks this invoice financing lifecycle as <strong>SETTLED</strong> on the registry,
          signaling that the financing advance and subsequent buyer payment obligations have concluded.
        </p>
        <p className="text-xs text-muted">
          SETTLED is a terminal state; no further actions can be taken on this invoice.
        </p>
      </ConfirmDialog>
    </Layout>
  );
}
