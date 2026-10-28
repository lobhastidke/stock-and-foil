/**
 * components/Layout/Layout.tsx
 * Page shell: NavBar at top, main content in center, footer at bottom.
 */

import React, { type ReactNode } from 'react';
import { NavBar } from '../NavBar/NavBar.js';
import { LimitationsNotice } from '../LimitationsNotice/LimitationsNotice.js';
import styles from './Layout.module.css';

interface Props {
  children: ReactNode;
  /** Remove default padding (useful for full-bleed pages). */
  noPadding?: boolean;
}

export function Layout({ children, noPadding }: Props) {
  return (
    <div className={styles.shell}>
      <NavBar />
      <main className={noPadding ? styles.mainFlush : styles.main}>
        {children}
      </main>
      <LimitationsNotice />
    </div>
  );
}
