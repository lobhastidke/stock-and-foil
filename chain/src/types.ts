/**
 * @stockfoil/chain - Shared Type Definitions
 * Specified in Stock & Foil Integration Contract Section 6.
 */

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

export type ChainMode = 'MOCK' | 'HARDHAT' | 'MST_TESTNET';

export interface ChainEvent {
  name: string;
  commitment: Hex;
  blockNumber: number;
  txHash: Hex;
  args: Record<string, unknown>;
}

export interface ChainAdapter {
  mode(): ChainMode;
  registerInvoice(a: { commitment: Hex; supplierRef: Hex; buyerRef: Hex }): Promise<TxResult>;
  recordAcknowledgement(a: { commitment: Hex; buyerRef: Hex; accepted: boolean }): Promise<TxResult>;
  registerPledge(a: { commitment: Hex; pledgeMarker: Hex; financierRef: Hex }): Promise<TxResult>;
  markSettled(a: { commitment: Hex; financierRef: Hex }): Promise<TxResult>;
  isPledgeMarkerUsed(marker: Hex): Promise<boolean>;
  getInvoiceState(commitment: Hex): Promise<OnChainState>;
  getTxStatus(txHash: Hex): Promise<TxResult>;
  getEvents(f?: { fromBlock?: number; commitment?: Hex }): Promise<ChainEvent[]>;
}

export interface AdapterConfig {
  chainMode?: ChainMode;
  rpcUrl?: string;
  chainId?: number;
  contractAddress?: string;
  operatorPrivateKey?: string;
}
