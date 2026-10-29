import { EvmAdapter } from './EvmAdapter.js';
import { MockAdapter } from './MockAdapter.js';
import { AdapterConfig, ChainAdapter, ChainMode } from './types.js';

export function createChainAdapter(config?: AdapterConfig): ChainAdapter {
  const mode: ChainMode =
    config?.chainMode ||
    (process.env.CHAIN_MODE as ChainMode) ||
    'MOCK';

  if (mode === 'MOCK') {
    return new MockAdapter();
  }

  const rpcUrl = config?.rpcUrl || process.env.CHAIN_RPC_URL;
  const chainId =
    config?.chainId ||
    (process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID, 10) : undefined);
  const contractAddress =
    config?.contractAddress || process.env.CONTRACT_ADDRESS;
  const operatorPrivateKey =
    config?.operatorPrivateKey || process.env.OPERATOR_PRIVATE_KEY;

  if (mode === 'MST_TESTNET') {
    const missing: string[] = [];
    if (!contractAddress) missing.push('CONTRACT_ADDRESS');
    if (!rpcUrl) missing.push('CHAIN_RPC_URL');
    if (!chainId) missing.push('CHAIN_ID');
    if (!operatorPrivateKey) missing.push('OPERATOR_PRIVATE_KEY');

    if (missing.length > 0) {
      throw new Error(
        `[StockFoil Chain] Cannot initialize MST_TESTNET adapter. Missing configuration: ${missing.join(
          ', '
        )}. Official verified values must be provided in environment variables.`
      );
    }

    return new EvmAdapter({
      mode: 'MST_TESTNET',
      rpcUrl: rpcUrl!,
      chainId: chainId!,
      contractAddress: contractAddress!,
      operatorPrivateKey: operatorPrivateKey!,
    });
  }

  // mode === 'HARDHAT'
  if (!contractAddress) {
    throw new Error(
      '[StockFoil Chain] Cannot initialize HARDHAT adapter. CONTRACT_ADDRESS must be defined.'
    );
  }

  return new EvmAdapter({
    mode: 'HARDHAT',
    rpcUrl: rpcUrl || 'http://127.0.0.1:8545',
    chainId: chainId || 31337,
    contractAddress,
    operatorPrivateKey:
      operatorPrivateKey ||
      // Standard local Hardhat account #1 (operator role in tests/local)
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  });
}
