/**
 * components/ReactBits/DecryptedText.tsx
 *
 * Inspired by React Bits (reactbits.dev) DecryptedText component.
 * Provides a cryptographic text-scramble reveal effect perfect for blockchain,
 * invoice hashes, status locks, and fintech security guarantees.
 */

import React, { useEffect, useState, useRef } from 'react';
import styles from './DecryptedText.module.css';

interface DecryptedTextProps {
  text: string;
  speed?: number;
  maxIterations?: number;
  sequential?: boolean;
  revealDirection?: 'start' | 'end' | 'center';
  useOriginalCharsOnly?: boolean;
  characters?: string;
  className?: string;
  parentClassName?: string;
  encryptedClassName?: string;
  animateOn?: 'view' | 'hover';
}

const DEFAULT_CHARS = '0123456789ABCDEFabcdef!@#$%&*_+=~';

export function DecryptedText({
  text,
  speed = 40,
  maxIterations = 12,
  sequential = true,
  revealDirection = 'start',
  useOriginalCharsOnly = false,
  characters = DEFAULT_CHARS,
  className = '',
  parentClassName = '',
  encryptedClassName = '',
  animateOn = 'view',
}: DecryptedTextProps) {
  const [displayText, setDisplayText] = useState(text);
  const [isHovering, setIsHovering] = useState(false);
  const [isScrambling, setIsScrambling] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const hasAnimatedRef = useRef(false);

  const availableChars = useOriginalCharsOnly
    ? Array.from(new Set(text.split(''))).filter((c) => c !== ' ')
    : characters.split('');

  function getRandomChar() {
    return availableChars[Math.floor(Math.random() * availableChars.length)] || '#';
  }

  function startAnimation() {
    if (isScrambling) return;
    setIsScrambling(true);

    const length = text.length;
    let iteration = 0;

    const interval = setInterval(() => {
      setDisplayText(() => {
        return text
          .split('')
          .map((char, index) => {
            if (char === ' ') return ' ';

            if (sequential) {
              let threshold = 0;
              if (revealDirection === 'start') {
                threshold = (iteration / maxIterations) * length;
                if (index < threshold) return text[index];
              } else if (revealDirection === 'end') {
                threshold = length - (iteration / maxIterations) * length;
                if (index >= threshold) return text[index];
              } else {
                // center
                const center = length / 2;
                const dist = Math.abs(index - center);
                const currentDist = (iteration / maxIterations) * center;
                if (dist <= currentDist) return text[index];
              }
              return getRandomChar();
            }

            // Non-sequential
            if (iteration >= maxIterations) return text[index];
            return Math.random() < iteration / maxIterations ? text[index] : getRandomChar();
          })
          .join('');
      });

      iteration += 1;
      if (iteration > maxIterations) {
        clearInterval(interval);
        setDisplayText(text);
        setIsScrambling(false);
      }
    }, speed);
  }

  useEffect(() => {
    if (animateOn === 'view') {
      const el = containerRef.current;
      if (!el) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && !hasAnimatedRef.current) {
            hasAnimatedRef.current = true;
            startAnimation();
          }
        },
        { threshold: 0.15 },
      );

      observer.observe(el);
      return () => observer.disconnect();
    }
  }, [text, animateOn]);

  return (
    <span
      ref={containerRef}
      className={`${styles.container} ${parentClassName}`}
      onMouseEnter={() => {
        if (animateOn === 'hover') {
          setIsHovering(true);
          startAnimation();
        }
      }}
      onMouseLeave={() => {
        if (animateOn === 'hover') {
          setIsHovering(false);
        }
      }}
    >
      <span className={`${styles.text} ${isScrambling ? encryptedClassName : className}`}>
        {displayText}
      </span>
    </span>
  );
}
