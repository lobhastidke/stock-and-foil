import { ethers } from 'ethers';
import {
  ChainAdapter,
  ChainEvent,
  ChainMode,
  Hex,
  OnChainState,
  TxResult,
} from './types.js';

export interface MockStoredInvoice {
  state: OnChainState;
  supplierRef: Hex;
  buyerRef: Hex;
  financierRef?: Hex;
  registeredAt: number;
  updatedAt: number;
}

export interface MockStateStore {
  getInvoice(commitment: string): Promise<MockStoredInvoice | undefined>;
  saveInvoice(commitment: string, invoice: MockStoredInvoice): Promise<void>;
  isMarkerUsed(marker: string): Promise<boolean>;
  setMarkerUsed(marker: string): Promise<void>;
  getTx(txHash: string): Promise<TxResult | undefined>;
  saveTx(txHash: string, result: TxResult): Promise<void>;
  getEvents(): Promise<ChainEvent[]>;
  saveEvent(event: ChainEvent): Promise<void>;
}

export class InMemoryMockStateStore implements MockStateStore {
  private invoices = new Map<string, MockStoredInvoice>();
  private markers = new Set<string>();
  private txs = new Map<string, TxResult>();
  private events: ChainEvent[] = [];

  async getInvoice(commitment: string): Promise<MockStoredInvoice | undefined> {
    return this.invoices.get(commitment.toLowerCase());
  }

  async saveInvoice(commitment: string, invoice: MockStoredInvoice): Promise<void> {
    this.invoices.set(commitment.toLowerCase(), invoice);
  }

  async isMarkerUsed(marker: string): Promise<boolean> {
    return this.markers.has(marker.toLowerCase());
  }

  async setMarkerUsed(marker: string): Promise<void> {
    this.markers.add(marker.toLowerCase());
  }

  async getTx(txHash: string): Promise<TxResult | undefined> {
    return this.txs.get(txHash.toLowerCase());
  }

  async saveTx(txHash: string, result: TxResult): Promise<void> {
    this.txs.set(txHash.toLowerCase(), result);
  }

  async getEvents(): Promise<ChainEvent[]> {
    return [...this.events];
  }

  async saveEvent(event: ChainEvent): Promise<void> {
    this.events.push(event);
  }
}

export class MockAdapter implements ChainAdapter {
  private store: MockStateStore;
  private currentBlock = 1000;
  private txCounter = 0;

  constructor(store?: MockStateStore) {
    this.store = store || new InMemoryMockStateStore();
  }

  public mode(): ChainMode {
    return 'MOCK';
  }

  /**
   * Generates a deterministic mock transaction hash clearly prefixed with 0xmock
   * (e.g. 0xmock00000000... with exactly 64 hex characters after 0x)
   */
  private generateMockTxHash(): Hex {
    this.txCounter++;
    const hexCounter = this.txCounter.toString(16).padStart(60, '0');
    return `0xmock${hexCounter}` as Hex;
  }

  public computePledgeMarker(commitment: Hex): Hex {
    const domainBytes = ethers.toUtf8Bytes('STOCKFOIL_PLEDGE_V1');
    const commitmentBytes = ethers.getBytes(commitment);
    const packed = ethers.concat([domainBytes, commitmentBytes]);
    return ethers.keccak256(packed) as Hex;
  }

  public async registerInvoice(a: {
    commitment: Hex;
    supplierRef: Hex;
    buyerRef: Hex;
  }): Promise<TxResult> {
    if (!a.commitment || !a.supplierRef || !a.buyerRef) {
      return { status: 'FAILED', errorCode: 'UNKNOWN' };
    }

    const existing = await this.store.getInvoice(a.commitment);
    if (existing && existing.state !== 'NONE') {
      return { status: 'FAILED', errorCode: 'WRONG_STATE' };
    }

    const now = Math.floor(Date.now() / 1000);
    await this.store.saveInvoice(a.commitment, {
      state: 'REGISTERED',
      supplierRef: a.supplierRef,
      buyerRef: a.buyerRef,
      registeredAt: now,
      updatedAt: now,
    });

    this.currentBlock++;
    const txHash = this.generateMockTxHash();
    const result: TxResult = {
      status: 'CONFIRMED',
      txHash,
      blockNumber: this.currentBlock,
    };
    await this.store.saveTx(txHash, result);

    await this.store.saveEvent({
      name: 'InvoiceRegistered',
      commitment: a.commitment,
      blockNumber: this.currentBlock,
      txHash,
      args: {
        commitment: a.commitment,
        supplierRef: a.supplierRef,
        buyerRef: a.buyerRef,
      },
    });

    return result;
  }

  public async recordAcknowledgement(a: {
    commitment: Hex;
    buyerRef: Hex;
    accepted: boolean;
  }): Promise<TxResult> {
    const invoice = await this.store.getInvoice(a.commitment);
    if (!invoice || invoice.state === 'NONE') {
      return { status: 'FAILED', errorCode: 'NOT_FOUND' };
    }

    if (invoice.state !== 'REGISTERED') {
      return { status: 'FAILED', errorCode: 'WRONG_STATE' };
    }

    if (invoice.buyerRef.toLowerCase() !== a.buyerRef.toLowerCase()) {
      return { status: 'FAILED', errorCode: 'UNAUTHORIZED' };
    }

    invoice.state = a.accepted ? 'ACKNOWLEDGED' : 'REJECTED';
    invoice.updatedAt = Math.floor(Date.now() / 1000);
    await this.store.saveInvoice(a.commitment, invoice);

    this.currentBlock++;
    const txHash = this.generateMockTxHash();
    const result: TxResult = {
      status: 'CONFIRMED',
      txHash,
      blockNumber: this.currentBlock,
    };
    await this.store.saveTx(txHash, result);

    await this.store.saveEvent({
      name: 'AcknowledgementRecorded',
      commitment: a.commitment,
      blockNumber: this.currentBlock,
      txHash,
      args: {
        commitment: a.commitment,
        buyerRef: a.buyerRef,
        accepted: a.accepted,
      },
    });

    return result;
  }

  public async registerPledge(a: {
    commitment: Hex;
    pledgeMarker: Hex;
    financierRef: Hex;
  }): Promise<TxResult> {
    const invoice = await this.store.getInvoice(a.commitment);
    if (!invoice || invoice.state === 'NONE') {
      return { status: 'FAILED', errorCode: 'NOT_FOUND' };
    }

    const expectedMarker = this.computePledgeMarker(a.commitment);
    if (a.pledgeMarker.toLowerCase() !== expectedMarker.toLowerCase()) {
      return { status: 'FAILED', errorCode: 'WRONG_STATE' };
    }

    const isUsed = await this.store.isMarkerUsed(a.pledgeMarker);
    if (isUsed) {
      return { status: 'FAILED', errorCode: 'PLEDGE_MARKER_USED' };
    }

    if (invoice.state !== 'ACKNOWLEDGED') {
      return { status: 'FAILED', errorCode: 'WRONG_STATE' };
    }

    await this.store.setMarkerUsed(a.pledgeMarker);
    invoice.state = 'PLEDGED';
    invoice.financierRef = a.financierRef;
    invoice.updatedAt = Math.floor(Date.now() / 1000);
    await this.store.saveInvoice(a.commitment, invoice);

    this.currentBlock++;
    const txHash = this.generateMockTxHash();
    const result: TxResult = {
      status: 'CONFIRMED',
      txHash,
      blockNumber: this.currentBlock,
    };
    await this.store.saveTx(txHash, result);

    await this.store.saveEvent({
      name: 'PledgeRegistered',
      commitment: a.commitment,
      blockNumber: this.currentBlock,
      txHash,
      args: {
        commitment: a.commitment,
        pledgeMarker: a.pledgeMarker,
        financierRef: a.financierRef,
      },
    });

    return result;
  }

  public async markSettled(a: {
    commitment: Hex;
    financierRef: Hex;
  }): Promise<TxResult> {
    const invoice = await this.store.getInvoice(a.commitment);
    if (!invoice || invoice.state === 'NONE') {
      return { status: 'FAILED', errorCode: 'NOT_FOUND' };
    }

    if (invoice.state !== 'PLEDGED') {
      return { status: 'FAILED', errorCode: 'WRONG_STATE' };
    }

    if (
      !invoice.financierRef ||
      invoice.financierRef.toLowerCase() !== a.financierRef.toLowerCase()
    ) {
      return { status: 'FAILED', errorCode: 'UNAUTHORIZED' };
    }

    invoice.state = 'SETTLED';
    invoice.updatedAt = Math.floor(Date.now() / 1000);
    await this.store.saveInvoice(a.commitment, invoice);

    this.currentBlock++;
    const txHash = this.generateMockTxHash();
    const result: TxResult = {
      status: 'CONFIRMED',
      txHash,
      blockNumber: this.currentBlock,
    };
    await this.store.saveTx(txHash, result);

    await this.store.saveEvent({
      name: 'InvoiceSettled',
      commitment: a.commitment,
      blockNumber: this.currentBlock,
      txHash,
      args: {
        commitment: a.commitment,
        financierRef: a.financierRef,
      },
    });

    return result;
  }

  public async isPledgeMarkerUsed(marker: Hex): Promise<boolean> {
    return this.store.isMarkerUsed(marker);
  }

  public async getInvoiceState(commitment: Hex): Promise<OnChainState> {
    const invoice = await this.store.getInvoice(commitment);
    return invoice?.state || 'NONE';
  }

  public async getTxStatus(txHash: Hex): Promise<TxResult> {
    const tx = await this.store.getTx(txHash);
    return tx || { status: 'PENDING' };
  }

  public async getEvents(f?: {
    fromBlock?: number;
    commitment?: Hex;
  }): Promise<ChainEvent[]> {
    const all = await this.store.getEvents();
    return all.filter((ev) => {
      if (f?.fromBlock !== undefined && ev.blockNumber < f.fromBlock) {
        return false;
      }
      if (
        f?.commitment !== undefined &&
        ev.commitment.toLowerCase() !== f.commitment.toLowerCase()
      ) {
        return false;
      }
      return true;
    });
  }
}
