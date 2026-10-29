export class MoneyValidationError extends Error {
  public readonly code = 'VALIDATION_ERROR';
  public readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'MoneyValidationError';
  }
}

// Max boundary: 10^18 minor units (1 quintillion), preventing BigInt overflow
const MAX_MINOR_UNITS = BigInt('1000000000000000000');

/**
 * Validates that an amount string is a valid positive integer minor units string.
 * Strictly forbids floats, negative values, zero, and scientific notation.
 */
export function validateMinorUnits(amount: unknown): string {
  if (typeof amount !== 'string' && typeof amount !== 'number' && typeof amount !== 'bigint') {
    throw new MoneyValidationError('amountMinorUnits must be provided as an integer string.');
  }

  const str = String(amount).trim();

  if (!/^\d+$/.test(str)) {
    throw new MoneyValidationError(`Invalid amount '${amount}': must contain only digits (no decimal points or symbols).`);
  }

  const val = BigInt(str);

  if (val <= 0n) {
    throw new MoneyValidationError('amountMinorUnits must be strictly greater than zero.');
  }

  if (val > MAX_MINOR_UNITS) {
    throw new MoneyValidationError('amountMinorUnits exceeds maximum allowable limit.');
  }

  return val.toString(10);
}

/**
 * Validates an ISO-4217 3-letter currency code (e.g. INR, USD, EUR, GBP).
 */
export function validateCurrency(currency: unknown): string {
  if (typeof currency !== 'string') {
    throw new MoneyValidationError('Currency must be a string.');
  }
  const clean = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(clean)) {
    throw new MoneyValidationError(`Invalid currency '${currency}': must be a 3-letter uppercase ISO-4217 code.`);
  }
  return clean;
}

/**
 * Validates that dueDate is on or after issueDate.
 */
export function validateInvoiceDates(issueDate: string, dueDate: string): void {
  const issue = new Date(`${issueDate}T00:00:00.000Z`);
  const due = new Date(`${dueDate}T00:00:00.000Z`);

  if (isNaN(issue.getTime())) {
    throw new MoneyValidationError(`Invalid issueDate: '${issueDate}'. Must be YYYY-MM-DD.`);
  }
  if (isNaN(due.getTime())) {
    throw new MoneyValidationError(`Invalid dueDate: '${dueDate}'. Must be YYYY-MM-DD.`);
  }

  if (due < issue) {
    throw new MoneyValidationError(`dueDate (${dueDate}) cannot be earlier than issueDate (${issueDate}).`);
  }
}
