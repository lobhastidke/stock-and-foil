export type InvoiceStatus =
  | 'DRAFT'
  | 'PENDING_ACK'
  | 'ACKNOWLEDGED'
  | 'REJECTED'
  | 'AVAILABLE'
  | 'PLEDGED'
  | 'SETTLED';

export type AckDecision = 'ACKNOWLEDGE' | 'REJECT';

export class InvalidTransitionError extends Error {
  public readonly code = 'INVALID_TRANSITION';
  public readonly statusCode = 409;
  public readonly fromStatus: InvoiceStatus;
  public readonly toStatus: InvoiceStatus;

  constructor(fromStatus: InvoiceStatus, toStatus: InvoiceStatus, customMessage?: string) {
    super(
      customMessage ||
        `Cannot transition invoice from status '${fromStatus}' to '${toStatus}'. This transition is illegal under the Stock & Foil lifecycle.`
    );
    this.name = 'InvalidTransitionError';
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
  }
}

/**
 * Valid transitions graph:
 * DRAFT -> PENDING_ACK (Supplier commit)
 * PENDING_ACK -> ACKNOWLEDGED (Buyer ACKNOWLEDGE)
 * PENDING_ACK -> REJECTED (Buyer REJECT)
 * ACKNOWLEDGED -> AVAILABLE (Supplier release)
 * AVAILABLE -> PLEDGED (Financier pledge)
 * PLEDGED -> SETTLED (Financier settle)
 * REJECTED is terminal.
 * SETTLED is terminal.
 */
const ALLOWED_TRANSITIONS: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  DRAFT: ['PENDING_ACK'],
  PENDING_ACK: ['ACKNOWLEDGED', 'REJECTED'],
  ACKNOWLEDGED: ['AVAILABLE'],
  AVAILABLE: ['PLEDGED'],
  PLEDGED: ['SETTLED'],
  REJECTED: [],
  SETTLED: [],
};

/**
 * Validates whether a proposed transition is legal.
 * Throws InvalidTransitionError (409) if the transition is forbidden.
 */
export function assertTransition(current: InvoiceStatus, next: InvoiceStatus): void {
  const allowed = ALLOWED_TRANSITIONS[current] || [];
  if (!allowed.includes(next)) {
    throw new InvalidTransitionError(current, next);
  }
}

/**
 * Checks whether editing invoice fields is allowed (strictly in DRAFT).
 */
export function assertEditable(status: InvoiceStatus): void {
  if (status !== 'DRAFT') {
    throw new InvalidTransitionError(
      status,
      status,
      `Invoices cannot be modified once they leave DRAFT status (current status: ${status}).`
    );
  }
}
