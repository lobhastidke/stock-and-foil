/**
 * pages/BuyerDashboard/index.tsx
 *
 * Buyer dashboard:
 * - Lists invoices assigned to this buyer
 * - Filter pills (All, Awaiting Response, Acknowledged, etc.)
 * - Prominent "Action Required" indicator for PENDING_ACK
 * - Direct navigation to AcknowledgeInvoice page
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../../components/Layout/Layout.js';
import { StatusBadge } from '../../components/StatusBadge/StatusBadge.js';
import { MoneyText } from '../../components/MoneyText/MoneyText.js';
import { LoadingState } from '../../components/LoadingState/LoadingState.js';
import { EmptyState } from '../../components/EmptyState/EmptyState.js';
import { ErrorBanner } from '../../components/ErrorBanner/ErrorBanner.js';
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

  const { data, loading, error } = useAsync(
    () => listInvoices(filter === 'ALL' ? {} : { status: filter }),
    [filter],
  );

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Assigned Invoices</h1>
          <p className="text-secondary text-sm mt-1">
            Welcome, {user?.displayName}. Review and acknowledge invoices issued to {user?.organisation || 'your company'}.
          </p>
        </div>
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
          {data.items.length === 0 ? (
            <EmptyState
              icon="📥"
              title="No invoices found"
              description={
                filter === 'PENDING_ACK'
                  ? 'All caught up! No invoices require your action at this time.'
                  : filter === 'ALL'
                  ? 'No invoices have been assigned to you yet.'
                  : `No invoices matching "${filter}".`
              }
            />
          ) : (
            <div className={styles.grid}>
              {data.items.map((inv) => {
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
                        ⚡ Action Required: Review & Acknowledge
                      </div>
                    )}
                    <div className={styles.cardHeader}>
                      <span className={styles.invoiceNumber}>{inv.invoiceNumber}</span>
                      <StatusBadge status={inv.status} />
                    </div>

                    <div className={styles.cardAmount}>
                      <MoneyText minorUnits={inv.amountMinorUnits} currency={inv.currency} />
                    </div>

                    <div className={styles.cardDetails}>
                      <div>
                        <span className={styles.label}>Supplier:</span> {inv.supplier.displayName}
                      </div>
                      <div>
                        <span className={styles.label}>Due Date:</span> {inv.dueDate}
                      </div>
                    </div>

                    <div className={styles.cardFooter}>
                      <span className="text-xs text-primary font-medium">
                        {isPending ? 'Review invoice →' : 'View details →'}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          <p className={styles.totalCount}>
            Showing {data.items.length} of {data.total} invoice{data.total !== 1 ? 's' : ''}
          </p>
        </>
      )}
    </Layout>
  );
}
