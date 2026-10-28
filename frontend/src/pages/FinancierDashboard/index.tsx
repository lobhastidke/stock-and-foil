/**
 * pages/FinancierDashboard/index.tsx
 *
 * Financier dashboard:
 * - Two main views: Available Invoices (ready to pledge) & My Pledges (active/settled pledges)
 * - Highlights duplicate prevention feature & honest limits
 * - Direct links to PledgeReview and PledgeStatus
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../../components/Layout/Layout.js';
import { StatusBadge } from '../../components/StatusBadge/StatusBadge.js';
import { ChainBadge } from '../../components/ChainBadge/ChainBadge.js';
import { MoneyText } from '../../components/MoneyText/MoneyText.js';
import { LoadingState } from '../../components/LoadingState/LoadingState.js';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { ErrorBanner } from '../../components/ErrorBanner/ErrorBanner.js';
import { useAsync } from '../../hooks/useAsync.js';
import { listInvoices, listMyPledges } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthContext.js';
import { ROUTES } from '../../routes.js';
import styles from './FinancierDashboard.module.css';

type DashboardTab = 'AVAILABLE' | 'MY_PLEDGES' | 'ALL_INVOICES';

export default function FinancierDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState<DashboardTab>('AVAILABLE');

  // Load available invoices
  const {
    data: invoicesData,
    loading: invoicesLoading,
    error: invoicesError,
  } = useAsync(
    () => listInvoices(tab === 'AVAILABLE' ? { status: 'AVAILABLE' } : {}),
    [tab],
  );

  // Load my pledges
  const {
    data: pledgesData,
    loading: pledgesLoading,
    error: pledgesError,
  } = useAsync(
    () => listMyPledges(),
    [tab],
  );

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Financier Portal</h1>
          <p className="text-secondary text-sm mt-1">
            Welcome, {user?.displayName}. Discover verified invoices released for receivables financing.
          </p>
        </div>
      </div>

      {/* Hero Notice for Duplicate Prevention Demo */}
      <div className={styles.demoCallout}>
        <div className={styles.demoCalloutIcon}>🛡️</div>
        <div>
          <div className={styles.demoCalloutTitle}>Built-In Double-Financing Prevention</div>
          <p className={styles.demoCalloutText}>
            Every invoice commitment generates a unique <code>pledgeMarker</code>. The registry rejects any subsequent
            financing pledge on the same commitment with <code>409 DUPLICATE_PLEDGE</code>.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'AVAILABLE'}
          className={`${styles.tab} ${tab === 'AVAILABLE' ? styles.tabActive : ''}`}
          onClick={() => setTab('AVAILABLE')}
        >
          Available Invoices
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'MY_PLEDGES'}
          className={`${styles.tab} ${tab === 'MY_PLEDGES' ? styles.tabActive : ''}`}
          onClick={() => setTab('MY_PLEDGES')}
        >
          My Pledges {pledgesData?.items ? `(${pledgesData.items.length})` : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'ALL_INVOICES'}
          className={`${styles.tab} ${tab === 'ALL_INVOICES' ? styles.tabActive : ''}`}
          onClick={() => setTab('ALL_INVOICES')}
        >
          All Invoices
        </button>
      </div>

      {/* View: Available or All Invoices */}
      {(tab === 'AVAILABLE' || tab === 'ALL_INVOICES') && (
        <>
          {invoicesError && <ErrorBanner error={invoicesError} />}
          {invoicesLoading && <LoadingState message="Loading invoices…" />}

          {!invoicesLoading && !invoicesError && invoicesData && (
            <>
              {invoicesData.items.length === 0 ? (
                <EmptyState
                  icon="🏷️"
                  title="No invoices available"
                  description={
                    tab === 'AVAILABLE'
                      ? 'There are currently no invoices released for financing. Check back after suppliers release acknowledged invoices.'
                      : 'No invoices found.'
                  }
                />
              ) : (
                <div className={styles.grid}>
                  {invoicesData.items.map((inv) => {
                    const isAvailable = inv.status === 'AVAILABLE';
                    return (
                      <div key={inv.id} className={styles.card}>
                        <div className={styles.cardHeader}>
                          <span className={styles.invoiceNumber}>{inv.invoiceNumber}</span>
                          <StatusBadge status={inv.status} />
                        </div>

                        <div className={styles.cardAmount}>
                          <MoneyText minorUnits={inv.amountMinorUnits} currency={inv.currency} />
                        </div>

                        <div className={styles.cardMeta}>
                          <div>
                            <span className={styles.metaLabel}>Buyer:</span> {inv.buyer.displayName}
                          </div>
                          <div>
                            <span className={styles.metaLabel}>Supplier:</span> {inv.supplier.displayName}
                          </div>
                          <div>
                            <span className={styles.metaLabel}>Due:</span> {inv.dueDate}
                          </div>
                        </div>

                        <div className={styles.cardFooter}>
                          {isAvailable ? (
                            <Link
                              to={ROUTES.pledgeReview(inv.id)}
                              className="btn btn-primary btn-sm w-full"
                              id={`pledge-btn-${inv.id}`}
                            >
                              💰 Review & Pledge
                            </Link>
                          ) : (
                            <Link
                              to={ROUTES.pledgeReview(inv.id)}
                              className="btn btn-secondary btn-sm w-full"
                            >
                              View Details
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className={styles.totalCount}>
                Showing {invoicesData.items.length} of {invoicesData.total} invoice{invoicesData.total !== 1 ? 's' : ''}
              </p>
            </>
          )}
        </>
      )}

      {/* View: My Pledges */}
      {tab === 'MY_PLEDGES' && (
        <>
          {pledgesError && <ErrorBanner error={pledgesError} />}
          {pledgesLoading && <LoadingState message="Loading your pledges…" />}

          {!pledgesLoading && !pledgesError && pledgesData && (
            <>
              {pledgesData.items.length === 0 ? (
                <EmptyState
                  icon="💼"
                  title="No pledges yet"
                  description="You haven't financed any invoices yet. Switch to Available Invoices to place your first pledge."
                  action={
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => setTab('AVAILABLE')}
                    >
                      Browse Available Invoices
                    </button>
                  }
                />
              ) : (
                <div className={styles.pledgeGrid}>
                  {pledgesData.items.map((pledge) => (
                    <Link
                      key={pledge.id}
                      to={ROUTES.pledgeStatus(pledge.id)}
                      className={styles.pledgeCard}
                      id={`pledge-card-${pledge.id}`}
                    >
                      <div className={styles.pledgeCardHeader}>
                        <div>
                          <div className="text-xs text-muted">PLEDGE ID</div>
                          <code className="text-xs font-mono">{pledge.id.slice(0, 8)}…</code>
                        </div>
                        <span className={`badge badge-${pledge.status.toLowerCase()}`}>
                          {pledge.status}
                        </span>
                      </div>

                      <div className={styles.pledgeAmount}>
                        <div className="text-xs text-muted mb-1">Advance Amount</div>
                        <MoneyText minorUnits={pledge.advanceMinorUnits} />
                      </div>

                      <div className="mb-3">
                        <ChainBadge
                          chainStatus={pledge.blockchainStatus}
                          chainMode={pledge.chainMode}
                          txHash={pledge.blockchainTxHash}
                        />
                      </div>

                      {pledge.note && (
                        <p className="text-xs text-secondary italic mb-3">
                          &quot;{pledge.note}&quot;
                        </p>
                      )}

                      <div className={styles.cardFooter}>
                        <span className="text-xs text-primary font-medium">
                          View Status & Settle →
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </Layout>
  );
}
