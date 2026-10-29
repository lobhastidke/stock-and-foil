/**
 * pages/AcknowledgeInvoice/index.tsx
 *
 * Buyer review and acknowledgement page:
 * - Review invoice details, amount, dates, supplier
 * - View supporting document
 * - Inspect commitment
 * - Form to ACKNOWLEDGE or REJECT (with required reason)
 * - Confirmation dialogs and chain status
 */

import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Layout } from '../../components/Layout/Layout.js';
import { StatusBadge } from '../../components/StatusBadge/StatusBadge.js';
import { ChainBadge } from '../../components/ChainBadge/ChainBadge.js';
import { MoneyText } from '../../components/MoneyText/MoneyText.js';
import { CommitmentView } from '../../components/CommitmentView/CommitmentView.js';
import { AuditTimeline } from '../../components/AuditTimeline/AuditTimeline.js';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import { ErrorBanner } from '../../components/ErrorBanner/ErrorBanner.js';
import { LoadingState } from '../../components/LoadingState/LoadingState.js';
import { LifecycleStepper } from '../../components/LifecycleStepper/LifecycleStepper.js';
import { AnimatedHeading } from '../../components/AnimatedHeading/AnimatedHeading.js';
import {
  getInvoice,
  submitAcknowledgement,
  documentUrl,
} from '../../api/endpoints.js';
import { ROUTES } from '../../routes.js';
import type { Invoice, AckDecision } from '../../api/types.js';
import styles from './AcknowledgeInvoice.module.css';

export default function AcknowledgeInvoice() {
  const { id } = useParams<{ id: string }>();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Decision & modal
  const [pendingDecision, setPendingDecision] = useState<AckDecision | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);

  async function loadData() {
    if (!id) return;
    try {
      setError(null);
      const res = await getInvoice(id);
      setInvoice(res.invoice);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [id]);

  function handleOpenDecision(decision: AckDecision) {
    setPendingDecision(decision);
    setRejectReason('');
    setRejectError(null);
    setActionError(null);
  }

  async function handleConfirmDecision() {
    if (!id || !pendingDecision) return;

    if (pendingDecision === 'REJECT' && !rejectReason.trim()) {
      setRejectError('Please provide a reason for rejecting this invoice.');
      return;
    }

    setActionLoading(true);
    setActionError(null);
    setRejectError(null);

    try {
      const res = await submitAcknowledgement(id, {
        decision: pendingDecision,
        reason: pendingDecision === 'REJECT' ? rejectReason.trim() : undefined,
      });
      setInvoice(res.invoice);
      setPendingDecision(null);
    } catch (err) {
      setActionError(err);
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <Layout>
        <LoadingState message="Loading invoice for review…" />
      </Layout>
    );
  }

  if (error || !invoice) {
    return (
      <Layout>
        <div className="mb-6">
          <Link to={ROUTES.buyerDashboard} className="btn btn-ghost btn-sm">
            ← Back to Invoices
          </Link>
        </div>
        <ErrorBanner error={error ?? new Error('Invoice not found')} />
      </Layout>
    );
  }

  const isPendingAck = invoice.status === 'PENDING_ACK';

  return (
    <Layout>
      <div className="mb-4">
        <Link to={ROUTES.buyerDashboard} className="btn btn-ghost btn-sm">
          ← Back to Invoices
        </Link>
      </div>

      {Boolean(actionError) && <ErrorBanner error={actionError} />}

      <div className="page-header">
        <div>
          <div className={styles.titleRow}>
            <AnimatedHeading text={`Invoice ${invoice.invoiceNumber}`} as="h1" className="page-title" />
            <StatusBadge status={invoice.status} />
          </div>
          <p className="text-secondary text-sm mt-1">
            Issued by {invoice.supplier.displayName} · Due on {invoice.dueDate}
          </p>
        </div>
      </div>

      <div className="mb-6">
        <LifecycleStepper status={invoice.status} />
      </div>

      {/* Action Required Banner */}
      {isPendingAck && (
        <div className={styles.actionBanner} role="region" aria-label="Review required">
          <div className={styles.actionBannerContent}>
            <div>
              <h2 className={styles.actionBannerTitle}>Buyer Review Required</h2>
              <p className={styles.actionBannerText}>
                Please verify the invoice details and any supporting documents. Your acknowledgement
                confirms receipt and will be registered on the registry to enable supplier financing.
              </p>
            </div>
            <div className={styles.actionButtons}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handleOpenDecision('ACKNOWLEDGE')}
                id="btn-acknowledge"
              >
                ✓ Acknowledge Invoice
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => handleOpenDecision('REJECT')}
                id="btn-reject"
              >
                ✗ Reject Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Previous Decision Banner if already decided */}
      {invoice.acknowledgement && (
        <div
          className={`${styles.decisionCard} ${
            invoice.acknowledgement.decision === 'ACKNOWLEDGE'
              ? styles.decisionCardSuccess
              : styles.decisionCardDanger
          }`}
        >
          <div className="font-semibold text-md mb-1">
            {invoice.acknowledgement.decision === 'ACKNOWLEDGE'
              ? '✓ Invoice Acknowledged by You'
              : '✗ Invoice Rejected by You'}
          </div>
          {invoice.acknowledgement.reason && (
            <p className="text-sm mt-1">Reason: &quot;{invoice.acknowledgement.reason}&quot;</p>
          )}
          <p className="text-xs text-secondary mt-2">
            Recorded on {new Date(invoice.acknowledgement.createdAt).toLocaleString()}
          </p>
        </div>
      )}

      <div className={styles.grid}>
        {/* Left Column: Details & Docs */}
        <div className={styles.mainCol}>
          <div className="card mb-6">
            <h2 className="card-title">Invoice Summary</h2>
            <div className={styles.metaList}>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Total Payable Amount</span>
                <span className={styles.metaValueHighlight}>
                  <MoneyText minorUnits={invoice.amountMinorUnits} currency={invoice.currency} />
                </span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Supplier</span>
                <span className={styles.metaValue}>{invoice.supplier.displayName}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Issue Date</span>
                <span className={styles.metaValue}>{invoice.issueDate}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Due Date</span>
                <span className={styles.metaValue}>{invoice.dueDate}</span>
              </div>
            </div>
          </div>

          {/* Supporting Document View */}
          <div className="card mb-6">
            <h2 className="card-title">Supporting Document</h2>
            {invoice.hasDocument ? (
              <div className={styles.docBox}>
                <div>
                  <div className="font-medium text-sm">Attached Supplier Invoice / Bill</div>
                  <div className="text-xs text-muted">Uploaded by supplier as proof of billing</div>
                </div>
                <a
                  href={documentUrl(invoice.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm"
                  id="view-document-link"
                >
                  View / Download Document ↗
                </a>
              </div>
            ) : (
              <p className="text-muted text-sm">No supporting document was attached to this invoice.</p>
            )}
          </div>

          {/* Commitment View */}
          {invoice.commitment && (
            <div className="card mb-6">
              <h2 className="card-title">Registry Commitment</h2>
              <p className="text-secondary text-sm mb-3">
                Cryptographic commitment registered by the supplier.
              </p>
              <CommitmentView commitment={invoice.commitment} invoiceId={invoice.id} />
            </div>
          )}
        </div>

        {/* Right Column: Registry & Timeline */}
        <div className={styles.sideCol}>
          <div className="card mb-6">
            <h2 className="card-title">Registry & Blockchain</h2>
            <div className="mb-4">
              <ChainBadge
                chainStatus={invoice.registration.chainStatus}
                chainMode={invoice.registration.chainMode}
                txHash={invoice.registration.txHash}
                label="Invoice"
              />
            </div>
            {invoice.acknowledgement && (
              <div className="mt-3">
                <span className="text-xs text-secondary font-medium">Acknowledgement Status:</span>
                <div className="mt-1">
                  <ChainBadge
                    chainStatus={invoice.acknowledgement.chainStatus}
                    chainMode={invoice.registration.chainMode}
                    txHash={invoice.acknowledgement.txHash}
                    label="Ack"
                  />
                </div>
              </div>
            )}
            <p className="text-muted text-xs mt-3">
              Mode: <code>{invoice.registration.chainMode}</code>.
            </p>
          </div>

          <div className="card">
            <h2 className="card-title">Audit Log</h2>
            <AuditTimeline invoiceId={invoice.id} />
          </div>
        </div>
      </div>

      {/* Decision Confirm Dialog */}
      <ConfirmDialog
        isOpen={pendingDecision !== null}
        title={pendingDecision === 'ACKNOWLEDGE' ? 'Acknowledge Invoice' : 'Reject Invoice'}
        confirmLabel={pendingDecision === 'ACKNOWLEDGE' ? 'Confirm Acknowledgement' : 'Confirm Rejection'}
        variant={pendingDecision === 'REJECT' ? 'danger' : 'default'}
        isLoading={actionLoading}
        onConfirm={() => { void handleConfirmDecision(); }}
        onCancel={() => setPendingDecision(null)}
      >
        {pendingDecision === 'ACKNOWLEDGE' ? (
          <div>
            <p className="text-sm text-secondary mb-3">
              By acknowledging this invoice, you confirm that goods or services have been received
              or ordered as described, and that your company recognises the payment obligation due on{' '}
              <strong>{invoice.dueDate}</strong>.
            </p>
            <p className="text-xs text-muted">
              Note: An acknowledgement does not constitute legal payment guarantee or off-platform protection.
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-secondary mb-3">
              Please state why you are rejecting this invoice. The reason will be recorded on the audit log.
            </p>
            <div className="form-group mb-2">
              <label htmlFor="reject-reason" className="label required">
                Rejection Reason
              </label>
              <textarea
                id="reject-reason"
                className="input"
                rows={3}
                placeholder="e.g. Incorrect invoice amount, goods not received, billing dispute"
                value={rejectReason}
                onChange={(e) => {
                  setRejectReason(e.target.value);
                  if (rejectError) setRejectError(null);
                }}
              />
              {rejectError && <p className="text-danger text-xs mt-1">{rejectError}</p>}
            </div>
          </div>
        )}
      </ConfirmDialog>
    </Layout>
  );
}
