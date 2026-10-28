/**
 * components/NavBar/NavBar.tsx
 * Top navigation bar. Shows role-appropriate links and logout.
 */

import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.js';
import { ROUTES } from '../../routes.js';
import styles from './NavBar.module.css';

export function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleLogout() {
    await logout();
    navigate(ROUTES.login);
  }

  function isActive(path: string) {
    return location.pathname.startsWith(path);
  }

  return (
    <header className={styles.header}>
      <nav className={styles.nav} aria-label="Main navigation">
        {/* Brand */}
        <Link to="/" className={styles.brand}>
          <span className={styles.brandIcon}>◈</span>
          <span className={styles.brandName}>Stock &amp; Foil</span>
        </Link>

        {/* Role-based links */}
        {user && (
          <ul className={styles.links} role="list">
            {user.role === 'SUPPLIER' && (
              <>
                <li>
                  <Link
                    to={ROUTES.supplierDashboard}
                    className={`${styles.link} ${isActive('/supplier/dashboard') ? styles.linkActive : ''}`}
                  >
                    Dashboard
                  </Link>
                </li>
                <li>
                  <Link
                    to={ROUTES.invoiceCreate}
                    className={`${styles.link} ${isActive(ROUTES.invoiceCreate) ? styles.linkActive : ''}`}
                  >
                    + New Invoice
                  </Link>
                </li>
              </>
            )}
            {user.role === 'BUYER' && (
              <li>
                <Link
                  to={ROUTES.buyerDashboard}
                  className={`${styles.link} ${isActive('/buyer') ? styles.linkActive : ''}`}
                >
                  Dashboard
                </Link>
              </li>
            )}
            {user.role === 'FINANCIER' && (
              <li>
                <Link
                  to={ROUTES.financierDashboard}
                  className={`${styles.link} ${isActive('/financier') ? styles.linkActive : ''}`}
                >
                  Dashboard
                </Link>
              </li>
            )}
            <li>
              <Link to={ROUTES.about} className={`${styles.link} ${isActive(ROUTES.about) ? styles.linkActive : ''}`}>
                About
              </Link>
            </li>
          </ul>
        )}

        {/* User info + logout */}
        <div className={styles.userArea}>
          {user ? (
            <>
              <div className={styles.userInfo}>
                <span className={`badge ${styles.roleBadge}`}>{user.role}</span>
                <span className={styles.userName}>{user.displayName}</span>
              </div>
              <button
                type="button"
                className={`btn btn-ghost btn-sm ${styles.logoutBtn}`}
                onClick={() => { void handleLogout(); }}
              >
                Sign out
              </button>
            </>
          ) : (
            <div className={styles.authLinks}>
              <Link to={ROUTES.login} className="btn btn-ghost btn-sm">Sign in</Link>
              <Link to={ROUTES.register} className="btn btn-primary btn-sm">Register</Link>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}
