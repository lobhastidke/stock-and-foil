/**
 * pages/PledgeReview/index.tsx
 *
 * Financier pledge review & submission page:
 * - Shows invoice summary & commitment
 * - Form to enter advance amount and optional note
 * - Handles 409 DUPLICATE_PLEDGE error with prominent demo callout
 * - Allows checking pledge marker state
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Layout } from '../../components/Layout/Layout.js';
import { StatusBadge } from '../../components/StatusBadge/StatusBadge.js';
import { MoneyText } from '../../components/MoneyText/MoneyText.js';
import { CommitmentView } from '../../components/CommitmentView/CommitmentView.js';
import { ErrorBanner } from '../../components/ErrorBanner/ErrorBanner.js';
import { LoadingState } from '../../components/LoadingState/LoadingState.js';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.js';
import {
  getInvoice,
  createPledge,
  getPledgeMarker,
} from '../../api/endpoints.js';
import { rupeesToMinorUnits, minorUnitsToRupees } from '../../lib/money.js';
import { pledgeFormSchema } from '../../lib/validation.js';
import { ROUTES } from '../../routes.js';
import type { Invoice, PledgeMarkerInfo } from '../../api/types.js';
import { ApiError } from '../../api/client.js';
import styles from './PledgeReview.module.css';

export default function PledgeReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // Form state
  const [advanceRupees, setAdvanceRupees] = useState('');
  const [note, setNote] = useState('');
  const [formErrors, setFormErrors] = useState<{ advance?: string; note?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Duplicate Pledge demo callout state
  const [duplicateMarker, setDuplicateMarker] = useState<string | null>(null);
  const [markerInfo, setMarkerInfo] = useState<PledgeMarkerInfo | null>(null);
  const [checkingMarker, setCheckingMarker] = useState(false);
  const [generalError, setGeneralError] = useState<unknown>(null);

  useEffect(() => {
    async function fetchInvoice() {
      if (!id) return;
      try {
        setError(null);
        const res = await getInvoice(id);
        setInvoice(res.invoice);

        // Pre-fill default advance to 80% of invoice amount as a convenience
        try {
          const totalMinor = BigInt(res.invoice.amountMinorUnits);
          const advanceMinor = (totalMinor * 80n) / 100n;
          setAdvanceRupees(minorUnitsToRupees(advanceMinor.toString()));
        } catch {
          // fallback
        }
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    }
    void fetchInvoice();
  }, [id]);

  function validate() {
    const errs: { advance?: string; note?: string } = {};

    const res = pledgeFormSchema.safeParse({ advance: advanceRupees, note });
    if (!res.success) {
      for (const issue of res.error.issues) {
        if (issue.path[0] === 'advance') errs.advance = issue.message;
        if (issue.path[0] === 'note') errs.note = issue.message;
      }
    }

    if (invoice && !errs.advance) {
      try {
        const converted = rupeesToMinorUnits(advanceRupees);
        if (!converted) {
          errs.advance = 'Invalid amount entered.';
        } else {
          const advMinor = BigInt(converted);
          const invMinor = BigInt(invoice.amountMinorUnits);
          if (advMinor > invMinor) {
            errs.advance = 'Advance amount cannot exceed the total invoice amount.';
          }
        }
      } catch {
        errs.advance = 'Invalid amount entered.';
      }
    }

    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmitClick(e: React.FormEvent) {
    e.preventDefault();
    setGeneralError(null);
    setDuplicateMarker(null);
    if (validate()) {
      setShowConfirm(true);
    }
  }

  async function handleConfirmPledge() {
    if (!id || !invoice) return;

    setSubmitting(true);
    setGeneralError(null);
    setDuplicateMarker(null);
    setMarkerInfo(null);

    try {
      const minor = rupeesToMinorUnits(advanceRupees) ?? '0';
      const res = await createPledge(id, {
        advanceMinorUnits: minor,
        note: note.trim() || undefined,
      });

      setShowConfirm(false);
      navigate(ROUTES.pledgeStatus(res.pledge.id));
    } catch (err) {
      setShowConfirm(false);
      if (err instanceof ApiError && err.code === 'DUPLICATE_PLEDGE') {
        const details = err.details as { pledgeMarker?: string } | undefined;
        setDuplicateMarker(details?.pledgeMarker ?? 'unknown');
      } else {
        setGeneralError(err);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCheckMarker() {
    if (!duplicateMarker || duplicateMarker === 'unknown') return;
    setCheckingMarker(true);
    try {
      const info = await getPledgeMarker(duplicateMarker);
      setMarkerInfo(info);
    } catch (err) {
      setGeneralError(err);
    } finally {
      setCheckingMarker(false);
    }
  }

  if (loading) {
    return (
      <Layout>
        <LoadingState message="Loading invoice for financing…" />
      </Layout>
    );
  }

  if (error || !invoice) {
    return (
      <Layout>
        <div className="mb-6">
          <Link to={ROUTES.financierDashboard} className="btn btn-ghost btn-sm">
            ← Back to Financier Portal
          </Link>
        </div>
        <ErrorBanner error={error ?? new Error('Invoice not found')} />
      </Layout>
    );
  }

  const isAvailable = invoice.status === 'AVAILABLE';

  return (
    <Layout>
      <div className="mb-4">
        <Link to={ROUTES.financierDashboard} className="btn btn-ghost btn-sm">
          ← Back to Financier Portal
        </Link>
      </div>

      {Boolean(generalError) && <ErrorBanner error={generalError} />}

      {/* Duplicate Pledge Demo Callout */}
      {duplicateMarker && (
        <div className={styles.duplicateAlert} role="alert" id="duplicate-pledge-banner">
          <div className={styles.duplicateAlertHeader}>
            <span className={styles.duplicateIcon}>🛡️</span>
            <div>
              <h2 className={styles.duplicateTitle}>409 DUPLICATE_PLEDGE — Double Financing Prevented!</h2>
              <p className={styles.duplicateText}>
                The registry rejected this pledge because another financier has already registered a financing
                pledge against this invoice&apos;s commitment marker. This is the core integrity guarantee of Stock &amp; Foil.
              </p>
            </div>
          </div>

          <div className={styles.duplicateDetails}>
            <div className="text-xs text-muted font-medium mb-1">REJECTED PLEDGE MARKER:</div>
            <code className="code-block text-xs">{duplicateMarker}</code>

            <div className="mt-3 flex gap-3 items-center">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => { void handleCheckMarker(); }}
                disabled={checkingMarker}
              >
                {checkingMarker ? 'Querying registry…' : 'Inspect Marker on Registry'}
              </button>
            </div>

            {markerInfo && (
              <div className={styles.markerResult}>
                <div className="font-semibold text-xs mb-1">REGISTRY VERIFICATION RESULT:</div>
                <div className="text-xs">
                  Marker Status: <strong>{markerInfo.used ? 'USED / COMMITTED' : 'UNUSED'}</strong>
                  {markerInfo.status && (
                    <span> · Pledge State: <strong>{markerInfo.status}</strong></span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="page-header">
        <div>
          <div className={styles.titleRow}>
            <h1 className="page-title">Finance Invoice {invoice.invoiceNumber}</h1>
            <StatusBadge status={invoice.status} />
          </div>
          <p className="text-secondary text-sm mt-1">
            Issued by {invoice.supplier.displayName} to {invoice.buyer.displayName}
          </p>
        </div>
      </div>

      <div className={styles.grid}>
        {/* Left Column: Form */}
        <div className={styles.mainCol}>
          <div className="card mb-6">
            <h2 className="card-title">Pledge Details</h2>

            {!isAvailable ? (
              <div className={styles.unavailableWarning}>
                <p className="font-semibold text-sm">This invoice is not available for financing.</p>
                <p className="text-xs text-muted mt-1">
                  Current invoice status is <strong>{invoice.status}</strong>. Invoices must be in{' '}
                  <strong>AVAILABLE</strong> status (released by supplier after buyer acknowledgement) to accept pledges.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitClick}>
                <div className="form-group mb-4">
                  <label htmlFor="advance-amount" className="label required">
                    Financing Advance Amount (₹)
                  </label>
                  <input
                    id="advance-amount"
                    type="text"
                    className={`input ${formErrors.advance ? 'input-error' : ''}`}
                    placeholder="e.g. 4000.00"
                    value={advanceRupees}
                    onChange={(e) => {
                      setAdvanceRupees(e.target.value);
                      if (formErrors.advance) setFormErrors({ ...formErrors, advance: undefined });
                    }}
                  />
                  {formErrors.advance ? (
                    <p className="text-danger text-xs mt-1">{formErrors.advance}</p>
                  ) : (
                    <p className="text-muted text-xs mt-1">
                      Total invoice value is <MoneyText minorUnits={invoice.amountMinorUnits} currency={invoice.currency} />.
                    </p>
                  )}
                </div>

                <div className="form-group mb-6">
                  <label htmlFor="pledge-note" className="label">
                    Financier Note (Optional)
                  </label>
                  <input
                    id="pledge-note"
                    type="text"
                    className={`input ${formErrors.note ? 'input-error' : ''}`}
                    placeholder="e.g. Approved under facility agreement #481"
                    value={note}
                    onChange={(e) => {
                      setNote(e.target.value);
                      if (formErrors.note) setFormErrors({ ...formErrors, note: undefined });
                    }}
                  />
                  {formErrors.note && <p className="text-danger text-xs mt-1">{formErrors.note}</p>}
                </div>

                <button
                  type="submit"
                  className="btn btn-primary w-full"
                  id="submit-pledge-btn"
                  disabled={submitting}
                >
                  🚀 Review & Register Pledge
                </button>
              </form>
            )}
          </div>

          {/* Cryptographic Commitment Verification */}
          {invoice.commitment && (
            <div className="card">
              <h2 className="card-title">Off-Chain Commitment</h2>
              <p className="text-secondary text-sm mb-3">
                Confidential invoice data remains off-chain. The hash below ensures integrity and anchors the pledge marker.
              </p>
              <CommitmentView commitment={invoice.commitment} invoiceId={invoice.id} />
            </div>
          )}
        </div>

        {/* Right Column: Invoice Summary Card */}
        <div className={styles.sideCol}>
          <div className="card mb-6">
            <h2 className="card-title">Invoice Summary</h2>
            <div className={styles.metaList}>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Invoice Face Value</span>
                <span className={styles.metaValueHighlight}>
                  <MoneyText minorUnits={invoice.amountMinorUnits} currency={invoice.currency} />
                </span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Supplier</span>
                <span className={styles.metaValue}>{invoice.supplier.displayName}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Buyer</span>
                <span className={styles.metaValue}>{invoice.buyer.displayName}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaLabel}>Due Date</span>
                <span className={styles.metaValue}>{invoice.dueDate}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="card-title">Honest Limits & Protections</h2>
            <ul className="text-xs text-secondary space-y-2">
              <li>✓ Duplicate prevention protects against double-pledging within the Stock &amp; Foil registry.</li>
              <li>⚠ Duplicate prevention does not monitor external or third-party registries.</li>
              <li>⚠ All disbursement and loans in this demo are simulated with synthetic data.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Confirm Pledge Dialog */}
      <ConfirmDialog
        isOpen={showConfirm}
        title="Confirm Financing Pledge"
        confirmLabel="Register Financing Pledge"
        isLoading={submitting}
        onConfirm={() => { void handleConfirmPledge(); }}
        onCancel={() => setShowConfirm(false)}
      >
        <p className="text-sm text-secondary mb-3">
          You are registering a financing pledge of <strong>₹{advanceRupees}</strong> against invoice{' '}
          <strong>{invoice.invoiceNumber}</strong>.
        </p>
        <p className="text-xs text-muted">
          This will register the unique pledge marker on the registry and lock the invoice from any other financing claims.
        </p>
      </ConfirmDialog>
    </Layout>
  );
}
