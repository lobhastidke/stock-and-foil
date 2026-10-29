/**
 * pages/InvoiceCreate/index.tsx
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../components/Layout/Layout.js';
import { ErrorBanner } from '../../components/ErrorBanner/ErrorBanner.js';
import { AnimatedHeading } from '../../components/AnimatedHeading/AnimatedHeading.js';
import { useAsync } from '../../hooks/useAsync.js';
import { getBuyers, createInvoice } from '../../api/endpoints.js';
import { invoiceFormSchema, type InvoiceForm } from '../../lib/validation.js';
import { rupeesToMinorUnits } from '../../lib/money.js';
import { ROUTES } from '../../routes.js';
import styles from './InvoiceCreate.module.css';

const today = new Date().toISOString().slice(0, 10);

export default function InvoiceCreate() {
  const navigate = useNavigate();
  const { data: buyers } = useAsync(() => getBuyers(), []);

  const [form, setForm] = useState<InvoiceForm>({
    invoiceNumber: '',
    buyerId: '',
    amountMajor: '',
    currency: 'INR',
    issueDate: today,
    dueDate: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof InvoiceForm, string>>>({});
  const [apiError, setApiError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof InvoiceForm>(key: K, value: InvoiceForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setApiError(null);

    const result = invoiceFormSchema.safeParse(form);
    if (!result.success) {
      const fe: Partial<Record<keyof InvoiceForm, string>> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof InvoiceForm;
        fe[key] = issue.message;
      }
      setErrors(fe);
      return;
    }

    const minor = rupeesToMinorUnits(form.amountMajor);
    if (!minor || minor === '0') {
      setErrors((e) => ({ ...e, amountMajor: 'Amount must be greater than zero' }));
      return;
    }

    setLoading(true);
    try {
      const { invoice } = await createInvoice({
        invoiceNumber: form.invoiceNumber,
        buyerId: form.buyerId,
        amountMinorUnits: minor,
        currency: form.currency,
        issueDate: form.issueDate,
        dueDate: form.dueDate,
      });
      navigate(ROUTES.invoiceDetail(invoice.id));
    } catch (err) {
      setApiError(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <AnimatedHeading text="New Invoice" as="h1" className="page-title" />
      </div>

      <div className={styles.container}>
        <div className="card card-elevated animate-fadeIn">
          <ErrorBanner error={apiError} />

          <form onSubmit={(e) => { void handleSubmit(e); }} noValidate>
            <div className="grid-2">
              <div className="form-group">
                <label htmlFor="inv-number">Invoice number</label>
                <input
                  id="inv-number"
                  type="text"
                  value={form.invoiceNumber}
                  onChange={(e) => update('invoiceNumber', e.target.value)}
                  placeholder="INV-2025-001"
                  aria-invalid={!!errors.invoiceNumber}
                />
                {errors.invoiceNumber && <span className="form-error">{errors.invoiceNumber}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="inv-buyer">Buyer</label>
                <select
                  id="inv-buyer"
                  value={form.buyerId}
                  onChange={(e) => update('buyerId', e.target.value)}
                  aria-invalid={!!errors.buyerId}
                >
                  <option value="">— Select buyer —</option>
                  {buyers?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.displayName} ({b.organisation})
                    </option>
                  ))}
                </select>
                {errors.buyerId && <span className="form-error">{errors.buyerId}</span>}
              </div>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label htmlFor="inv-amount">Amount</label>
                <input
                  id="inv-amount"
                  type="text"
                  inputMode="decimal"
                  value={form.amountMajor}
                  onChange={(e) => update('amountMajor', e.target.value)}
                  placeholder="5000.00"
                  aria-describedby="inv-amount-hint"
                  aria-invalid={!!errors.amountMajor}
                />
                <span id="inv-amount-hint" className="form-hint">
                  Enter in major units (e.g. ₹5,000 = "5000.00")
                </span>
                {errors.amountMajor && <span className="form-error">{errors.amountMajor}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="inv-currency">Currency</label>
                <select
                  id="inv-currency"
                  value={form.currency}
                  onChange={(e) => update('currency', e.target.value as InvoiceForm['currency'])}
                >
                  <option value="INR">INR — Indian Rupee</option>
                  <option value="USD">USD — US Dollar</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="GBP">GBP — British Pound</option>
                </select>
              </div>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label htmlFor="inv-issue">Issue date</label>
                <input
                  id="inv-issue"
                  type="date"
                  value={form.issueDate}
                  onChange={(e) => update('issueDate', e.target.value)}
                  aria-invalid={!!errors.issueDate}
                />
                {errors.issueDate && <span className="form-error">{errors.issueDate}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="inv-due">Due date</label>
                <input
                  id="inv-due"
                  type="date"
                  value={form.dueDate}
                  min={form.issueDate}
                  onChange={(e) => update('dueDate', e.target.value)}
                  aria-invalid={!!errors.dueDate}
                  aria-describedby={errors.dueDate ? 'inv-due-error' : undefined}
                />
                {errors.dueDate && (
                  <span id="inv-due-error" className="form-error">{errors.dueDate}</span>
                )}
              </div>
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigate(ROUTES.supplierDashboard)}
              >
                Cancel
              </button>
              <button
                type="submit"
                id="create-invoice-submit"
                className="btn btn-primary"
                disabled={loading}
                aria-busy={loading}
              >
                {loading ? 'Creating…' : 'Create invoice'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}
