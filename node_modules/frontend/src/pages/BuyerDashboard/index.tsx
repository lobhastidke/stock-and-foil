/**
 * pages/BuyerDashboard/index.tsx
 *
 * Buyer dashboard:
 * - Lists invoices assigned to this buyer
 * - Filter pills (All, Awaiting Response, Acknowledged, etc.)
 * - Prominent "Action Required" indicator for PENDING_ACK
 * - Direct navigation to AcknowledgeInvoice page
 */

import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../../components/Layout/Layout.js';
import { StatusBadge } from '../../components/StatusBadge/StatusBadge.js';
import { MoneyText } from '../../components/MoneyText/MoneyText.js';
import { LoadingState } from '../../components/LoadingState/LoadingState.js';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { ErrorBanner } from '../../components/ErrorBanner/ErrorBanner.js';
import { LifecycleStepper } from '../../components/LifecycleStepper/LifecycleStepper.js';
import { AnimatedHeading, AnimatedText } from '../../components/AnimatedHeading/AnimatedHeading.js';
import { useAsync } from '../../hooks/useAsync.js';
import { listInvoices } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthContext.js';
import { ROUTES } from '../../routes.js';
import type { InvoiceStatus } from '../../api/types.js';
import styles from './BuyerDashboard.module.css';

const BUYER_FILTERS: { value: InvoiceStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All Invoices' },
  { value: 'PENDING_ACK', label: 'Action Required' },
  { value: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'AVAILABLE', label: 'Released' },
  { value: 'PLEDGED', label: 'Pledged' },
  { value: 'SETTLED', label: 'Settled' },
];

export default function BuyerDashboard() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<InvoiceStatus | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, loading, error } = useAsync(
    () => listInvoices(filter === 'ALL' ? {} : { status: filter }),
    [filter],
  );

  // Compute Buyer KPI Stats
  const stats = useMemo(() => {
    if (!data?.items) {
      return { totalLiability: BigInt(0), pendingCount: 0, ackCount: 0, settledCount: 0 };
    }
    let total = BigInt(0);
    let pending = 0;
    let ack = 0;
    let settled = 0;

    for (const inv of data.items) {
      try {
        total += BigInt(inv.amountMinorUnits);
      } catch {
        // ignore
      }
      if (inv.status === 'PENDING_ACK') pending++;
      if (inv.status === 'ACKNOWLEDGED' || inv.status === 'AVAILABLE' || inv.status === 'PLEDGED') ack++;
      if (inv.status === 'SETTLED') settled++;
    }

    return { totalLiability: total, pendingCount: pending, ackCount: ack, settledCount: settled };
  }, [data]);

  // Search filter
  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    if (!searchQuery.trim()) return data.items;
    const q = searchQuery.toLowerCase();
    return data.items.filter(
      (inv) =>
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.supplier.displayName.toLowerCase().includes(q),
    );
  }, [data, searchQuery]);

  return (
    <Layout>
      <div className="page-header">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.2)', color: 'var(--warning)' }}>
              Buyer Multi-Party Signer
            </span>
            <span className="badge" style={{ background: 'rgba(0, 242, 254, 0.15)', color: 'var(--cyan)' }}>
              ● Cryptographic Verification
            </span>
          </div>
          <AnimatedHeading text="Assigned Invoices & Payables" as="h1" className="page-title" />
          <AnimatedText className="text-secondary text-sm mt-1">
            Welcome, <strong>{user?.displayName}</strong> ({user?.organisation || 'Enterprise Buyer'}). Review, sign, or dispute incoming factoring invoices.
          </AnimatedText>
        </div>
      </div>

      {/* Buyer Executive KPI Metrics */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-card-title">Action Required</span>
            <div className="kpi-card-icon" style={{ borderColor: 'rgba(245, 158, 11, 0.3)', color: 'var(--warning)' }}>
              ⚠️
            </div>
          </div>
          <div className="kpi-card-value" style={{ color: stats.pendingCount > 0 ? 'var(--warning)' : '#fff' }}>
            {stats.pendingCount}
          </div>
          <div className="kpi-card-subtitle">
            <span>Invoices awaiting digital sign-off</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-card-title">Total Payables</span>
            <div className="kpi-card-icon">💳</div>
          </div>
          <div className="kpi-card-value">
            <MoneyText minorUnits={stats.totalLiability.toString()} currency="INR" />
          </div>
          <div className="kpi-card-subtitle">
            <span>Total invoice liabilities on registry</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-card-title">Signed &amp; Approved</span>
            <div className="kpi-card-icon" style={{ borderColor: 'rgba(16, 185, 129, 0.3)', color: 'var(--success)' }}>
              ✅
            </div>
          </div>
          <div className="kpi-card-value" style={{ color: 'var(--success)' }}>
            {stats.ackCount}
          </div>
          <div className="kpi-card-subtitle">
            <span>Legitimacy confirmed by buyer</span>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-card-title">Settled Obligations</span>
            <div className="kpi-card-icon" style={{ borderColor: 'rgba(56, 189, 248, 0.3)', color: 'var(--cyan)' }}>
              🏁
            </div>
          </div>
          <div className="kpi-card-value" style={{ color: 'var(--cyan)' }}>
            {stats.settledCount}
          </div>
          <div className="kpi-card-subtitle">
            <span>Payments completed &amp; retired</span>
          </div>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className={styles.searchBar}>
        <input
          type="search"
          placeholder="🔍 Search assigned invoices by number, supplier, or org…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={styles.searchInput}
          aria-label="Search invoices"
        />
      </div>

      {/* Filter pills */}
      <div className={styles.filters} role="group" aria-label="Filter invoices">
        {BUYER_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={`btn btn-sm ${filter === f.value ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(f.value)}
            aria-pressed={filter === f.value}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <ErrorBanner error={error} />}
      {loading && <LoadingState message="Loading assigned invoices…" />}

      {!loading && !error && data && (
        <>
          {filteredItems.length === 0 ? (
            <EmptyState
              icon="📥"
              title="No invoices found"
              description={
                searchQuery
                  ? `No invoices match "${searchQuery}".`
                  : filter === 'PENDING_ACK'
                  ? 'All caught up! No invoices require your action at this time.'
                  : filter === 'ALL'
                  ? 'No invoices have been assigned to you yet.'
                  : `No invoices matching "${filter}".`
              }
            />
          ) : (
            <div className={styles.grid}>
              {filteredItems.map((inv) => {
                const isPending = inv.status === 'PENDING_ACK';
                return (
                  <Link
                    key={inv.id}
                    to={ROUTES.acknowledgeInvoice(inv.id)}
                    className={`${styles.card} ${isPending ? styles.cardPending : ''}`}
                    id={`invoice-card-${inv.id}`}
                  >
                    {isPending && (
                      <div className={styles.actionBanner}>
                        <span aria-hidden="true">⚠️</span>
                        Action Required: Review &amp; Acknowledge
                      </div>
                    )}

                    <div className={styles.cardHeader}>
                      <span className={styles.invoiceNumber}>{inv.invoiceNumber}</span>
                      <StatusBadge status={inv.status} />
                    </div>

                    <div className={styles.cardAmount}>
                      <MoneyText minorUnits={inv.amountMinorUnits} currency={inv.currency} />
                    </div>

                    {/* Visual Blockchain Lifecycle Stepper */}
                    <LifecycleStepper status={inv.status} compact />

                    <div className={styles.cardDetails}>
                      <div className={styles.detailRow}>
                        <span className={styles.label}>Supplier:</span>
                        <span className={styles.supplierName}>
                          {inv.supplier.displayName}
                        </span>
                      </div>
                      <div className={styles.detailRow}>
                        <span className={styles.label}>Due date:</span>
                        <span>{inv.dueDate}</span>
                      </div>
                    </div>

                    <div className={styles.cardFooter}>
                      <span className="btn btn-ghost btn-sm" tabIndex={-1}>
                        {isPending ? '⚡ Review & Sign →' : 'View Details →'}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          <p className={styles.totalCount}>
            Showing {filteredItems.length} of {data.total} invoice{data.total !== 1 ? 's' : ''}
          </p>
        </>
      )}
    </Layout>
  );
}
