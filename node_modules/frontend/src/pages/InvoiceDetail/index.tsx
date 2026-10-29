/**
 * pages/InvoiceDetail/index.tsx
 *
 * Full detail view for an invoice:
 * - Details & status
 * - Supporting document upload & download
 * - Commit invoice (DRAFT -> PENDING_ACK)
 * - Release invoice (ACKNOWLEDGED -> AVAILABLE)
 * - Commitment verification view
 * - Chain badge & registration status
 * - Pledges list (if supplier)
 * - Audit timeline
 */

import React, { useState, useEffect, useRef } from 'react';
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
  commitInvoice,
  releaseInvoice,
  uploadDocument,
  documentUrl,
  listInvoicePledges,
} from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthContext.js';
import { ROUTES } from '../../routes.js';
import type { Invoice, Pledge } from '../../api/types.js';
import styles from './InvoiceDetail.module.css';

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [pledges, setPledges] = useState<Pledge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Dialogs
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [showReleaseDialog, setShowReleaseDialog] = useState(false);

  // File upload state
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  async function loadData() {
    if (!id) return;
    try {
      setError(null);
      const res = await getInvoice(id);
      setInvoice(res.invoice);

      if (user?.role === 'SUPPLIER' && (res.invoice.status === 'PLEDGED' || res.invoice.status === 'SETTLED')) {
        try {
          const pl = await listInvoicePledges(id);
          setPledges(pl);
        } catch {
          // ignore pledge fetch error for non-pledged
        }
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [id, user?.role]);

  // Polling while registration is PENDING
  useEffect(() => {
    if (!invoice || invoice.registration.chainStatus !== 'PENDING') return;
    const interval = setInterval(() => {
      void loadData();
    }, 5000);
    return () => clearInterval(interval);
  }, [invoice?.registration.chainStatus]);

  async function handleCommit() {
    if (!id) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await commitInvoice(id);
      setInvoice(res.invoice);
      setShowCommitDialog(false);
    } catch (err) {
      setActionError(err);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRelease() {
    if (!id) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await releaseInvoice(id);
      setInvoice(res.invoice);
      setShowReleaseDialog(false);
    } catch (err) {
      setActionError(err);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;

    if (file.size > 3 * 1024 * 1024) {
      setActionError(new Error('File size exceeds 3 MB limit.'));
      return;
    }

    const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      setActionError(new Error('Only PDF, PNG, and JPG files are supported.'));
      return;
    }

    setUploadingDoc(true);
    setActionError(null);
    setUploadSuccess(false);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const result = reader.result as string;
          // Split off data URL prefix to get raw base64
          const base64Content = result.includes(',') ? result.split(',')[1] : result;
          await uploadDocument(id, {
            filename: file.name,
            mimeType: file.type,
            contentBase64: base64Content,
          });
          setUploadSuccess(true);
          await loadData();
        } catch (err) {
          setActionError(err);
        } finally {
          setUploadingDoc(false);
        }
      };
      reader.onerror = () => {
        setActionError(new Error('Failed to read file.'));
        setUploadingDoc(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setActionError(err);
      setUploadingDoc(false);
    }
  }

  if (loading) {
    return (
      <Layout>
        <LoadingState message="Loading invoice details…" />
      </Layout>
    );
  }

  if (error || !invoice) {
    return (
      <Layout>
        <div className="mb-6">
          <Link to={ROUTES.supplierDashboard} className="btn btn-ghost btn-sm">
            ← Back to Invoices
          </Link>
        </div>
        <ErrorBanner error={error ?? new Error('Invoice not found')} />
      </Layout>
    );
  }

  const isSupplier = user?.role === 'SUPPLIER';
  const canCommit = isSupplier && invoice.status === 'DRAFT';
  const canRelease = isSupplier && invoice.status === 'ACKNOWLEDGED';
  const canUploadDoc = isSupplier && invoice.status === 'DRAFT';

  return (
    <Layout>
      <div className="mb-4">
        <Link to={ROUTES.supplierDashboard} className="btn btn-ghost btn-sm">
          ← Back to Invoices
        </Link>
      </div>

      {Boolean(actionError) && <ErrorBanner error={actionError} />}

      <div className="page-header">
        <div>
          <div className={styles.titleRow}>
            <AnimatedHeading text={invoice.invoiceNumber} as="h1" className="page-title" />
            <StatusBadge status={invoice.status} />
          </div>
          <p className="text-secondary text-sm mt-1">
            Created on {new Date(invoice.createdAt).toLocaleDateString()} · Due on {invoice.dueDate}
          </p>
        </div>

        <div className={styles.headerActions}>
          {canCommit && (
            <button
              type="button"
              className="btn btn-primary"
              id="commit-btn"
              onClick={() => setShowCommitDialog(true)}
            >
              🔐 Commit Invoice
            </button>
          )}

          {canRelease && (
            <button
              type="button"
              className="btn btn-primary"
              id="release-btn"
              onClick={() => setShowReleaseDialog(true)}
            >
              🚀 Release for Financing
            </button>
          )}
        </div>
      </div>

      <div className="mb-6">
        <LifecycleStepper status={invoice.status} />
      </div>

      <div className={styles.grid}>
        {/* Left Column: Financials & Parties */}
        <div className={styles.mainCol}>
          <div className="card mb-6">
            <h2 className="card-title">Invoice Details</h2>
            <div className={styles.metaList}>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Invoice Amount</span>
                <span className={styles.metaValueHighlight}>
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
                <span className={styles.metaLabel}>Issue Date</span>
                <span className={styles.metaValue}>{invoice.issueDate}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Due Date</span>
                <span className={styles.metaValue}>{invoice.dueDate}</span>
              </div>
            </div>
          </div>

          {/* Cryptographic Commitment */}
          <div className="card mb-6">
            <h2 className="card-title">Registry Commitment</h2>
            <p className="text-secondary text-sm mb-4">
              A keccak256 hash representing confidential invoice data off-chain.
              Prevents double financing without exposing sensitive figures.
            </p>
            {invoice.commitment ? (
              <CommitmentView commitment={invoice.commitment} invoiceId={invoice.id} />
            ) : (
              <div className={styles.noCommitment}>
                <span className="text-muted">
                  No commitment generated yet. Click &quot;Commit Invoice&quot; to hash and register.
                </span>
              </div>
            )}
          </div>

          {/* Supporting Document */}
          <div className="card mb-6">
            <h2 className="card-title">Supporting Document</h2>
            <div className={styles.docSection}>
              {invoice.hasDocument ? (
                <div className={styles.docAvailable}>
                  <span>📄 Supporting document is attached.</span>
                  <a
                    href={documentUrl(invoice.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm"
                    id="view-doc-btn"
                  >
                    View / Download
                  </a>
                </div>
              ) : (
                <p className="text-muted text-sm mb-3">No document uploaded yet.</p>
              )}

              {canUploadDoc && (
                <div className="mt-4 pt-4 border-top">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => { void handleFileSelect(e); }}
                    accept=".pdf,.png,.jpg,.jpeg"
                    style={{ display: 'none' }}
                    id="doc-upload-input"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingDoc}
                    id="upload-doc-btn"
                  >
                    {uploadingDoc ? 'Uploading…' : invoice.hasDocument ? 'Replace Document' : '+ Upload Document'}
                  </button>
                  <span className="text-muted text-xs ml-3">PDF, PNG, JPG up to 3 MB</span>
                  {uploadSuccess && (
                    <span className="text-success text-xs ml-3 font-medium">✓ Uploaded successfully</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Pledges Section for Supplier */}
          {pledges.length > 0 && (
            <div className="card mb-6">
              <h2 className="card-title">Financing Pledges</h2>
              <div className={styles.pledgeList}>
                {pledges.map((pl) => (
                  <div key={pl.id} className={styles.pledgeItem}>
                    <div>
                      <div className="font-semibold">
                        <MoneyText minorUnits={pl.advanceMinorUnits} /> advance
                      </div>
                      <div className="text-xs text-muted">
                        Pledge Status: <span className="font-medium text-primary">{pl.status}</span>
                      </div>
                    </div>
                    <ChainBadge
                      chainStatus={pl.blockchainStatus}
                      chainMode={pl.chainMode}
                      txHash={pl.blockchainTxHash}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Blockchain Status & Audit Trail */}
        <div className={styles.sideCol}>
          <div className="card mb-6">
            <h2 className="card-title">Blockchain Status</h2>
            <div className="mb-4">
              <ChainBadge
                chainStatus={invoice.registration.chainStatus}
                chainMode={invoice.registration.chainMode}
                txHash={invoice.registration.txHash}
                label="Registration"
              />
            </div>
            {invoice.acknowledgement && (
              <div className="mt-3">
                <span className="text-xs text-secondary font-medium">Acknowledgement Chain Status:</span>
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
              Mode: <code>{invoice.registration.chainMode}</code>. Only markers and hashes are placed on-chain.
            </p>
          </div>

          {/* Buyer Acknowledgement info */}
          {invoice.acknowledgement && (
            <div className="card mb-6">
              <h2 className="card-title">Buyer Response</h2>
              <p className="text-sm">
                <strong>Decision:</strong>{' '}
                <span className={invoice.acknowledgement.decision === 'ACKNOWLEDGE' ? 'text-success' : 'text-danger'}>
                  {invoice.acknowledgement.decision}
                </span>
              </p>
              {invoice.acknowledgement.reason && (
                <p className="text-xs text-secondary mt-1">
                  Reason: &quot;{invoice.acknowledgement.reason}&quot;
                </p>
              )}
              <p className="text-xs text-muted mt-2">
                Recorded on {new Date(invoice.acknowledgement.createdAt).toLocaleString()}
              </p>
            </div>
          )}

          {/* Audit Timeline */}
          <div className="card">
            <h2 className="card-title">Audit History</h2>
            <AuditTimeline invoiceId={invoice.id} />
          </div>
        </div>
      </div>

      {/* Commit Confirm Dialog */}
      <ConfirmDialog
        isOpen={showCommitDialog}
        title="Commit Invoice"
        confirmLabel="Commit & Register"
        isLoading={actionLoading}
        onConfirm={() => { void handleCommit(); }}
        onCancel={() => setShowCommitDialog(false)}
      >
        <p className="text-sm text-secondary mb-3">
          Committing calculates the cryptographic hash (keccak256) of canonical invoice fields
          with a secure random salt, lock the fields from edits, and submits the commitment to
          the registry for buyer acknowledgement.
        </p>
        <p className="text-xs text-muted">
          Once committed, invoice amounts and dates cannot be modified.
        </p>
      </ConfirmDialog>

      {/* Release Confirm Dialog */}
      <ConfirmDialog
        isOpen={showReleaseDialog}
        title="Release Invoice for Financing"
        confirmLabel="Release to Financiers"
        isLoading={actionLoading}
        onConfirm={() => { void handleRelease(); }}
        onCancel={() => setShowReleaseDialog(false)}
      >
        <p className="text-sm text-secondary mb-3">
          Releasing marks this invoice as <strong>AVAILABLE</strong> in the registry.
          Financiers will be able to review the commitment and submit a financing pledge.
        </p>
      </ConfirmDialog>
    </Layout>
  );
}
