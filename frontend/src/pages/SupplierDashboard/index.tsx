/**
 * pages/SupplierDashboard/index.tsx
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
import styles from './SupplierDashboard.module.css';

const STATUS_FILTERS: { value: InvoiceStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PENDING_ACK', label: 'Awaiting Buyer' },
  { value: 'ACKNOWLEDGED', label: 'Acknowledged' },
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'PLEDGED', label: 'Pledged' },
  { value: 'SETTLED', label: 'Settled' },
  { value: 'REJECTED', label: 'Rejected' },
];

export default function SupplierDashboard() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<InvoiceStatus | 'ALL'>('ALL');

  const { data, loading, error, refetch } = useAsync(
    () => listInvoices(filter === 'ALL' ? {} : { status: filter }),
    [filter],
  );

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Invoices</h1>
          <p className="text-secondary text-sm mt-2">
            Welcome, {user?.displayName}. Manage your invoices below.
          </p>
        </div>
        <Link to={ROUTES.invoiceCreate} className="btn btn-primary" id="new-invoice-btn">
          + New Invoice
        </Link>
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
          {data.items.length === 0 ? (
            <EmptyState
              icon="📄"
              title="No invoices yet"
              description={
                filter === 'ALL'
                  ? 'Create your first invoice to get started.'
                  : `No invoices with status "${filter}".`
              }
              action={
                filter === 'ALL' ? (
                  <Link to={ROUTES.invoiceCreate} className="btn btn-primary">
                    Create invoice
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <div className={styles.grid}>
              {data.items.map((inv) => (
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
                  <div className={styles.cardMeta}>
                    <span>→ {inv.buyer.displayName}</span>
                    <span>Due {inv.dueDate}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
          <p className={styles.total}>
            Showing {data.items.length} of {data.total} invoice{data.total !== 1 ? 's' : ''}
          </p>
        </>
      )}
    </Layout>
  );
}
