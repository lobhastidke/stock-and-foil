import { describe, it, expect, beforeAll } from 'vitest';
import { ethers } from 'ethers';
import { ChainAdapter, Hex, OnChainState } from '../types.js';
import { MockAdapter } from '../MockAdapter.js';
import { EvmAdapter } from '../EvmAdapter.js';
import * as fs from 'fs';
import * as path from 'path';

function computePledgeMarker(commitment: Hex): Hex {
  const domainBytes = ethers.toUtf8Bytes('STOCKFOIL_PLEDGE_V1');
  const commitmentBytes = ethers.getBytes(commitment);
  const packed = ethers.concat([domainBytes, commitmentBytes]);
  return ethers.keccak256(packed) as Hex;
}

function runConformanceSuite(
  adapterName: string,
  getAdapter: () => Promise<ChainAdapter>
) {
  describe(`Conformance Suite: ${adapterName}`, () => {
    let adapter: ChainAdapter;

    // Unique commitment and refs per test run to prevent cross-test collisions
    const randomHex = () => ethers.hexlify(ethers.randomBytes(32)) as Hex;
    let commitment: Hex;
    let supplierRef: Hex;
    let buyerRef: Hex;
    let wrongBuyerRef: Hex;
    let financierRef: Hex;
    let wrongFinancierRef: Hex;
    let pledgeMarker: Hex;

    beforeAll(async () => {
      adapter = await getAdapter();
      commitment = randomHex();
      supplierRef = randomHex();
      buyerRef = randomHex();
      wrongBuyerRef = randomHex();
      financierRef = randomHex();
      wrongFinancierRef = randomHex();
      pledgeMarker = computePledgeMarker(commitment);
    });

    it('returns initial state as NONE and marker as unused', async () => {
      const state = await adapter.getInvoiceState(commitment);
      expect(state).to.equal('NONE');

      const isUsed = await adapter.isPledgeMarkerUsed(pledgeMarker);
      expect(isUsed).to.be.false;
    });

    it('registers a new invoice commitment', async () => {
      const result = await adapter.registerInvoice({
        commitment,
        supplierRef,
        buyerRef,
      });

      expect(['CONFIRMED', 'PENDING']).toContain(result.status);
      expect(result.txHash).toBeDefined();

      const state = await adapter.getInvoiceState(commitment);
      expect(state).to.equal('REGISTERED');
    });

    it('rejects duplicate invoice registration with WRONG_STATE', async () => {
      const result = await adapter.registerInvoice({
        commitment,
        supplierRef,
        buyerRef,
      });

      expect(result.status).to.equal('FAILED');
      expect(result.errorCode).to.equal('WRONG_STATE');
    });

    it('rejects acknowledgement if buyerRef does not match', async () => {
      const result = await adapter.recordAcknowledgement({
        commitment,
        buyerRef: wrongBuyerRef,
        accepted: true,
      });

      expect(result.status).to.equal('FAILED');
      expect(result.errorCode).to.equal('UNAUTHORIZED');
    });

    it('records valid buyer acknowledgement and transitions to ACKNOWLEDGED', async () => {
      const result = await adapter.recordAcknowledgement({
        commitment,
        buyerRef,
        accepted: true,
      });

      expect(['CONFIRMED', 'PENDING']).toContain(result.status);
      const state = await adapter.getInvoiceState(commitment);
      expect(state).to.equal('ACKNOWLEDGED');
    });

    it('rejects second acknowledgement once already acknowledged', async () => {
      const result = await adapter.recordAcknowledgement({
        commitment,
        buyerRef,
        accepted: true,
      });

      expect(result.status).to.equal('FAILED');
      expect(result.errorCode).to.equal('WRONG_STATE');
    });

    it('rejects pledge with invalid/forged pledgeMarker', async () => {
      const forgedMarker = randomHex();
      const result = await adapter.registerPledge({
        commitment,
        pledgeMarker: forgedMarker,
        financierRef,
      });

      expect(result.status).to.equal('FAILED');
      expect(result.errorCode).to.equal('WRONG_STATE');
    });

    it('registers legitimate pledge and marks pledge marker as used', async () => {
      const result = await adapter.registerPledge({
        commitment,
        pledgeMarker,
        financierRef,
      });

      expect(['CONFIRMED', 'PENDING']).toContain(result.status);
      const state = await adapter.getInvoiceState(commitment);
      expect(state).to.equal('PLEDGED');

      const isUsed = await adapter.isPledgeMarkerUsed(pledgeMarker);
      expect(isUsed).to.be.true;
    });

    it('strictly rejects duplicate pledge with PLEDGE_MARKER_USED', async () => {
      const result = await adapter.registerPledge({
        commitment,
        pledgeMarker,
        financierRef: wrongFinancierRef,
      });

      expect(result.status).to.equal('FAILED');
      expect(result.errorCode).to.equal('PLEDGE_MARKER_USED');
    });

    it('rejects settlement from a non-pledging financier with UNAUTHORIZED', async () => {
      const result = await adapter.markSettled({
        commitment,
        financierRef: wrongFinancierRef,
      });

      expect(result.status).to.equal('FAILED');
      expect(result.errorCode).to.equal('UNAUTHORIZED');
    });

    it('settles pledged invoice when called by the recorded financier', async () => {
      const result = await adapter.markSettled({
        commitment,
        financierRef,
      });

      expect(['CONFIRMED', 'PENDING']).toContain(result.status);
      const state = await adapter.getInvoiceState(commitment);
      expect(state).to.equal('SETTLED');
    });

    it('rejects second settlement on already settled invoice', async () => {
      const result = await adapter.markSettled({
        commitment,
        financierRef,
      });

      expect(result.status).to.equal('FAILED');
      expect(result.errorCode).to.equal('WRONG_STATE');
    });

    it('queries and retrieves event records', async () => {
      const events = await adapter.getEvents({ commitment });
      expect(events.length).to.be.greaterThan(0);
      const names = events.map((e) => e.name);
      expect(names).toContain('InvoiceRegistered');
      expect(names).toContain('AcknowledgementRecorded');
      expect(names).toContain('PledgeRegistered');
      expect(names).toContain('InvoiceSettled');
    });
  });
}

// 1. Run Conformance Suite against MockAdapter
runConformanceSuite('MockAdapter', async () => new MockAdapter());

// 2. Run Conformance Suite against EvmAdapter on Local Hardhat Node
runConformanceSuite('EvmAdapter (Local Hardhat)', async () => {
  const deploymentPath = path.resolve(__dirname, '../../../contracts/deployments/localhost.json');
  if (!fs.existsSync(deploymentPath)) {
    throw new Error('Local deployment artifact not found. Run deploy script first.');
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf-8'));

  return new EvmAdapter({
    mode: 'HARDHAT',
    rpcUrl: 'http://127.0.0.1:8545',
    chainId: 31337,
    contractAddress: deployment.contractAddress,
    // Deployer/Operator account #0 on Hardhat
    operatorPrivateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  });
});
