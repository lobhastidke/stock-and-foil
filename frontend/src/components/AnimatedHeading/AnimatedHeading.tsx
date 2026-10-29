/**
 * components/AnimatedHeading/AnimatedHeading.tsx
 *
 * Premium word-by-word text animation component.
 * Reveals each word with a subtle upward movement and fade-in,
 * using staggered delays and optional blur-to-sharp smoothing.
 * Accessible with continuous aria-label and prefers-reduced-motion support.
 */

import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './AnimatedHeading.module.css';

interface Props {
  text: string;
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'span' | 'p' | 'div';
  className?: string;
  stagger?: number; // seconds per word (e.g. 0.04)
  delay?: number; // initial delay in seconds
  blur?: boolean;
  once?: boolean;
  id?: string;
  children?: ReactNode;
}

export function AnimatedHeading({
  text,
  as: Component = 'h1',
  className = '',
  stagger = 0.04,
  delay = 0,
  blur = false,
  once = true,
  id,
  children,
}: Props) {
  const containerRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Check prefers-reduced-motion
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsVisible(true);
            if (once) {
              observer.unobserve(entry.target);
            }
          } else if (!once) {
            setIsVisible(false);
          }
        }
      },
      {
        threshold: 0.15,
        rootMargin: '0px 0px -40px 0px',
      },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [once]);

  const words = text.split(/\s+/).filter(Boolean);

  return (
    <Component
      ref={containerRef as any}
      className={`${styles.wrapper} ${isVisible ? styles.revealed : ''} ${className}`}
      aria-label={text}
      id={id}
    >
      {words.map((word, idx) => {
        const transitionDelay = `${delay + idx * stagger}s`;
        return (
          <span key={`${word}-${idx}`} className={styles.wordMask} aria-hidden="true">
            <span
              className={`${styles.word} ${blur ? styles.withBlur : ''}`}
              style={{
                transitionDelay,
              }}
            >
              {word}
            </span>
          </span>
        );
      })}
      {children}
    </Component>
  );
}

/**
 * AnimatedParagraph / Line reveal for supporting descriptions.
 */
interface TextProps {
  children: ReactNode;
  className?: string;
  delay?: number; // seconds
  delayMs?: number; // milliseconds
  as?: 'p' | 'div' | 'span';
}

export function AnimatedText({
  children,
  className = '',
  delay = 0.15,
  delayMs,
  as: Component = 'div',
}: TextProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const effectiveDelaySec = delayMs !== undefined ? delayMs / 1000 : delay;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Component
      ref={ref as any}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        transition: `opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${effectiveDelaySec}s, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${effectiveDelaySec}s`,
        willChange: 'opacity, transform',
      }}
    >
      {children}
    </Component>
  );
}
