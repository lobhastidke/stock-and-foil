import { describe, it, expect } from 'vitest';
import {
  rupeesToMinorUnits,
  minorUnitsToDisplay,
  formatMoney,
  minorGt,
  minorLte,
  isZero,
} from '../lib/money.js';

describe('money utilities (no floats, minor units only)', () => {
  describe('rupeesToMinorUnits', () => {
    it('converts integer rupee strings to minor units', () => {
      expect(rupeesToMinorUnits('5000')).toBe('500000');
      expect(rupeesToMinorUnits('100')).toBe('10000');
    });

    it('converts decimal rupee strings to minor units', () => {
      expect(rupeesToMinorUnits('5000.00')).toBe('500000');
      expect(rupeesToMinorUnits('5000.50')).toBe('500050');
      expect(rupeesToMinorUnits('5000.5')).toBe('500050');
      expect(rupeesToMinorUnits('0.01')).toBe('1');
    });

    it('strips leading zeros correctly', () => {
      expect(rupeesToMinorUnits('050.00')).toBe('5000');
      expect(rupeesToMinorUnits('0.00')).toBe('0');
      expect(rupeesToMinorUnits('0')).toBe('0');
    });

    it('returns null for invalid inputs', () => {
      expect(rupeesToMinorUnits('-50')).toBeNull();
      expect(rupeesToMinorUnits('abc')).toBeNull();
      expect(rupeesToMinorUnits('50.001')).toBeNull();
      expect(rupeesToMinorUnits('50.0.0')).toBeNull();
    });
  });

  describe('minorUnitsToDisplay', () => {
    it('formats large numbers with commas', () => {
      expect(minorUnitsToDisplay('500000')).toBe('5,000.00');
      expect(minorUnitsToDisplay('100000000')).toBe('1,000,000.00');
    });

    it('formats small amounts', () => {
      expect(minorUnitsToDisplay('1')).toBe('0.01');
      expect(minorUnitsToDisplay('10')).toBe('0.10');
      expect(minorUnitsToDisplay('0')).toBe('0.00');
    });
  });

  describe('formatMoney', () => {
    it('formats INR with rupee symbol', () => {
      expect(formatMoney('500000', 'INR')).toBe('₹5,000.00');
    });

    it('formats USD with dollar symbol', () => {
      expect(formatMoney('500000', 'USD')).toBe('$5,000.00');
    });

    it('formats other currencies with code suffix', () => {
      expect(formatMoney('500000', 'SGD')).toBe('5,000.00 SGD');
    });
  });

  describe('comparison functions', () => {
    it('minorGt', () => {
      expect(minorGt('500001', '500000')).toBe(true);
      expect(minorGt('500000', '500000')).toBe(false);
      expect(minorGt('499999', '500000')).toBe(false);
    });

    it('minorLte', () => {
      expect(minorLte('500000', '500000')).toBe(true);
      expect(minorLte('499999', '500000')).toBe(true);
      expect(minorLte('500001', '500000')).toBe(false);
    });

    it('isZero', () => {
      expect(isZero('0')).toBe(true);
      expect(isZero('000')).toBe(true);
      expect(isZero('1')).toBe(false);
    });
  });
});
