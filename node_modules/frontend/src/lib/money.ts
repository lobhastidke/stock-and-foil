/**
 * lib/money.ts
 *
 * All money operations use integer arithmetic on minor-unit strings.
 * NEVER use parseFloat or Number() for money values.
 *
 * The contract says: amountMinorUnits is "a base-10 integer STRING without
 * leading zeros". E.g. INR 5,000.00 = "500000".
 */

/** Currency → symbol mapping (extend as needed). */
const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

/**
 * Convert a human-readable rupees/dollars string to a minor-unit string.
 *
 * Examples:
 *   "5000"    → "500000"
 *   "5000.00" → "500000"
 *   "5000.5"  → "500050"
 *   "0.01"    → "1"
 *   "0"       → "0"
 *
 * Returns null if the input is invalid (non-numeric, negative, etc.).
 */
export function rupeesToMinorUnits(majorStr: string): string | null {
  // Only allow digits and at most one decimal point
  if (!/^\d+(\.\d{0,2})?$/.test(majorStr.trim())) return null;

  const [intPart = '0', decPart = ''] = majorStr.trim().split('.');

  // Pad or truncate the decimal part to exactly 2 chars
  const cents = decPart.padEnd(2, '0').slice(0, 2);

  // Concatenate and strip leading zeros (but keep at least "0")
  const raw = intPart + cents;
  const stripped = raw.replace(/^0+/, '') || '0';

  return stripped;
}

/**
 * Convert a minor-unit string to a display string in major units.
 *
 * Examples:
 *   "500000" → "5,000.00"
 *   "1"      → "0.01"
 *   "0"      → "0.00"
 */
export function minorUnitsToDisplay(minorStr: string): string {
  // Strip leading zeros
  const digits = minorStr.replace(/^0+/, '') || '0';

  let intPart: string;
  let decPart: string;

  if (digits.length <= 2) {
    intPart = '0';
    decPart = digits.padStart(2, '0');
  } else {
    intPart = digits.slice(0, digits.length - 2);
    decPart = digits.slice(digits.length - 2);
  }

  // Format intPart with commas (international format)
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${formatted}.${decPart}`;
}

/** Alias for minorUnitsToDisplay */
export const minorUnitsToRupees = minorUnitsToDisplay;

/**
 * Format a minor-unit string with its currency symbol.
 *
 * Examples:
 *   ("500000", "INR") → "₹5,000.00"
 *   ("500000", "USD") → "$5,000.00"
 *   ("500000", "XYZ") → "5,000.00 XYZ"
 */
export function formatMoney(minorStr: string, currency: string): string {
  const amount = minorUnitsToDisplay(minorStr);
  const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()];
  if (symbol) return `${symbol}${amount}`;
  return `${amount} ${currency.toUpperCase()}`;
}

/**
 * Returns true if a is greater than b (both minor-unit strings).
 * Uses BigInt to avoid any floating-point issues with very large amounts.
 */
export function minorGt(a: string, b: string): boolean {
  return BigInt(a) > BigInt(b);
}

/**
 * Returns true if a <= b (both minor-unit strings).
 */
export function minorLte(a: string, b: string): boolean {
  return BigInt(a) <= BigInt(b);
}

/** Returns true if the minor-unit string is zero. */
export function isZero(minorStr: string): boolean {
  return BigInt(minorStr) === 0n;
}
