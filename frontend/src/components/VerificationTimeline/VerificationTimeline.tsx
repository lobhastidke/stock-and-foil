/**
 * components/VerificationTimeline/VerificationTimeline.tsx
 *
 * GSAP ScrollTrigger-driven verification timeline with a thin animated cyan line,
 * sequentially highlighted cryptographic steps, and React Bits DecryptedText reveals.
 */

import React, { useState, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { DecryptedText } from '../ReactBits/DecryptedText.js';
import styles from './VerificationTimeline.module.css';

gsap.registerPlugin(ScrollTrigger);

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
    proofValue: 'keccak256(canonicalPayload + salt) -> 0x8f3cb21974a9c8d3',
  },
  {
    step: 2,
    title: 'Merkle Commitment Registry Anchoring',
    role: 'REGISTRY',
    roleLabel: 'MST Registry',
    description:
      'The commitment hash is anchored into the append-only registry tree. No commercial data or pricing is revealed on-chain.',
    proofLabel: 'State Root',
    proofValue: 'MST_Root #14289 -> Merkle Inclusion Confirmed [0x41ab]',
  },
  {
    step: 3,
    title: 'Multi-Party Buyer Digital Sign-off',
    role: 'BUYER',
    roleLabel: 'Buyer Node',
    description:
      'The verified buyer reviews the invoice particulars and submits an acknowledgement signature, transitioning status to AVAILABLE.',
    proofLabel: 'Signer Proof',
    proofValue: 'AckSignature(0x3b99a1) -> Status: ACKNOWLEDGED [Valid]',
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
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] = useState<number>(1);
  const [lineHeight, setLineHeight] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // GSAP ScrollTrigger Integration
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const el = trackRef.current || containerRef.current;
    if (!el) return;

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: el,
        start: 'top 75%',
        end: 'bottom 35%',
        scrub: 0.4,
        onUpdate: (self) => {
          if (isPlaying) return; // let animation play without scroll override if active
          const progress = self.progress;
          const rect = el.getBoundingClientRect();
          const totalHeight = Math.max(el.scrollHeight, rect.height) - 40;
          setLineHeight(progress * totalHeight);

          const stepIndex = Math.min(
            Math.floor(progress * VERIFICATION_STEPS.length) + 1,
            VERIFICATION_STEPS.length,
          );
          setActiveStep(stepIndex);
        },
      });
    }, containerRef);

    return () => ctx.revert();
  }, [isPlaying]);

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
    }, 2200);

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
          <span className={styles.pulseDot}>●</span>
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

      <div className={styles.trackWrapper} ref={trackRef}>
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
              className={`${styles.stepRow} ${isActive ? styles.stepRowActive : ''}`}
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
                  <span className={styles.proofValue}>
                    {isActive ? (
                      <DecryptedText
                        text={step.proofValue}
                        speed={28}
                        maxIterations={10}
                        characters="0123456789ABCDEFabcdef_#*+"
                        animateOn="view"
                      />
                    ) : (
                      step.proofValue
                    )}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
