/**
 * pages/Register/index.tsx
 */

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.js';
import { ROUTES } from '../../routes.js';
import { registerSchema, type RegisterForm } from '../../lib/validation.js';
import { ApiError } from '../../api/client.js';
import type { Role } from '../../api/types.js';
import styles from './Register.module.css';

const ROLES: { value: Role; label: string; description: string }[] = [
  { value: 'SUPPLIER', label: 'Supplier', description: 'Create and commit invoices' },
  { value: 'BUYER', label: 'Buyer', description: 'Review and acknowledge invoices' },
  { value: 'FINANCIER', label: 'Financier', description: 'Pledge financing for invoices' },
];

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState<RegisterForm>({
    email: '',
    password: '',
    confirmPassword: '',
    displayName: '',
    organisation: '',
    role: 'SUPPLIER',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof RegisterForm, string>>>({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);

  function update<K extends keyof RegisterForm>(key: K, value: RegisterForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setApiError('');

    const result = registerSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof RegisterForm, string>> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof RegisterForm;
        fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    try {
      const user = await register({
        email: form.email,
        password: form.password,
        displayName: form.displayName,
        organisation: form.organisation,
        role: form.role,
      });
      switch (user.role) {
        case 'SUPPLIER':  navigate(ROUTES.supplierDashboard); break;
        case 'BUYER':     navigate(ROUTES.buyerDashboard); break;
        case 'FINANCIER': navigate(ROUTES.financierDashboard); break;
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setApiError(err.message);
      } else {
        setApiError('Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.brandIcon}>◈</span>
          <h1 className={styles.brandName}>Create account</h1>
          <p className={styles.brandTagline}>Stock &amp; Foil — Finance the invoice. Not the fraud.</p>
        </div>

        {/* HONEST LIMIT notice */}
        <div className={styles.notice} role="note">
          <span aria-hidden="true">ℹ️</span>
          <span>
            <strong>Demo authentication only.</strong> This is not real identity
            verification (no KYC). Funding is simulated — no real money.
          </span>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }} noValidate>
          {apiError && (
            <div className={styles.errorBanner} role="alert">{apiError}</div>
          )}

          {/* Role selector */}
          <fieldset className={styles.roleFieldset}>
            <legend className={styles.legend}>Select your role</legend>
            <div className={styles.roleGrid}>
              {ROLES.map((r) => (
                <label
                  key={r.value}
                  className={`${styles.roleCard} ${form.role === r.value ? styles.roleCardSelected : ''}`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r.value}
                    checked={form.role === r.value}
                    onChange={() => update('role', r.value)}
                    className={styles.roleRadio}
                  />
                  <span className={styles.roleLabel}>{r.label}</span>
                  <span className={styles.roleDesc}>{r.description}</span>
                </label>
              ))}
            </div>
            {errors.role && <span className="form-error">{errors.role}</span>}
          </fieldset>

          <div className="form-group">
            <label htmlFor="reg-name">Display name</label>
            <input
              id="reg-name"
              type="text"
              autoComplete="name"
              value={form.displayName}
              onChange={(e) => update('displayName', e.target.value)}
              placeholder="Your full name"
              aria-invalid={!!errors.displayName}
            />
            {errors.displayName && <span className="form-error">{errors.displayName}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="reg-org">Organisation</label>
            <input
              id="reg-org"
              type="text"
              autoComplete="organization"
              value={form.organisation}
              onChange={(e) => update('organisation', e.target.value)}
              placeholder="Company / organisation name"
              aria-invalid={!!errors.organisation}
            />
            {errors.organisation && <span className="form-error">{errors.organisation}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="reg-email">Email address</label>
            <input
              id="reg-email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              placeholder="you@example.com"
              aria-invalid={!!errors.email}
            />
            {errors.email && <span className="form-error">{errors.email}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="reg-password">Password</label>
            <input
              id="reg-password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              placeholder="Minimum 10 characters"
              aria-invalid={!!errors.password}
            />
            {errors.password && <span className="form-error">{errors.password}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="reg-confirm">Confirm password</label>
            <input
              id="reg-confirm"
              type="password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(e) => update('confirmPassword', e.target.value)}
              placeholder="Repeat password"
              aria-invalid={!!errors.confirmPassword}
            />
            {errors.confirmPassword && (
              <span className="form-error">{errors.confirmPassword}</span>
            )}
          </div>

          <button
            type="submit"
            id="register-submit"
            className="btn btn-primary btn-lg btn-block"
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className={styles.loginLink}>
          Already have an account?{' '}
          <Link to={ROUTES.login} id="go-to-login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
