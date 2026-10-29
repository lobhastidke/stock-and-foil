export interface CommittedInvoiceData {
  invoiceNumber: string;
  supplierId: string;
  buyerId: string;
  amountMinorUnits: string;
  currency: string;
  issueDate: string;
  dueDate: string;
}

/**
 * Normalizes an integer string by trimming, removing any leading zeros (unless "0"),
 * and ensuring it represents a positive integer without floats.
 */
export function normalizeMinorUnits(amount: string | number | bigint): string {
  const str = String(amount).trim();
  if (!/^\d+$/.test(str)) {
    throw new Error(`Invalid amountMinorUnits '${amount}': must be an unsigned integer string.`);
  }
  const normalized = BigInt(str).toString(10);
  if (normalized === '0') {
    throw new Error('amountMinorUnits must be greater than zero.');
  }
  return normalized;
}

/**
 * Normalizes a date to YYYY-MM-DD.
 */
export function normalizeDate(dateStr: string): string {
  const trimmed = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`Invalid date format '${dateStr}': expected YYYY-MM-DD.`);
  }
  return trimmed;
}

/**
 * Creates canonical JSON according to RFC 8785 principles and Block A Section 3:
 * - Keys sorted alphabetically: amountMinorUnits, buyerId, currency, dueDate, invoiceNumber, issueDate, supplierId, v
 * - No whitespace
 * - Strings trimmed and Unicode NFC-normalized
 * - invoiceNumber case-sensitive
 * - currency uppercase ISO-4217
 * - amountMinorUnits base-10 integer string without leading zeros
 * - Dates YYYY-MM-DD
 * - UUIDs lowercase
 * - v: 1
 */
export function toCanonicalJson(data: CommittedInvoiceData): string {
  const normalized = {
    amountMinorUnits: normalizeMinorUnits(data.amountMinorUnits),
    buyerId: data.buyerId.trim().toLowerCase(),
    currency: data.currency.trim().toUpperCase(),
    dueDate: normalizeDate(data.dueDate),
    invoiceNumber: data.invoiceNumber.trim().normalize('NFC'),
    issueDate: normalizeDate(data.issueDate),
    supplierId: data.supplierId.trim().toLowerCase(),
    v: 1,
  };

  // Explicit deterministic JSON serialization with alphabetically sorted keys and no whitespace
  return JSON.stringify(normalized, Object.keys(normalized).sort());
}
