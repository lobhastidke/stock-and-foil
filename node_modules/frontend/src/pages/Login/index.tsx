/**
 * pages/Login/index.tsx
 */

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.js';
import { ROUTES } from '../../routes.js';
import { loginSchema } from '../../lib/validation.js';
import { ApiError } from '../../api/client.js';
import styles from './Login.module.css';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setApiError('');

    // Client-side validation
    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as string;
        fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    try {
      const user = await login(email, password);
      switch (user.role) {
        case 'SUPPLIER':  navigate(ROUTES.supplierDashboard); break;
        case 'BUYER':     navigate(ROUTES.buyerDashboard); break;
        case 'FINANCIER': navigate(ROUTES.financierDashboard); break;
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setApiError(err.message || 'Invalid email or password');
      } else {
        setApiError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card} role="main">
        {/* Brand */}
        <div className={styles.brand}>
          <span className={styles.brandIcon}>◈</span>
          <h1 className={styles.brandName}>Stock &amp; Foil</h1>
          <p className={styles.brandTagline}>Finance the invoice. Not the fraud.</p>
        </div>

        {/* Demo notice */}
        <div className={styles.demoBanner} role="note">
          <span aria-hidden="true">ℹ️</span>
          Demo authentication — not identity verification.
          Try: <strong>supplier@demo.com</strong> / <strong>password1234</strong>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }} noValidate>
          {apiError && (
            <div className={styles.errorBanner} role="alert">
              {apiError}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="login-email">Email address</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-describedby={errors.email ? 'login-email-error' : undefined}
              aria-invalid={!!errors.email}
            />
            {errors.email && (
              <span id="login-email-error" className="form-error" role="alert">
                {errors.email}
              </span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••"
              aria-describedby={errors.password ? 'login-password-error' : undefined}
              aria-invalid={!!errors.password}
            />
            {errors.password && (
              <span id="login-password-error" className="form-error" role="alert">
                {errors.password}
              </span>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg btn-block"
            disabled={loading}
            aria-busy={loading}
            id="login-submit"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className={styles.registerLink}>
          No account?{' '}
          <Link to={ROUTES.register} id="go-to-register">Create one</Link>
        </p>
      </div>
    </div>
  );
}
