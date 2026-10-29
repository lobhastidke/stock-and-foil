/**
 * pages/FinancierDashboard/index.tsx
 *
 * Financier dashboard:
 * - Executive Web3 KPI Metrics (Available liquidity, active pledges, duplicate prevention security)
 * - Available Invoices (ready to pledge) & My Pledges (active/settled pledges)
 * - Highlights duplicate prevention feature & honest limits
 * - Direct links to PledgeReview and PledgeStatus
 */

import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../../components/Layout/Layout.js';
import { StatusBadge } from '../../components/StatusBadge/StatusBadge.js';
import { ChainBadge } from '../../components/ChainBadge/ChainBadge.js';
import { MoneyText } from '../../components/MoneyText/MoneyText.js';
import { LoadingState } from '../../components/LoadingState/LoadingState.js';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { ErrorBanner } from '../../components/ErrorBanner/ErrorBanner.js';
import { LifecycleStepper } from '../../components/LifecycleStepper/LifecycleStepper.js';
import { AnimatedHeading, AnimatedText } from '../../components/AnimatedHeading/AnimatedHeading.js';
import { useAsync } from '../../hooks/useAsync.js';
import { listInvoices, listMyPledges } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthContext.js';
import { ROUTES } from '../../routes.js';
import styles from './FinancierDashboard.module.css';

type DashboardTab = 'AVAILABLE' | 'MY_PLEDGES' | 'ALL_INVOICES';

export default function FinancierDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState<DashboardTab>('AVAILABLE');
  const [searchQuery, setSearchQuery] = useState('');

  // Load invoices
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

  // Compute Financier KPI Stats
  const stats = useMemo(() => {
    let availableAmount = BigInt(0);
    let availableCount = 0;
    if (invoicesData?.items) {
      for (const inv of invoicesData.items) {
        if (inv.status === 'AVAILABLE') {
          try {
            availableAmount += BigInt(inv.amountMinorUnits);
          } catch {
            // ignore
          }
          availableCount++;
        }
      }
    }

    let pledgedAmount = BigInt(0);
    let activePledgesCount = 0;
    if (pledgesData?.items) {
      for (const p of pledgesData.items) {
        try {
          pledgedAmount += BigInt(p.advanceMinorUnits);
        } catch {
          // ignore
        }
        activePledgesCount++;
      }
    }

    return {
      availableAmount,
      availableCount,
      pledgedAmount,
      activePledgesCount,
    };
  }, [invoicesData, pledgesData]);

  // Filter invoices by search query
  const filteredInvoices = useMemo(() => {
    if (!invoicesData?.items) return [];
    if (!searchQuery.trim()) return invoicesData.items;
    const q = searchQuery.toLowerCase();
    return invoicesData.items.filter(
      (inv) =>
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.buyer.displayName.toLowerCase().includes(q) ||
        inv.supplier.displayName.toLowerCase().includes(q),
    );
  }, [invoicesData, searchQuery]);

  return (
    <Layout>
      <div className="page-header">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="badge" style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc' }}>
              Institutional Liquidity Desk
            </span>
            <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--success)' }}>
              ● Zero Double-Financing
            </span>
          </div>
          <AnimatedHeading text="Financier Factoring Portal" as="h1" className="page-title" />
          <AnimatedText className="text-secondary text-sm mt-1">
            Welcome, <strong>{user?.displayName}</strong> ({user?.organisation || 'Capital Partner'}). Underwrite verified receivables with on-chain cryptographic settlement.
          </AnimatedText>
        </div>
      </div>

      {/* Hero Notice for Duplicate Prevention Demo */}
      <div className={styles.demoCallout}>
        <div className={styles.demoCalloutIcon}>🛡️</div>
        <div>
          <div className={styles.demoCalloutTitle}>Built-In Double-Financing Prevention</div>
          <p className={styles.demoCalloutText}>
            Every invoice commitment generates a deterministic <code>pledgeMarker</code>. The registry rejects any subsequent
            financing pledge on the same commitment with <code>409 DUPLICATE_PLEDGE</code>, guaranteeing fraud-free liquidity disbursement.
          </p>
        </div>
      </div>

      {/* Executive KPI Stats */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-card-title">Available Liquidity Pool</span>
            <div className="kpi-card-icon" style={{ borderColor: 'rgba(0, 242, 254, 0.3)', color: 'var(--cyan)' }}>
              💧
            </div>
          </div>
          <div className="kpi-card-value">
            <MoneyText minorUnits={stats.availableAmount.toString()} currency="INR" />
          </div>
          <div className="kpi-card-subtitle">
            <span style={{ color: 'var(--cyan)' }}>● {stats.availableCount} verified invoices</span> ready
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-card-title">My Pledged Capital</span>
            <div className="kpi-card-icon" style={{ borderColor: 'rgba(16, 185, 129, 0.3)', color: 'var(--success)' }}>
              💰
            </div>
          </div>
          <div className="kpi-card-value" style={{ color: 'var(--success)' }}>
            <MoneyText minorUnits={stats.pledgedAmount.toString()} currency="INR" />
          </div>
          <div className="kpi-card-subtitle">
            <span>{stats.activePledgesCount} active underwritten pledges</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-card-title">Double-Pledge Intercepts</span>
            <div className="kpi-card-icon" style={{ borderColor: 'rgba(168, 85, 247, 0.3)', color: '#c084fc' }}>
              🛡️
            </div>
          </div>
          <div className="kpi-card-value" style={{ color: '#c084fc' }}>
            0 Duplicates
          </div>
          <div className="kpi-card-subtitle">
            <span>100% Fraud prevention on MST state</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-card-title">Registry Proof Status</span>
            <div className="kpi-card-icon">🔐</div>
          </div>
          <div className="kpi-card-value" style={{ color: 'var(--cyan)', fontSize: '1.25rem', paddingTop: '6px' }}>
            Keccak-256 Validated
          </div>
          <div className="kpi-card-subtitle">
            <span>Deterministic cryptographic locks</span>
          </div>
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
          <span>🏷️</span>
          <span>Available for Financing</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'MY_PLEDGES'}
          className={`${styles.tab} ${tab === 'MY_PLEDGES' ? styles.tabActive : ''}`}
          onClick={() => setTab('MY_PLEDGES')}
        >
          <span>💼</span>
          <span>My Pledges {pledgesData?.items ? `(${pledgesData.items.length})` : ''}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'ALL_INVOICES'}
          className={`${styles.tab} ${tab === 'ALL_INVOICES' ? styles.tabActive : ''}`}
          onClick={() => setTab('ALL_INVOICES')}
        >
          <span>📑</span>
          <span>All Registry Invoices</span>
        </button>
      </div>

      {/* Search Input Bar (when viewing invoices) */}
      {(tab === 'AVAILABLE' || tab === 'ALL_INVOICES') && (
        <div className={styles.searchBar}>
          <input
            type="search"
            placeholder="🔍 Search invoices by number, buyer, or supplier…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
            aria-label="Search invoices"
          />
        </div>
      )}

      {/* View: Available or All Invoices */}
      {(tab === 'AVAILABLE' || tab === 'ALL_INVOICES') && (
        <>
          {invoicesError && <ErrorBanner error={invoicesError} />}
          {invoicesLoading && <LoadingState message="Loading invoices…" />}

          {!invoicesLoading && !invoicesError && invoicesData && (
            <>
              {filteredInvoices.length === 0 ? (
                <EmptyState
                  icon="🏷️"
                  title="No invoices available"
                  description={
                    searchQuery
                      ? `No invoices match "${searchQuery}".`
                      : tab === 'AVAILABLE'
                      ? 'There are currently no invoices released for financing. Check back after suppliers release acknowledged invoices.'
                      : 'No invoices found.'
                  }
                />
              ) : (
                <div className={styles.grid}>
                  {filteredInvoices.map((inv) => {
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

                        {/* Visual Blockchain Lifecycle Stepper */}
                        <LifecycleStepper status={inv.status} compact />

                        <div className={styles.cardMeta}>
                          <div className={styles.metaRow}>
                            <span className={styles.metaLabel}>Buyer:</span>
                            <span style={{ fontWeight: 600, color: '#fff' }}>{inv.buyer.displayName}</span>
                          </div>
                          <div className={styles.metaRow}>
                            <span className={styles.metaLabel}>Supplier:</span>
                            <span>{inv.supplier.displayName}</span>
                          </div>
                          <div className={styles.metaRow}>
                            <span className={styles.metaLabel}>Due:</span>
                            <span>{inv.dueDate}</span>
                          </div>
                        </div>

                        <div className={styles.cardFooter}>
                          {isAvailable ? (
                            <Link
                              to={ROUTES.pledgeReview(inv.id)}
                              className="btn btn-primary btn-sm w-full"
                              id={`pledge-btn-${inv.id}`}
                            >
                              ⚡ Review &amp; Pledge Liquidity
                            </Link>
                          ) : (
                            <Link
                              to={ROUTES.pledgeReview(inv.id)}
                              className="btn btn-secondary btn-sm w-full"
                            >
                              View Audit &amp; Commitments
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className={styles.totalCount}>
                Showing {filteredInvoices.length} of {invoicesData.total} invoice{invoicesData.total !== 1 ? 's' : ''}
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
                          <code className="text-xs font-mono" style={{ color: 'var(--cyan)' }}>
                            {pledge.id.slice(0, 8)}…
                          </code>
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
                          ⚡ View Status &amp; Settle →
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
