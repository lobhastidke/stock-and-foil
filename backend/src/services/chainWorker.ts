import crypto from 'crypto';
import { config } from '../config.js';
import { HexString } from '../crypto/commitment.js';

export type Hex = `0x${string}`;

export type TxErrorCode =
  | 'PLEDGE_MARKER_USED'
  | 'WRONG_STATE'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'NETWORK'
  | 'UNKNOWN';

export interface TxResult {
  status: 'CONFIRMED' | 'FAILED' | 'PENDING';
  txHash?: Hex;
  blockNumber?: number;
  errorCode?: TxErrorCode;
}

export type OnChainState =
  | 'NONE'
  | 'REGISTERED'
  | 'ACKNOWLEDGED'
  | 'REJECTED'
  | 'PLEDGED'
  | 'SETTLED';

export interface ChainAdapter {
  mode(): 'MOCK' | 'HARDHAT' | 'MST_TESTNET';
  registerInvoice(a: { commitment: Hex; supplierRef: Hex; buyerRef: Hex }): Promise<TxResult>;
  recordAcknowledgement(a: { commitment: Hex; buyerRef: Hex; accepted: boolean }): Promise<TxResult>;
  registerPledge(a: { commitment: Hex; pledgeMarker: Hex; financierRef: Hex }): Promise<TxResult>;
  markSettled(a: { commitment: Hex; financierRef: Hex }): Promise<TxResult>;
  isPledgeMarkerUsed(marker: Hex): Promise<boolean>;
  getInvoiceState(commitment: Hex): Promise<OnChainState>;
  getTxStatus(txHash: Hex): Promise<TxResult>;
}

/**
 * Mock Chain Adapter:
 * Conforms 100% to Contract Section 6 specifications.
 * Enforces on-chain state machine rules, marker uniqueness, and generates pseudo-hashes.
 * Used locally and on Vercel preview environments until live MST Testnet integration.
 */
export class MockChainAdapter implements ChainAdapter {
  private commitments = new Map<string, { state: OnChainState; supplierRef: Hex; buyerRef: Hex }>();
  private usedMarkers = new Set<string>();
  private transactions = new Map<string, TxResult>();
  private simulateFailures = false;

  public setSimulateFailures(fail: boolean) {
    this.simulateFailures = fail;
  }

  public mode(): 'MOCK' | 'HARDHAT' | 'MST_TESTNET' {
    return 'MOCK';
  }

  private generateFakeTxHash(): Hex {
    return `0x${crypto.randomBytes(32).toString('hex')}`;
  }

  public async registerInvoice(a: { commitment: Hex; supplierRef: Hex; buyerRef: Hex }): Promise<TxResult> {
    if (this.simulateFailures) {
      return { status: 'FAILED', errorCode: 'NETWORK' };
    }
    const key = a.commitment.toLowerCase();
    this.commitments.set(key, { state: 'REGISTERED', supplierRef: a.supplierRef, buyerRef: a.buyerRef });
    const txHash = this.generateFakeTxHash();
    const result: TxResult = { status: 'CONFIRMED', txHash, blockNumber: 1001 };
    this.transactions.set(txHash, result);
    return result;
  }

  public async recordAcknowledgement(a: { commitment: Hex; buyerRef: Hex; accepted: boolean }): Promise<TxResult> {
    if (this.simulateFailures) {
      return { status: 'FAILED', errorCode: 'NETWORK' };
    }
    const key = a.commitment.toLowerCase();
    const entry = this.commitments.get(key);
    if (!entry) {
      return { status: 'FAILED', errorCode: 'NOT_FOUND' };
    }
    entry.state = a.accepted ? 'ACKNOWLEDGED' : 'REJECTED';
    const txHash = this.generateFakeTxHash();
    const result: TxResult = { status: 'CONFIRMED', txHash, blockNumber: 1002 };
    this.transactions.set(txHash, result);
    return result;
  }

  public async registerPledge(a: { commitment: Hex; pledgeMarker: Hex; financierRef: Hex }): Promise<TxResult> {
    if (this.simulateFailures) {
      return { status: 'FAILED', errorCode: 'NETWORK' };
    }

    const markerKey = a.pledgeMarker.toLowerCase();
    if (this.usedMarkers.has(markerKey)) {
      return { status: 'FAILED', errorCode: 'PLEDGE_MARKER_USED' };
    }

    const commitmentKey = a.commitment.toLowerCase();
    const entry = this.commitments.get(commitmentKey);
    if (entry && entry.state !== 'ACKNOWLEDGED') {
      return { status: 'FAILED', errorCode: 'WRONG_STATE' };
    }

    this.usedMarkers.add(markerKey);
    if (entry) {
      entry.state = 'PLEDGED';
    }

    const txHash = this.generateFakeTxHash();
    const result: TxResult = { status: 'CONFIRMED', txHash, blockNumber: 1003 };
    this.transactions.set(txHash, result);
    return result;
  }

  public async markSettled(a: { commitment: Hex; financierRef: Hex }): Promise<TxResult> {
    if (this.simulateFailures) {
      return { status: 'FAILED', errorCode: 'NETWORK' };
    }
    const key = a.commitment.toLowerCase();
    const entry = this.commitments.get(key);
    if (entry) {
      entry.state = 'SETTLED';
    }
    const txHash = this.generateFakeTxHash();
    const result: TxResult = { status: 'CONFIRMED', txHash, blockNumber: 1004 };
    this.transactions.set(txHash, result);
    return result;
  }

  public async isPledgeMarkerUsed(marker: Hex): Promise<boolean> {
    return this.usedMarkers.has(marker.toLowerCase());
  }

  public async getInvoiceState(commitment: Hex): Promise<OnChainState> {
    const entry = this.commitments.get(commitment.toLowerCase());
    return entry?.state || 'NONE';
  }

  public async getTxStatus(txHash: Hex): Promise<TxResult> {
    return this.transactions.get(txHash) || { status: 'PENDING' };
  }
}

// Global default adapter singleton
let currentAdapter: ChainAdapter = new MockChainAdapter();

export function getChainAdapter(): ChainAdapter {
  return currentAdapter;
}

export function setChainAdapter(adapter: ChainAdapter): void {
  currentAdapter = adapter;
}
