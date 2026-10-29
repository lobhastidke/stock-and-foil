/**
 * components/VerificationTimeline/VerificationTimeline.tsx
 *
 * One memorable interactive scroll-driven verification timeline with a thin
 * animated cyan line and sequentially highlighted cryptographic steps.
 */

import React, { useState, useEffect, useRef } from 'react';
import styles from './VerificationTimeline.module.css';

interface StepData {
  step: number;
  title: string;
  role: 'SUPPLIER' | 'BUYER' | 'FINANCIER' | 'REGISTRY';
  roleLabel: string;
  description: string;
  proofLabel: string;
  proofValue: string;
}

const VERIFICATION_STEPS: StepData[] = [
  {
    step: 1,
    title: 'Off-Chain Payload & Salt Generation',
    role: 'SUPPLIER',
    roleLabel: 'Supplier Node',
    description:
      'Supplier creates invoice metadata. A high-entropy cryptographic salt is generated off-chain to keep financial terms private.',
    proofLabel: 'Leaf Hash',
    proofValue: 'keccak256(canonicalPayload + salt) -> 0x8f3c...b219',
  },
  {
    step: 2,
    title: 'Merkle Commitment Registry Anchoring',
    role: 'REGISTRY',
    roleLabel: 'MST Registry',
    description:
      'The commitment hash is anchored into the append-only registry tree. No commercial data or pricing is revealed on-chain.',
    proofLabel: 'State Root',
    proofValue: 'MST_Root #14289 -> Merkle Inclusion Confirmed',
  },
  {
    step: 3,
    title: 'Multi-Party Buyer Digital Sign-off',
    role: 'BUYER',
    roleLabel: 'Buyer Node',
    description:
      'The verified buyer reviews the invoice particulars and submits an acknowledgement signature, transitioning status to AVAILABLE.',
    proofLabel: 'Signer Proof',
    proofValue: 'AckSignature(0x3b...99a1) -> Status: ACKNOWLEDGED',
  },
  {
    step: 4,
    title: 'Deterministic Pledge Marker Registration',
    role: 'FINANCIER',
    roleLabel: 'Financier Node',
    description:
      'The financier underwrites receivables liquidity. A unique pledge marker is calculated and locked to this exact commitment.',
    proofLabel: 'Marker Lock',
    proofValue: 'pledgeMarker = keccak256(commitment + salt) -> LOCKED',
  },
  {
    step: 5,
    title: 'Double-Financing Intercept: 409 Rejected',
    role: 'REGISTRY',
    roleLabel: 'Fraud Intercept',
    description:
      'If a duplicate financing request is attempted against the same commitment, the registry detects the collision and halts with 409 DUPLICATE_PLEDGE.',
    proofLabel: 'Security Barrier',
    proofValue: 'Collision Detected: 409 DUPLICATE_PLEDGE (Zero Loss)',
  },
];

export function VerificationTimeline() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] = useState<number>(1);
  const [lineHeight, setLineHeight] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Scroll-driven calculation for the thin animated cyan line
  useEffect(() => {
    function handleScroll() {
      const el = containerRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const windowHeight = window.innerHeight;

      // Start when container reaches 75% down viewport, end when top passes 25%
      const start = windowHeight * 0.75;
      const end = windowHeight * 0.25;

      const progress = Math.min(Math.max((start - rect.top) / (rect.height + (start - end)), 0), 1);
      const totalHeight = rect.height - 40;
      setLineHeight(progress * totalHeight);

      // Sequentially highlight steps based on progress
      const currentStep = Math.min(Math.floor(progress * VERIFICATION_STEPS.length) + 1, VERIFICATION_STEPS.length);
      setActiveStep(currentStep);
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Optional auto-play demonstration
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => {
        if (prev >= VERIFICATION_STEPS.length) {
          setIsPlaying(false);
          return 1;
        }
        return prev + 1;
      });
    }, 2400);

    return () => clearInterval(interval);
  }, [isPlaying]);

  const roleClassMap: Record<string, string> = {
    SUPPLIER: styles.roleSupplier,
    BUYER: styles.roleBuyer,
    FINANCIER: styles.roleFinancier,
    REGISTRY: styles.roleRegistry,
  };

  return (
    <div className={styles.timelineContainer} ref={containerRef} aria-label="Interactive Verification Timeline">
      <div className={styles.controlsBar}>
        <div className={styles.progressPill}>
          <span>●</span>
          <span>
            Verification Phase {activeStep} of {VERIFICATION_STEPS.length}
          </span>
        </div>
        <button
          type="button"
          className={styles.playBtn}
          onClick={() => setIsPlaying(!isPlaying)}
          aria-label={isPlaying ? 'Pause timeline demonstration' : 'Auto play verification demonstration'}
        >
          <span>{isPlaying ? '⏸ Pause Simulation' : '▶ Play Verification Simulation'}</span>
        </button>
      </div>

      <div className={styles.trackWrapper}>
        {/* Subtle grey baseline */}
        <div className={styles.baseLine} />

        {/* Scroll-driven thin animated cyan line */}
        <div
          className={styles.activeLine}
          style={{
            height: isPlaying ? `${((activeStep - 0.5) / VERIFICATION_STEPS.length) * 100}%` : `${lineHeight}px`,
          }}
        />

        {VERIFICATION_STEPS.map((step) => {
          const isActive = activeStep === step.step;
          const isCompleted = activeStep > step.step;

          return (
            <div
              key={step.step}
              className={styles.stepRow}
              onClick={() => {
                setActiveStep(step.step);
                setIsPlaying(false);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setActiveStep(step.step);
                }
              }}
              aria-current={isActive ? 'step' : undefined}
            >
              <div
                className={`${styles.nodeMarker} ${isActive ? styles.nodeActive : ''} ${
                  isCompleted ? styles.nodeCompleted : ''
                }`}
              >
                {isCompleted ? '✓' : step.step}
              </div>

              <div className={`${styles.cardContent} ${isActive ? styles.cardActive : ''}`}>
                <div className={styles.stepHeader}>
                  <h3 className={styles.stepTitle}>{step.title}</h3>
                  <span className={`${styles.roleChip} ${roleClassMap[step.role] || ''}`}>{step.roleLabel}</span>
                </div>
                <p className={styles.stepDescription}>{step.description}</p>
                <div className={styles.cryptoProofBox}>
                  <span>{step.proofLabel}:</span>
                  <span className={styles.proofValue}>{step.proofValue}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
