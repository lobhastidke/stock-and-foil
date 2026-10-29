import {
  Contract,
  ethers,
  Interface,
  JsonRpcProvider,
  Signer,
  Wallet,
} from 'ethers';
import { StockFoilRegistryAbi } from './abi/index.js';
import {
  ChainAdapter,
  ChainEvent,
  ChainMode,
  Hex,
  OnChainState,
  TxErrorCode,
  TxResult,
} from './types.js';

const STATE_MAPPING: Record<number, OnChainState> = {
  0: 'NONE',
  1: 'REGISTERED',
  2: 'ACKNOWLEDGED',
  3: 'REJECTED',
  4: 'PLEDGED',
  5: 'SETTLED',
};

export interface EvmAdapterOptions {
  mode?: ChainMode;
  rpcUrl?: string;
  chainId?: number;
  contractAddress: string;
  operatorPrivateKey?: string;
  signer?: Signer;
  provider?: ethers.Provider;
  confirmationTimeoutMs?: number;
}

export class EvmAdapter implements ChainAdapter {
  private adapterMode: ChainMode;
  private provider: ethers.Provider;
  private signer?: Signer;
  private contract: Contract;
  private confirmationTimeoutMs: number;

  constructor(options: EvmAdapterOptions) {
    this.adapterMode = options.mode || 'HARDHAT';
    this.confirmationTimeoutMs = options.confirmationTimeoutMs || 4000;

    if (options.provider) {
      this.provider = options.provider;
    } else if (options.rpcUrl) {
      this.provider = new JsonRpcProvider(options.rpcUrl, options.chainId);
    } else {
      throw new Error('EvmAdapter: Either rpcUrl or provider must be supplied.');
    }

    if (options.signer) {
      this.signer = options.signer;
    } else if (options.operatorPrivateKey) {
      const key = options.operatorPrivateKey.startsWith('0x')
        ? options.operatorPrivateKey
        : `0x${options.operatorPrivateKey}`;
      this.signer = new Wallet(key, this.provider);
    }

    const runner = this.signer || this.provider;
    this.contract = new Contract(
      options.contractAddress,
      StockFoilRegistryAbi,
      runner
    );
  }

  public mode(): ChainMode {
    return this.adapterMode;
  }

  public getContractAddress(): string {
    return this.contract.target as string;
  }

  private async getFreshNonce(): Promise<number | undefined> {
    if (!this.signer) return undefined;
    try {
      const address = await this.signer.getAddress();
      if ('send' in this.provider && typeof (this.provider as any).send === 'function') {
        const hex = await (this.provider as any).send('eth_getTransactionCount', [
          address,
          'latest',
        ]);
        return parseInt(hex, 16);
      }
    } catch {
      // Fallback to internal nonce
    }
    return undefined;
  }

  private decodeError(error: any): TxErrorCode {
    // 1. Check direct revert name if already parsed
    const revertName =
      error?.revert?.name ||
      error?.error?.revert?.name ||
      error?.info?.error?.revert?.name ||
      error?.invocation?.revert?.name;

    if (revertName) {
      if (revertName === 'PledgeMarkerAlreadyUsed') return 'PLEDGE_MARKER_USED';
      if (
        revertName === 'WrongState' ||
        revertName === 'InvalidPledgeMarker' ||
        revertName === 'AlreadyRegistered' ||
        revertName === 'ZeroValue'
      ) {
        return 'WRONG_STATE';
      }
      if (revertName === 'UnknownCommitment') return 'NOT_FOUND';
      if (
        revertName === 'NotBuyer' ||
        revertName === 'NotFinancier' ||
        revertName === 'AccessControlUnauthorizedAccount'
      ) {
        return 'UNAUTHORIZED';
      }
    }

    // 2. Extract raw data hex from error and parse through interface
    const candidateData = [
      error?.data,
      error?.error?.data,
      error?.error?.data?.data,
      error?.info?.error?.data,
      error?.info?.error?.data?.data,
      error?.receipt?.revertData,
    ];

    for (const rawData of candidateData) {
      if (typeof rawData === 'string' && rawData.startsWith('0x') && rawData.length >= 10) {
        try {
          const parsed = this.contract.interface.parseError(rawData);
          if (parsed) {
            if (parsed.name === 'PledgeMarkerAlreadyUsed') return 'PLEDGE_MARKER_USED';
            if (
              parsed.name === 'WrongState' ||
              parsed.name === 'InvalidPledgeMarker' ||
              parsed.name === 'AlreadyRegistered' ||
              parsed.name === 'ZeroValue'
            ) {
              return 'WRONG_STATE';
            }
            if (parsed.name === 'UnknownCommitment') return 'NOT_FOUND';
            if (
              parsed.name === 'NotBuyer' ||
              parsed.name === 'NotFinancier' ||
              parsed.name === 'AccessControlUnauthorizedAccount'
            ) {
              return 'UNAUTHORIZED';
            }
          }
        } catch {
          // Continue trying other candidates
        }
      }
    }

    // 3. Inspect message strings
    const msg = [
      error?.message,
      error?.shortMessage,
      error?.error?.message,
      error?.error?.data?.message,
      error?.info?.error?.message,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (msg.includes('pledgemarkeralreadyused')) return 'PLEDGE_MARKER_USED';
    if (
      msg.includes('wrongstate') ||
      msg.includes('invalidpledgemarker') ||
      msg.includes('alreadyregistered') ||
      msg.includes('zerovalue')
    ) {
      return 'WRONG_STATE';
    }
    if (msg.includes('unknowncommitment')) return 'NOT_FOUND';
    if (
      msg.includes('notbuyer') ||
      msg.includes('notfinancier') ||
      msg.includes('unauthorized') ||
      msg.includes('accesscontrol')
    ) {
      return 'UNAUTHORIZED';
    }
    if (
      msg.includes('network') ||
      msg.includes('timeout') ||
      msg.includes('econnrefused') ||
      msg.includes('bad response')
    ) {
      return 'NETWORK';
    }

    return 'UNKNOWN';
  }

  private async executeTx(
    fn: (overrides: { nonce?: number }) => Promise<ethers.ContractTransactionResponse>
  ): Promise<TxResult> {
    try {
      const nonce = await this.getFreshNonce();
      const overrides = nonce !== undefined ? { nonce } : {};
      const tx = await fn(overrides);
      const txHash = tx.hash as Hex;

      try {
        const receipt = await Promise.race([
          tx.wait(1),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('TIMEOUT_PENDING')), this.confirmationTimeoutMs)
          ),
        ]);

        if (receipt && receipt.status === 1) {
          return {
            status: 'CONFIRMED',
            txHash,
            blockNumber: receipt.blockNumber,
          };
        } else {
          return {
            status: 'FAILED',
            txHash,
            blockNumber: receipt?.blockNumber,
            errorCode: 'UNKNOWN',
          };
        }
      } catch (err: any) {
        if (err.message === 'TIMEOUT_PENDING') {
          return {
            status: 'PENDING',
            txHash,
          };
        }
        throw err;
      }
    } catch (err: any) {
      const errorCode = this.decodeError(err);
      return {
        status: 'FAILED',
        errorCode,
      };
    }
  }

  public async registerInvoice(a: {
    commitment: Hex;
    supplierRef: Hex;
    buyerRef: Hex;
  }): Promise<TxResult> {
    return this.executeTx((overrides) =>
      this.contract.registerInvoice(a.commitment, a.supplierRef, a.buyerRef, overrides)
    );
  }

  public async recordAcknowledgement(a: {
    commitment: Hex;
    buyerRef: Hex;
    accepted: boolean;
  }): Promise<TxResult> {
    return this.executeTx((overrides) =>
      this.contract.recordAcknowledgement(a.commitment, a.buyerRef, a.accepted, overrides)
    );
  }

  public async registerPledge(a: {
    commitment: Hex;
    pledgeMarker: Hex;
    financierRef: Hex;
  }): Promise<TxResult> {
    return this.executeTx((overrides) =>
      this.contract.registerPledge(a.commitment, a.pledgeMarker, a.financierRef, overrides)
    );
  }

  public async markSettled(a: {
    commitment: Hex;
    financierRef: Hex;
  }): Promise<TxResult> {
    return this.executeTx((overrides) =>
      this.contract.markSettled(a.commitment, a.financierRef, overrides)
    );
  }

  public async isPledgeMarkerUsed(marker: Hex): Promise<boolean> {
    return this.contract.isPledgeMarkerUsed(marker);
  }

  public async getInvoiceState(commitment: Hex): Promise<OnChainState> {
    try {
      const record = await this.contract.getInvoice(commitment);
      const stateNum = Number(record.state ?? record[0]);
      return STATE_MAPPING[stateNum] || 'NONE';
    } catch {
      return 'NONE';
    }
  }

  public async getTxStatus(txHash: Hex): Promise<TxResult> {
    try {
      const receipt = await this.provider.getTransactionReceipt(txHash);
      if (!receipt) {
        return { status: 'PENDING', txHash };
      }
      if (receipt.status === 1) {
        return {
          status: 'CONFIRMED',
          txHash,
          blockNumber: receipt.blockNumber,
        };
      }
      return {
        status: 'FAILED',
        txHash,
        blockNumber: receipt.blockNumber,
        errorCode: 'UNKNOWN',
      };
    } catch {
      return { status: 'PENDING', txHash };
    }
  }

  public async getEvents(f?: {
    fromBlock?: number;
    commitment?: Hex;
  }): Promise<ChainEvent[]> {
    const fromBlock = f?.fromBlock ?? 0;
    const eventNames = [
      'InvoiceRegistered',
      'AcknowledgementRecorded',
      'PledgeRegistered',
      'InvoiceSettled',
    ];

    const results: ChainEvent[] = [];

    for (const name of eventNames) {
      try {
        const query = (this.contract as any).filters[name](f?.commitment || null);
        const logs = await this.contract.queryFilter(query, fromBlock, 'latest');
        for (const log of logs) {
          const parsed = (this.contract.interface as Interface).parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          if (parsed) {
            const rawArgs: Record<string, unknown> = {};
            for (let i = 0; i < parsed.fragment.inputs.length; i++) {
              const input = parsed.fragment.inputs[i];
              rawArgs[input.name] = parsed.args[i];
            }

            results.push({
              name: parsed.name,
              commitment: (parsed.args[0] as Hex) || (f?.commitment ?? '0x'),
              blockNumber: log.blockNumber,
              txHash: log.transactionHash as Hex,
              args: rawArgs,
            });
          }
        }
      } catch {
        // Non-fatal if a specific filter has no events
      }
    }

    return results.sort((a, b) => a.blockNumber - b.blockNumber);
  }
}
