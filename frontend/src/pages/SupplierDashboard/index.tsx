/**
 * pages/SupplierDashboard/index.tsx
 * Web3 Executive Dashboard for Suppliers with KPI metrics and visual lifecycle steppers.
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
import { SpotlightCard } from '../../components/ReactBits/SpotlightCard.js';
import { useAsync } from '../../hooks/useAsync.js';
import { listInvoices } from '../../api/endpoints.js';
import { useAuth } from '../../auth/AuthContext.js';
import { ROUTES } from '../../routes.js';
import type { InvoiceStatus } from '../../api/types.js';
import styles from './SupplierDashboard.module.css';

const STATUS_FILTERS: { value: InvoiceStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All Invoices' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PENDING_ACK', label: 'Awaiting Buyer' },
  { value: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { value: 'AVAILABLE', label: 'Available for Funding' },
  { value: 'PLEDGED', label: 'Pledged / Funded' },
  { value: 'SETTLED', label: 'Settled' },
  { value: 'REJECTED', label: 'Rejected' },
];

export default function SupplierDashboard() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<InvoiceStatus | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, loading, error } = useAsync(
    () => listInvoices(filter === 'ALL' ? {} : { status: filter }),
    [filter],
  );

  // Compute executive Web3 KPI stats from all fetched items
  const stats = useMemo(() => {
    if (!data?.items) {
      return { totalAmount: BigInt(0), totalCount: 0, releasedCount: 0, fundedCount: 0 };
    }
    let total = BigInt(0);
    let released = 0;
    let funded = 0;

    for (const inv of data.items) {
      try {
        total += BigInt(inv.amountMinorUnits);
      } catch {
        // ignore parsing error
      }
      if (inv.status === 'AVAILABLE' || inv.status === 'ACKNOWLEDGED') {
        released++;
      }
      if (inv.status === 'PLEDGED' || inv.status === 'SETTLED') {
        funded++;
      }
    }

    return {
      totalAmount: total,
      totalCount: data.items.length,
      releasedCount: released,
      fundedCount: funded,
    };
  }, [data]);

  // Filter items by search query
  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    if (!searchQuery.trim()) return data.items;
    const q = searchQuery.toLowerCase();
    return data.items.filter(
      (inv) =>
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.buyer.displayName.toLowerCase().includes(q),
    );
  }, [data, searchQuery]);

  return (
    <Layout>
      <div className="page-header">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.2)', color: 'var(--cyan)' }}>
              Enterprise Supplier Portal
            </span>
            <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--success)' }}>
              ● Merkle-Tree Active
            </span>
          </div>
          <AnimatedHeading text="Supplier Factoring Dashboard" as="h1" className="page-title" />
          <AnimatedText className="text-secondary text-sm mt-1">
            Welcome, <strong>{user?.displayName}</strong> ({user?.organisation}). Issue commitments &amp; unlock liquidity.
          </AnimatedText>
        </div>
        <Link to={ROUTES.invoiceCreate} className="btn btn-primary" id="new-invoice-btn">
          ⚡ + Issue New Invoice
        </Link>
      </div>

      {/* Executive Web3 KPI Cards */}
      <div className="kpi-grid">
        <SpotlightCard className="kpi-card" spotlightColor="rgba(0, 242, 254, 0.14)">
          <div className="kpi-card-header">
            <span className="kpi-card-title">Total Receivables</span>
            <div className="kpi-card-icon">💎</div>
          </div>
          <div className="kpi-card-value">
            <MoneyText minorUnits={stats.totalAmount.toString()} currency="INR" />
          </div>
          <div className="kpi-card-subtitle">
            <span style={{ color: 'var(--cyan)' }}>● {stats.totalCount} Invoices</span> in registry
          </div>
        </SpotlightCard>

        <SpotlightCard className="kpi-card" spotlightColor="rgba(0, 242, 254, 0.16)">
          <div className="kpi-card-header">
            <span className="kpi-card-title">Financing Ready</span>
            <div className="kpi-card-icon" style={{ borderColor: 'rgba(0, 242, 254, 0.3)', color: 'var(--cyan)' }}>
              🚀
            </div>
          </div>
          <div className="kpi-card-value" style={{ color: 'var(--cyan)' }}>
            {stats.releasedCount}
          </div>
          <div className="kpi-card-subtitle">
            <span>Acknowledged &amp; Released to Financiers</span>
          </div>
        </SpotlightCard>

        <SpotlightCard className="kpi-card" spotlightColor="rgba(16, 185, 129, 0.16)">
          <div className="kpi-card-header">
            <span className="kpi-card-title">Funded Pledges</span>
            <div className="kpi-card-icon" style={{ borderColor: 'rgba(16, 185, 129, 0.3)', color: 'var(--success)' }}>
              💰
            </div>
          </div>
          <div className="kpi-card-value" style={{ color: 'var(--success)' }}>
            {stats.fundedCount}
          </div>
          <div className="kpi-card-subtitle">
            <span>Liquidity disbursed by financiers</span>
          </div>
        </SpotlightCard>

        <SpotlightCard className="kpi-card" spotlightColor="rgba(168, 85, 247, 0.16)">
          <div className="kpi-card-header">
            <span className="kpi-card-title">Anti-Fraud Guard</span>
            <div className="kpi-card-icon" style={{ borderColor: 'rgba(168, 85, 247, 0.3)', color: '#c084fc' }}>
              🛡️
            </div>
          </div>
          <div className="kpi-card-value" style={{ color: '#c084fc', fontSize: '1.25rem', paddingTop: '6px' }}>
            100% Cryptographic
          </div>
          <div className="kpi-card-subtitle">
            <span>Deterministic Keccak-256 Merkle anchoring</span>
          </div>
        </SpotlightCard>
      </div>

      {/* Search and Filters Bar */}
      <div className={styles.searchBar}>
        <input
          type="search"
          placeholder="🔍 Search invoices by number, buyer, or org…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={styles.searchInput}
          aria-label="Search invoices"
        />
      </div>

      {/* Status filter pills */}
      <div className={styles.filters} role="group" aria-label="Filter by status">
        {STATUS_FILTERS.map((f) => (
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
      {loading && <LoadingState />}

      {!loading && !error && data && (
        <>
          {filteredItems.length === 0 ? (
            <EmptyState
              icon="📄"
              title="No invoices found"
              description={
                searchQuery
                  ? `No invoices match "${searchQuery}".`
                  : filter === 'ALL'
                  ? 'Create your first invoice to get started.'
                  : `No invoices with status "${filter}".`
              }
              action={
                filter === 'ALL' && !searchQuery ? (
                  <Link to={ROUTES.invoiceCreate} className="btn btn-primary">
                    Create invoice
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <div className={styles.grid}>
              {filteredItems.map((inv) => (
                <Link
                  key={inv.id}
                  to={ROUTES.invoiceDetail(inv.id)}
                  className={styles.card}
                  id={`invoice-card-${inv.id}`}
                >
                  <div className={styles.cardTop}>
                    <span className={styles.invoiceNumber}>{inv.invoiceNumber}</span>
                    <StatusBadge status={inv.status} />
                  </div>

                  <div className={styles.cardAmount}>
                    <MoneyText minorUnits={inv.amountMinorUnits} currency={inv.currency} />
                  </div>

                  {/* Visual Blockchain Lifecycle Stepper */}
                  <LifecycleStepper status={inv.status} compact />

                  <div className={styles.cardMeta}>
                    <span>
                      To <strong className={styles.buyerName}>{inv.buyer.displayName}</strong>
                    </span>
                    <span>Due {inv.dueDate}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
          <p className={styles.total}>
            Showing {filteredItems.length} of {data.total} invoice{data.total !== 1 ? 's' : ''}
          </p>
        </>
      )}
    </Layout>
  );
}
