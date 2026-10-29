/**
 * components/NavBar/NavBar.tsx
 * Top navigation bar with Web3 telemetry and quick 1-click persona switcher.
 */

import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.js';
import { ROUTES } from '../../routes.js';
import { getSystemStatus } from '../../api/endpoints.js';
import type { SystemStatus } from '../../api/types.js';
import styles from './NavBar.module.css';

const DEMO_PERSONAS = [
  {
    role: 'SUPPLIER',
    name: 'Alice (Supplier)',
    email: 'supplier@demo.com',
    path: ROUTES.supplierDashboard,
    icon: '🏢',
  },
  {
    role: 'BUYER',
    name: 'Bob (Buyer)',
    email: 'buyer@demo.com',
    path: ROUTES.buyerDashboard,
    icon: '👔',
  },
  {
    role: 'FINANCIER',
    name: 'Charlie (Financier)',
    email: 'financier@demo.com',
    path: ROUTES.financierDashboard,
    icon: '🏦',
  },
];

export function NavBar() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [sysStatus, setSysStatus] = useState<SystemStatus | null>(null);
  const [blockHeight, setBlockHeight] = useState<number>(18429104);
  const [blockFlash, setBlockFlash] = useState(false);
  const [switching, setSwitching] = useState(false);

  // Load system status once on mount
  useEffect(() => {
    getSystemStatus()
      .then((st) => setSysStatus(st))
      .catch(() => {
        // Fallback for offline / disconnected
        setSysStatus({
          chainMode: 'MST_TESTNET',
          chainConfigured: true,
          contractAddress: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
          chainId: '31337',
        });
      });
  }, []);

  // Simulate Web3 block ticker every 12 seconds with a gentle glow flash
  useEffect(() => {
    const timer = setInterval(() => {
      setBlockHeight((b) => b + 1);
      setBlockFlash(true);
      setTimeout(() => setBlockFlash(false), 800);
    }, 12000);
    return () => clearInterval(timer);
  }, []);

  async function handleLogout() {
    await logout();
    navigate(ROUTES.login);
  }

  async function handleSwitchPersona(email: string, targetPath: string) {
    if (switching) return;
    setSwitching(true);
    try {
      await login(email, 'password1234');
      navigate(targetPath);
    } catch (err) {
      console.error('[NavBar] Failed to switch demo persona:', err);
    } finally {
      setSwitching(false);
    }
  }

  function isActive(path: string) {
    return location.pathname.startsWith(path);
  }

  // Generate simulated Web3 wallet address
  const simulatedWallet = user
    ? `0x${user.id.replace(/-/g, '').slice(0, 4)}...${user.id.replace(/-/g, '').slice(-4).toUpperCase()}`
    : null;

  const roleBadgeClass =
    user?.role === 'SUPPLIER'
      ? styles.roleBadgeSupplier
      : user?.role === 'BUYER'
      ? styles.roleBadgeBuyer
      : styles.roleBadgeFinancier;

  const networkName =
    sysStatus?.chainMode === 'MST_TESTNET'
      ? 'MST Testnet'
      : sysStatus?.chainMode === 'HARDHAT'
      ? 'Hardhat Local'
      : 'Registry Node';

  return (
    <header className={styles.header}>
      {/* Quick Demo Persona Switcher Bar */}
      <div className={styles.demoBanner} role="complementary" aria-label="Demo Persona Switcher">
        <div className={styles.demoBannerLeft}>
          <span className={styles.demoTag}>Demo Switcher</span>
          <span>1-Click Multi-Party Testing:</span>
        </div>
        <div className={styles.demoActions}>
          {DEMO_PERSONAS.map((p) => {
            const isCurrent = user?.role === p.role;
            return (
              <button
                key={p.role}
                type="button"
                className={`${styles.demoBtn} ${isCurrent ? styles.demoBtnActive : ''}`}
                onClick={() => { void handleSwitchPersona(p.email, p.path); }}
                disabled={switching}
                title={`Switch session to ${p.name}`}
              >
                <span>{p.icon}</span>
                <span>{p.name}</span>
                {isCurrent && <span style={{ color: 'var(--cyan)' }}>●</span>}
              </button>
            );
          })}
        </div>
      </div>

      <nav className={styles.nav} aria-label="Main navigation">
        {/* Brand */}
        <Link to="/" className={styles.brand} id="nav-brand-link">
          <div className={styles.brandIconWrapper}>
            <span className={styles.brandIcon}>◈</span>
          </div>
          <div className={styles.brandText}>
            <span className={styles.brandName}>Stock &amp; Foil</span>
            <span className={styles.brandSubtitle}>MST Registry</span>
          </div>
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
                    <span>📊</span>
                    <span>Dashboard</span>
                  </Link>
                </li>
                <li>
                  <Link
                    to={ROUTES.invoiceCreate}
                    className={`${styles.link} ${isActive(ROUTES.invoiceCreate) ? styles.linkActive : ''}`}
                    id="nav-new-invoice-link"
                  >
                    <span>⚡</span>
                    <span>+ New Invoice</span>
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
                  <span>📋</span>
                  <span>Dashboard</span>
                </Link>
              </li>
            )}
            {user.role === 'FINANCIER' && (
              <li>
                <Link
                  to={ROUTES.financierDashboard}
                  className={`${styles.link} ${isActive('/financier') ? styles.linkActive : ''}`}
                >
                  <span>💰</span>
                  <span>Financier Portal</span>
                </Link>
              </li>
            )}
            <li>
              <Link to={ROUTES.about} className={`${styles.link} ${isActive(ROUTES.about) ? styles.linkActive : ''}`}>
                <span>🛡️</span>
                <span>About &amp; Proofs</span>
              </Link>
            </li>
          </ul>
        )}

        {/* Live Web3 Telemetry Pill */}
        <div className={styles.telemetry} title="Decentralized State & Consensus Engine">
          <span className={styles.networkPulse}>
            <span className={styles.pulseDot} />
            <span>{networkName}</span>
          </span>
          <span className={`${styles.blockTicker} ${blockFlash ? styles.blockFlash : ''}`}>
            #{blockHeight.toLocaleString()}
          </span>
        </div>

        {/* User area */}
        <div className={styles.userArea}>
          {user ? (
            <>
              <div className={styles.userPill}>
                <div className={styles.userAvatar}>
                  {user.displayName.charAt(0).toUpperCase()}
                </div>
                <div className={styles.userDetails}>
                  <div className="flex items-center gap-2">
                    <span className={styles.userName}>{user.displayName}</span>
                    <span className={roleBadgeClass}>{user.role}</span>
                  </div>
                  {simulatedWallet && (
                    <span className={styles.userWallet}>{simulatedWallet}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                className={`btn btn-ghost btn-sm ${styles.logoutBtn}`}
                onClick={() => { void handleLogout(); }}
                id="nav-logout-btn"
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
