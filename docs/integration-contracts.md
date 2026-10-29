# Stock & Foil — Contracts & Chain Adapter Integration Guide (`docs/integration-contracts.md`)

**Owner:** Member 3 (Solidity Contracts, Chain Adapter, and MST Integration)  
**Branch:** `feature/contracts`  
**Contract Version:** v1 (`docs/CONTRACT.md`)

---

## 1. What is Built

Member 3 has delivered the complete smart contract subsystem and the `@stockfoil/chain` npm workspace package for the Stock & Foil registry.

### Core Deliverables

1. **Smart Contract (`contracts/contracts/StockFoilRegistry.sol`)**
   - Implements the complete privacy-preserving registry lifecycle: `registerInvoice`, `recordAcknowledgement`, `registerPledge`, `markSettled`.
   - Access control via OpenZeppelin (`DEFAULT_ADMIN_ROLE`, `OPERATOR_ROLE`).
   - Atomic Checks-Effects-Interactions double-pledge prevention with on-chain marker verification:
     `keccak256(abi.encodePacked("STOCKFOIL_PLEDGE_V1", commitment))`.
   - Solidity 0.8.24 compiled explicitly with `evmVersion: "paris"` to guarantee compatibility with custom or young EVM testnets (avoiding unsupported `PUSH0` opcodes).
   - Non-payable, non-upgradeable (immutable, trust-minimized, zero reentrancy risk).

2. **Hardhat Test Suite (`contracts/test/StockFoilRegistry.test.ts`)**
   - **25 passing tests** covering:
     - Access control restrictions and zero-address constructor guards.
     - Complete happy path lifecycle (Register -> Acknowledge -> Pledge -> Settle).
     - Terminal buyer rejection flow.
     - Negative validation reverts for all custom errors.
     - Cross-block and **same-block race condition testing** (automining disabled; two competing pledges submitted simultaneously in a single block — exactly one succeeds).
     - **100% verification against Member 2's `docs/commitment-vectors.json`** test vectors.
     - Randomized fuzzing / invariant testing (10 cycles).
   - **Code Coverage**: Achieved **100% Statements, 100% Branch Coverage, 100% Functions, and 100% Lines**.

3. **Chain Package (`chain/`, package `@stockfoil/chain`)**
   - Strictly implements the Integration Contract Section 6 specifications:
     - `src/types.ts`: `Hex`, `TxResult`, `TxErrorCode`, `OnChainState`, `ChainMode`, `ChainEvent`, `ChainAdapter`.
     - `src/MockAdapter.ts`: In-memory state machine implementing identical state transitions and duplicate pledge prevention without network dependencies; supports pluggable storage (`MockStateStore`).
     - `src/EvmAdapter.ts`: Production ethers v6 adapter with fresh on-chain nonce queries, custom error decoding, and fast confirmation timeout (returns `PENDING` rather than hanging serverless execution).
     - `src/createChainAdapter.ts`: Adapter factory picking implementation from `CHAIN_MODE` (`MOCK`, `HARDHAT`, `MST_TESTNET`).
     - `src/abi/StockFoilRegistry.json`: Auto-exported ABI artifact.
   - **Conformance Test Suite (`chain/src/__tests__/adapter.conformance.test.ts`)**:
     - **26 tests passing** validating that `MockAdapter` and `EvmAdapter` exhibit 100% identical behavior, error codes, and state transitions.

4. **Scripts & Tooling**
   - `contracts/scripts/deploy.ts`: Deploys contract and exports deployment address and chain ID to `contracts/deployments/<network>.json`.
   - `contracts/scripts/demo-local.ts`: Full local walkthrough demonstrating lifecycle and double-pledge rejection.

---

## 2. How to Run & Verify Locally

### 2.1 Running Contract Tests & Coverage
From repository root:
```bash
# Run 25 Hardhat tests
npm run test -w contracts

# Run code coverage (100% branch coverage)
npm run coverage -w contracts
```

### 2.2 Running Local Demo
```bash
npm run demo:local -w contracts
```
Output demonstrates the registration of an invoice, buyer acknowledgement, initial financing pledge, an intentional second pledge attempt that triggers `PledgeMarkerAlreadyUsed()`, and final loan settlement.

### 2.3 Running Chain Package Conformance Tests
```bash
# Build TypeScript and run 26 vitest tests
npm run build -w chain
npm run test -w chain
```

---

## 3. Guide for Member 2 (Backend Integration)

The backend no longer needs an internal mock. It can directly consume `@stockfoil/chain`.

### 3.1 Importing in Backend
In `backend/src/services/chainWorker.ts` (or wherever chain transactions are initiated):
```ts
import {
  createChainAdapter,
  ChainAdapter,
  TxResult,
  OnChainState,
  Hex,
} from '@stockfoil/chain';

// Singleton instance picking up CHAIN_MODE from environment variables:
export const chainAdapter: ChainAdapter = createChainAdapter();
```

### 3.2 Environment Variables
Add to `.env` or set in Vercel:
```ini
CHAIN_MODE=MOCK              # MOCK | HARDHAT | MST_TESTNET (default: MOCK)
CHAIN_RPC_URL=               # Required for HARDHAT or MST_TESTNET
CHAIN_ID=                    # Required for MST_TESTNET
CONTRACT_ADDRESS=            # Address from deploy.ts output
OPERATOR_PRIVATE_KEY=        # Hex private key of relayer
```

### 3.3 Error Code Mapping
`@stockfoil/chain` returns `TxResult`:
```ts
{
  status: 'CONFIRMED' | 'FAILED' | 'PENDING',
  txHash?: Hex,
  blockNumber?: number,
  errorCode?: 'PLEDGE_MARKER_USED' | 'WRONG_STATE' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'NETWORK' | 'UNKNOWN'
}
```
When `errorCode === 'PLEDGE_MARKER_USED'`, the backend should update pledge status to `REJECTED_DUPLICATE` and respond with `409 DUPLICATE_PLEDGE`.

---

## 4. Guide for Member 1 (Frontend Integration)

1. **Zero Frontend Wallet Requirement**: The registry operates via a custodial relayer model. The frontend does not connect to MetaMask or sign transactions directly; all interactions go through authenticated REST endpoints (`/api/v1/invoices`, `/api/v1/pledges`).
2. **Honest Copy & Badges**:
   - Invoices with `chainMode === 'MOCK'` must display "Local / Demo Registry", never "On-Chain".
   - When `chainMode === 'MST_TESTNET'`, display "MST Testnet Confirmed" with a link to the explorer.
   - Include honest disclosures: duplicate prevention is enforced solely within Stock & Foil; an on-chain commitment does not guarantee creditworthiness or delivery of physical goods.

---

## 5. Checklist for Stage 2 (MST Testnet Integration)

*MST Testnet deployment will take place in the final phase once backend and frontend are verified.*

Before deploying to MST:
1. Verify official documentation for:
   - Chain ID
   - RPC URL
   - Supported EVM Version (`paris` verified)
   - Block Explorer URL
   - Official Faucet URL
2. Fund testnet operator address via official faucet.
3. Deploy via:
   ```bash
   npx hardhat run scripts/deploy.ts --network mstTestnet --cwd ./contracts
   ```
4. Record transaction hash and update `CONTRACT_ADDRESS` across team environments.
