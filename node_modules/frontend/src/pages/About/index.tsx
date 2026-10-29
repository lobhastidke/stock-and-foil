/**
 * pages/About/index.tsx
 *
 * About & Honest Limits page:
 * - Project mission and architecture
 * - System status and active chain mode
 * - Complete, unabridged HONEST LIMITS
 * - Guided walkthrough demo script for judges
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../../components/Layout/Layout.js';
import { LoadingState } from '../../components/LoadingState/LoadingState.js';
import { AnimatedHeading, AnimatedText } from '../../components/AnimatedHeading/AnimatedHeading.js';
import { VerificationTimeline } from '../../components/VerificationTimeline/VerificationTimeline.js';
import { useAsync } from '../../hooks/useAsync.js';
import { getSystemStatus } from '../../api/endpoints.js';
import { ROUTES } from '../../routes.js';
import styles from './About.module.css';

const HONEST_LIMITS = [
  {
    icon: '🛡️',
    title: 'Registry-Scoped Duplicate Prevention',
    text: 'Duplicate financing prevention operates solely WITHIN the Stock & Foil registry. It cannot prevent a bad actor from taking the same physical invoice to an external, unconnected factoring platform.',
  },
  {
    icon: '⚖️',
    title: 'No Inherent Legal Enforceability',
    text: 'A cryptographic hash, digital acknowledgement, or registry record does not guarantee invoice authenticity, physical delivery of goods, payment certainty, or legal enforceability in court.',
  },
  {
    icon: '🆔',
    title: 'Synthetic Demo Authentication',
    text: 'Authentication in this system is demonstration-grade and does not constitute real-world Know-Your-Customer (KYC), business verification, or credit risk underwriting.',
  },
  {
    icon: '💸',
    title: 'Simulated Capital Disbursement',
    text: 'All financing disbursements, advances, interest calculations, and bank transfers are simulated using synthetic data. No actual fiat or cryptocurrency is transferred.',
  },
  {
    icon: '🔬',
    title: 'Zero-Knowledge Proofs are Future Work',
    text: 'Zero-Knowledge (ZK) proofs are a roadmap enhancement. The current MVP uses keccak256 salt-salted commitments with off-chain canonical data.',
  },
  {
    icon: '⛓️',
    title: 'Strict Local/Mock Disclaimers',
    text: 'Local and mock records are never represented as "on-chain" in the user interface. Real chain records are only reported when verified against Hardhat or MST Testnet.',
  },
];

const DEMO_STEPS = [
  {
    step: '1',
    role: 'SUPPLIER',
    email: 'supplier@demo.com',
    action: 'Create & Commit',
    description: 'Create an invoice with buyer Rohan Mehta, upload a sample document, and click "Commit Invoice". Watch the keccak256 commitment hash get calculated and locked.',
  },
  {
    step: '2',
    role: 'BUYER',
    email: 'buyer@demo.com',
    action: 'Review & Acknowledge',
    description: 'Log in as the buyer. View the assigned invoice, inspect the document and commitment, then click "Acknowledge Invoice".',
  },
  {
    step: '3',
    role: 'SUPPLIER',
    email: 'supplier@demo.com',
    action: 'Release for Financing',
    description: 'Log back in as Supplier. The invoice is now ACKNOWLEDGED. Click "Release for Financing" to transition it to AVAILABLE.',
  },
  {
    step: '4',
    role: 'FINANCIER',
    email: 'financier@demo.com',
    action: 'Financing Pledge',
    description: 'Browse Available Invoices, submit a financing advance, and confirm the pledge. The deterministic pledge marker is registered in the registry.',
  },
  {
    step: '5',
    role: 'FINANCIER',
    email: 'financier@demo.com',
    action: 'The Demo Moment: Double-Financing Blocked!',
    description: 'Attempt to place a second financing pledge on the same invoice commitment. The registry halts the transaction with 409 DUPLICATE_PLEDGE!',
  },
];

export default function AboutPage() {
  const { data: status, loading: statusLoading } = useAsync(() => getSystemStatus(), []);

  return (
    <Layout>
      <div className="page-header">
        <div>
          <AnimatedHeading text="About Stock & Foil" as="h1" className="page-title" />
          <AnimatedText delayMs={160}>
            <p className="text-secondary text-md mt-1">
              Finance the invoice. Not the fraud. Privacy-preserving trade finance.
            </p>
          </AnimatedText>
        </div>
        <Link to={ROUTES.login} className="btn btn-primary">
          Launch App →
        </Link>
      </div>

      {/* Overview Card */}
      <div className="card mb-8">
        <AnimatedHeading text="Project Mission & Architecture" as="h2" className="card-title" />
        <p className="text-secondary mb-4 leading-relaxed">
          Stock &amp; Foil is a privacy-preserving receivables-financing registry built for the MST Blockchain Buildathon #2.
          In traditional trade finance, duplicate invoicing (pledging the same invoice to multiple lenders) accounts for billions
          in financial fraud.
        </p>
        <p className="text-secondary mb-4 leading-relaxed">
          Stock &amp; Foil solves this by anchoring invoice commitments and deterministic pledge markers into an append-only registry:
        </p>
        <div className={styles.principlesGrid}>
          <div className={styles.principleCard}>
            <div className={styles.principleIcon}>🔒</div>
            <div className={styles.principleTitle}>Confidentiality Off-Chain</div>
            <div className={styles.principleText}>
              Invoice details, amounts, client names, and invoices stay confidential and off-chain.
            </div>
          </div>
          <div className={styles.principleCard}>
            <div className={styles.principleIcon}>⚡</div>
            <div className={styles.principleTitle}>Single-Pledge Guarantee</div>
            <div className={styles.principleText}>
              Every commitment generates a deterministic <code>pledgeMarker</code>. A second pledge on the same marker is rejected.
            </div>
          </div>
          <div className={styles.principleCard}>
            <div className={styles.principleIcon}>📜</div>
            <div className={styles.principleTitle}>Tamper-Proof Audit</div>
            <div className={styles.principleText}>
              Every state transition creates a cryptographically-linked audit event visible to authorized parties.
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Scroll-Driven Verification Timeline */}
      <div className="card mb-8">
        <VerificationTimeline />
      </div>

      {/* System Status Section */}
      <div className="card mb-8">
        <AnimatedHeading text="System & Blockchain Configuration" as="h2" className="card-title" />
        {statusLoading ? (
          <LoadingState message="Checking system status…" />
        ) : status ? (
          <div className={styles.statusGrid}>
            <div className={styles.statusItem}>
              <span className={styles.statusLabel}>Adapter Mode</span>
              <span className={styles.statusValue}>
                <code>{status.chainMode}</code>
              </span>
            </div>
            <div className={styles.statusItem}>
              <span className={styles.statusLabel}>Chain Configured</span>
              <span className={styles.statusValue}>
                {status.chainConfigured ? '✓ Configured' : 'Local / In-Memory'}
              </span>
            </div>
            <div className={styles.statusItem}>
              <span className={styles.statusLabel}>Contract Address</span>
              <span className={styles.statusValue}>
                {status.contractAddress ? <code>{status.contractAddress}</code> : <span className="text-muted">None (Local Mock)</span>}
              </span>
            </div>
            <div className={styles.statusItem}>
              <span className={styles.statusLabel}>Chain ID</span>
              <span className={styles.statusValue}>
                {status.chainId ?? <span className="text-muted">N/A</span>}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-muted text-sm">Status unavailable.</p>
        )}
      </div>

      {/* Honest Limits Section */}
      <div className="card mb-8">
        <div className={styles.limitsHeader}>
          <AnimatedHeading text="The Honest Limits" as="h2" className="card-title mb-0" />
          <span className="badge badge-amber font-semibold">Transparency Guarantee</span>
        </div>
        <p className="text-secondary text-sm mb-6">
          We believe responsible blockchain engineering requires clear and honest communication regarding what technology can and cannot guarantee.
        </p>

        <div className={styles.limitsGrid}>
          {HONEST_LIMITS.map((limit, idx) => (
            <div key={idx} className={styles.limitCard}>
              <div className={styles.limitIcon}>{limit.icon}</div>
              <h3 className={styles.limitTitle}>{limit.title}</h3>
              <p className={styles.limitText}>{limit.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Evaluation Reference */}
      <div className="card">
        <AnimatedHeading text="Demo Account Credentials & Walkthrough" as="h2" className="card-title" />
        <p className="text-secondary text-sm mb-6">
          Follow these 5 steps to verify the complete end-to-end invoice financing lifecycle and duplicate pledge prevention.
          (Default password for all demo accounts is <code>password1234</code>).
        </p>

        <div className={styles.stepsList}>
          {DEMO_STEPS.map((step) => (
            <div key={step.step} className={styles.stepItem}>
              <div className={styles.stepBadge}>{step.step}</div>
              <div className={styles.stepContent}>
                <div className={styles.stepHeader}>
                  <span className={styles.stepAction}>{step.action}</span>
                  <span className="badge badge-blue">{step.role}</span>
                </div>
                <div className={styles.stepEmail}>
                  Login: <code>{step.email}</code>
                </div>
                <p className={styles.stepDesc}>{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
