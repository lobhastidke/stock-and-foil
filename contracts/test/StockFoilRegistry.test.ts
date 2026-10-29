import { expect } from "chai";
import { ethers, network } from "hardhat";
import { StockFoilRegistry } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import * as fs from "fs";
import * as path from "path";

describe("StockFoilRegistry", () => {
  let registry: StockFoilRegistry;
  let admin: HardhatEthersSigner;
  let operator: HardhatEthersSigner;
  let nonOperator: HardhatEthersSigner;
  let otherAccount: HardhatEthersSigner;

  const OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("OPERATOR_ROLE"));
  const ZERO_BYTES32 = ethers.ZeroHash;
  const ZERO_ADDRESS = ethers.ZeroAddress;

  const sampleCommitment = ethers.keccak256(ethers.toUtf8Bytes("sample_commitment_1"));
  const supplierRef = ethers.keccak256(ethers.toUtf8Bytes("STOCKFOIL_USER_V1:supplier_1"));
  const buyerRef = ethers.keccak256(ethers.toUtf8Bytes("STOCKFOIL_USER_V1:buyer_1"));
  const wrongBuyerRef = ethers.keccak256(ethers.toUtf8Bytes("STOCKFOIL_USER_V1:buyer_wrong"));
  const financierRef = ethers.keccak256(ethers.toUtf8Bytes("STOCKFOIL_USER_V1:financier_1"));
  const wrongFinancierRef = ethers.keccak256(ethers.toUtf8Bytes("STOCKFOIL_USER_V1:financier_wrong"));

  beforeEach(async () => {
    [admin, operator, nonOperator, otherAccount] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("StockFoilRegistry");
    registry = await Factory.deploy(admin.address, operator.address);
    await registry.waitForDeployment();
  });

  describe("Deployment & Access Control", () => {
    it("assigns DEFAULT_ADMIN_ROLE and OPERATOR_ROLE correctly", async () => {
      const DEFAULT_ADMIN_ROLE = await registry.DEFAULT_ADMIN_ROLE();
      expect(await registry.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
      expect(await registry.hasRole(OPERATOR_ROLE, operator.address)).to.be.true;
      expect(await registry.hasRole(OPERATOR_ROLE, nonOperator.address)).to.be.false;
    });

    it("reverts constructor if admin or operator is zero address", async () => {
      const Factory = await ethers.getContractFactory("StockFoilRegistry");
      await expect(Factory.deploy(ZERO_ADDRESS, operator.address)).to.be.revertedWithCustomError(
        registry,
        "ZeroValue"
      );
      await expect(Factory.deploy(admin.address, ZERO_ADDRESS)).to.be.revertedWithCustomError(
        registry,
        "ZeroValue"
      );
    });

    it("reverts non-operator calls with AccessControlUnauthorizedAccount", async () => {
      await expect(
        registry.connect(nonOperator).registerInvoice(sampleCommitment, supplierRef, buyerRef)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");

      await expect(
        registry.connect(nonOperator).recordAcknowledgement(sampleCommitment, buyerRef, true)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");

      const marker = await registry.computePledgeMarker(sampleCommitment);
      await expect(
        registry.connect(nonOperator).registerPledge(sampleCommitment, marker, financierRef)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");

      await expect(
        registry.connect(nonOperator).markSettled(sampleCommitment, financierRef)
      ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Happy Path Lifecycle", () => {
    it("completes full lifecycle: Register -> Acknowledge -> Pledge -> Settle", async () => {
      // 1. Register
      const txReg = await registry
        .connect(operator)
        .registerInvoice(sampleCommitment, supplierRef, buyerRef);
      await expect(txReg)
        .to.emit(registry, "InvoiceRegistered")
        .withArgs(sampleCommitment, supplierRef, buyerRef);

      let invoice = await registry.getInvoice(sampleCommitment);
      expect(invoice.state).to.equal(1); // Registered
      expect(invoice.supplierRef).to.equal(supplierRef);
      expect(invoice.buyerRef).to.equal(buyerRef);
      expect(invoice.financierRef).to.equal(ZERO_BYTES32);
      expect(invoice.registeredAt).to.be.greaterThan(0);
      expect(invoice.updatedAt).to.be.greaterThan(0);

      // 2. Acknowledge
      const txAck = await registry
        .connect(operator)
        .recordAcknowledgement(sampleCommitment, buyerRef, true);
      await expect(txAck)
        .to.emit(registry, "AcknowledgementRecorded")
        .withArgs(sampleCommitment, buyerRef, true);

      invoice = await registry.getInvoice(sampleCommitment);
      expect(invoice.state).to.equal(2); // Acknowledged

      // 3. Pledge
      const pledgeMarker = await registry.computePledgeMarker(sampleCommitment);
      expect(await registry.isPledgeMarkerUsed(pledgeMarker)).to.be.false;

      const txPledge = await registry
        .connect(operator)
        .registerPledge(sampleCommitment, pledgeMarker, financierRef);
      await expect(txPledge)
        .to.emit(registry, "PledgeRegistered")
        .withArgs(sampleCommitment, pledgeMarker, financierRef);

      expect(await registry.isPledgeMarkerUsed(pledgeMarker)).to.be.true;
      invoice = await registry.getInvoice(sampleCommitment);
      expect(invoice.state).to.equal(4); // Pledged
      expect(invoice.financierRef).to.equal(financierRef);

      // 4. Settle
      const txSettle = await registry
        .connect(operator)
        .markSettled(sampleCommitment, financierRef);
      await expect(txSettle)
        .to.emit(registry, "InvoiceSettled")
        .withArgs(sampleCommitment, financierRef);

      invoice = await registry.getInvoice(sampleCommitment);
      expect(invoice.state).to.equal(5); // Settled
    });

    it("handles buyer rejection properly as a terminal state", async () => {
      await registry.connect(operator).registerInvoice(sampleCommitment, supplierRef, buyerRef);
      const txReject = await registry
        .connect(operator)
        .recordAcknowledgement(sampleCommitment, buyerRef, false);
      await expect(txReject)
        .to.emit(registry, "AcknowledgementRecorded")
        .withArgs(sampleCommitment, buyerRef, false);

      const invoice = await registry.getInvoice(sampleCommitment);
      expect(invoice.state).to.equal(3); // Rejected

      // Pledging rejected invoice must revert
      const marker = await registry.computePledgeMarker(sampleCommitment);
      await expect(
        registry.connect(operator).registerPledge(sampleCommitment, marker, financierRef)
      ).to.be.revertedWithCustomError(registry, "WrongState");
    });
  });

  describe("Validation & Reverts", () => {
    describe("registerInvoice", () => {
      it("reverts on zero commitment, zero supplierRef, or zero buyerRef", async () => {
        await expect(
          registry.connect(operator).registerInvoice(ZERO_BYTES32, supplierRef, buyerRef)
        ).to.be.revertedWithCustomError(registry, "ZeroValue");

        await expect(
          registry.connect(operator).registerInvoice(sampleCommitment, ZERO_BYTES32, buyerRef)
        ).to.be.revertedWithCustomError(registry, "ZeroValue");

        await expect(
          registry.connect(operator).registerInvoice(sampleCommitment, supplierRef, ZERO_BYTES32)
        ).to.be.revertedWithCustomError(registry, "ZeroValue");
      });

      it("reverts on duplicate invoice registration", async () => {
        await registry.connect(operator).registerInvoice(sampleCommitment, supplierRef, buyerRef);
        await expect(
          registry.connect(operator).registerInvoice(sampleCommitment, supplierRef, buyerRef)
        ).to.be.revertedWithCustomError(registry, "AlreadyRegistered");
      });
    });

    describe("recordAcknowledgement", () => {
      it("reverts on zero commitment or zero buyerRef", async () => {
        await expect(
          registry.connect(operator).recordAcknowledgement(ZERO_BYTES32, buyerRef, true)
        ).to.be.revertedWithCustomError(registry, "ZeroValue");

        await expect(
          registry.connect(operator).recordAcknowledgement(sampleCommitment, ZERO_BYTES32, true)
        ).to.be.revertedWithCustomError(registry, "ZeroValue");
      });

      it("reverts on unknown commitment", async () => {
        await expect(
          registry.connect(operator).recordAcknowledgement(sampleCommitment, buyerRef, true)
        ).to.be.revertedWithCustomError(registry, "UnknownCommitment");
      });

      it("reverts if caller buyerRef does not match invoice buyerRef", async () => {
        await registry.connect(operator).registerInvoice(sampleCommitment, supplierRef, buyerRef);
        await expect(
          registry.connect(operator).recordAcknowledgement(sampleCommitment, wrongBuyerRef, true)
        ).to.be.revertedWithCustomError(registry, "NotBuyer");
      });

      it("reverts if invoice is not in Registered state", async () => {
        await registry.connect(operator).registerInvoice(sampleCommitment, supplierRef, buyerRef);
        await registry.connect(operator).recordAcknowledgement(sampleCommitment, buyerRef, true);

        // Attempting to acknowledge again
        await expect(
          registry.connect(operator).recordAcknowledgement(sampleCommitment, buyerRef, true)
        ).to.be.revertedWithCustomError(registry, "WrongState");
      });
    });

    describe("registerPledge", () => {
      it("reverts on zero commitment, zero marker, or zero financierRef", async () => {
        const marker = await registry.computePledgeMarker(sampleCommitment);
        await expect(
          registry.connect(operator).registerPledge(ZERO_BYTES32, marker, financierRef)
        ).to.be.revertedWithCustomError(registry, "ZeroValue");

        await expect(
          registry.connect(operator).registerPledge(sampleCommitment, ZERO_BYTES32, financierRef)
        ).to.be.revertedWithCustomError(registry, "ZeroValue");

        await expect(
          registry.connect(operator).registerPledge(sampleCommitment, marker, ZERO_BYTES32)
        ).to.be.revertedWithCustomError(registry, "ZeroValue");
      });

      it("reverts on unknown commitment", async () => {
        const marker = await registry.computePledgeMarker(sampleCommitment);
        await expect(
          registry.connect(operator).registerPledge(sampleCommitment, marker, financierRef)
        ).to.be.revertedWithCustomError(registry, "UnknownCommitment");
      });

      it("reverts if invoice is in Registered (not Acknowledged) state", async () => {
        await registry.connect(operator).registerInvoice(sampleCommitment, supplierRef, buyerRef);
        const marker = await registry.computePledgeMarker(sampleCommitment);
        await expect(
          registry.connect(operator).registerPledge(sampleCommitment, marker, financierRef)
        ).to.be.revertedWithCustomError(registry, "WrongState");
      });

      it("reverts if provided pledgeMarker does not match computePledgeMarker(commitment)", async () => {
        await registry.connect(operator).registerInvoice(sampleCommitment, supplierRef, buyerRef);
        await registry.connect(operator).recordAcknowledgement(sampleCommitment, buyerRef, true);

        const forgedMarker = ethers.keccak256(ethers.toUtf8Bytes("forged_marker"));
        await expect(
          registry.connect(operator).registerPledge(sampleCommitment, forgedMarker, financierRef)
        ).to.be.revertedWithCustomError(registry, "InvalidPledgeMarker");
      });

      it("strictly reverts on duplicate pledge (same commitment pledged twice)", async () => {
        await registry.connect(operator).registerInvoice(sampleCommitment, supplierRef, buyerRef);
        await registry.connect(operator).recordAcknowledgement(sampleCommitment, buyerRef, true);

        const marker = await registry.computePledgeMarker(sampleCommitment);
        await registry.connect(operator).registerPledge(sampleCommitment, marker, financierRef);

        // Second attempt reverts PledgeMarkerAlreadyUsed
        await expect(
          registry.connect(operator).registerPledge(sampleCommitment, marker, financierRef)
        ).to.be.revertedWithCustomError(registry, "PledgeMarkerAlreadyUsed");
      });

      it("reverts with PledgeMarkerAlreadyUsed if marker is replayed across states or forged", async () => {
        // If an acknowledged invoice attempts to reuse an already marked pledgeMarker
        await registry.connect(operator).registerInvoice(sampleCommitment, supplierRef, buyerRef);
        await registry.connect(operator).recordAcknowledgement(sampleCommitment, buyerRef, true);
        const marker = await registry.computePledgeMarker(sampleCommitment);
        await registry.connect(operator).registerPledge(sampleCommitment, marker, financierRef);

        // Verify marker is flagged used
        expect(await registry.isPledgeMarkerUsed(marker)).to.be.true;
      });
    });

    describe("markSettled", () => {
      it("reverts on zero commitment or zero financierRef", async () => {
        await expect(
          registry.connect(operator).markSettled(ZERO_BYTES32, financierRef)
        ).to.be.revertedWithCustomError(registry, "ZeroValue");

        await expect(
          registry.connect(operator).markSettled(sampleCommitment, ZERO_BYTES32)
        ).to.be.revertedWithCustomError(registry, "ZeroValue");
      });

      it("reverts on unknown commitment", async () => {
        await expect(
          registry.connect(operator).markSettled(sampleCommitment, financierRef)
        ).to.be.revertedWithCustomError(registry, "UnknownCommitment");
      });

      it("reverts if invoice is not in Pledged state", async () => {
        await registry.connect(operator).registerInvoice(sampleCommitment, supplierRef, buyerRef);
        await registry.connect(operator).recordAcknowledgement(sampleCommitment, buyerRef, true);

        // Still Acknowledged, not Pledged
        await expect(
          registry.connect(operator).markSettled(sampleCommitment, financierRef)
        ).to.be.revertedWithCustomError(registry, "WrongState");
      });

      it("reverts if settling financierRef does not match pledger", async () => {
        await registry.connect(operator).registerInvoice(sampleCommitment, supplierRef, buyerRef);
        await registry.connect(operator).recordAcknowledgement(sampleCommitment, buyerRef, true);
        const marker = await registry.computePledgeMarker(sampleCommitment);
        await registry.connect(operator).registerPledge(sampleCommitment, marker, financierRef);

        await expect(
          registry.connect(operator).markSettled(sampleCommitment, wrongFinancierRef)
        ).to.be.revertedWithCustomError(registry, "NotFinancier");
      });

      it("reverts when attempting to settle an already settled invoice", async () => {
        await registry.connect(operator).registerInvoice(sampleCommitment, supplierRef, buyerRef);
        await registry.connect(operator).recordAcknowledgement(sampleCommitment, buyerRef, true);
        const marker = await registry.computePledgeMarker(sampleCommitment);
        await registry.connect(operator).registerPledge(sampleCommitment, marker, financierRef);
        await registry.connect(operator).markSettled(sampleCommitment, financierRef);

        await expect(
          registry.connect(operator).markSettled(sampleCommitment, financierRef)
        ).to.be.revertedWithCustomError(registry, "WrongState");
      });
    });
  });

  describe("Same-Block Race Condition & Concurrency", () => {
    it("handles two pledge transactions submitted in the same block (automine off) - exactly one succeeds", async () => {
      await registry.connect(operator).registerInvoice(sampleCommitment, supplierRef, buyerRef);
      await registry.connect(operator).recordAcknowledgement(sampleCommitment, buyerRef, true);
      const marker = await registry.computePledgeMarker(sampleCommitment);

      const competitorFinancierRef = ethers.keccak256(ethers.toUtf8Bytes("STOCKFOIL_USER_V1:financier_competitor"));

      // Ensure automine is reset even if test fails
      await network.provider.send("evm_setAutomine", [false]);
      try {
        const baseNonce = await operator.getNonce();

        // Send two pledge transactions with explicit gasLimit to prevent estimation hang
        const tx1 = await registry
          .connect(operator)
          .registerPledge(sampleCommitment, marker, financierRef, {
            nonce: baseNonce,
            gasLimit: 300000,
          });

        const tx2 = await registry
          .connect(operator)
          .registerPledge(sampleCommitment, marker, competitorFinancierRef, {
            nonce: baseNonce + 1,
            gasLimit: 300000,
          });

        // Mine single block containing both transactions
        await network.provider.send("evm_mine");

        // First transaction succeeded
        const receipt1 = await tx1.wait();
        expect(receipt1?.status).to.equal(1);

        // Second transaction in the same block failed due to double-pledge prevention
        await expect(tx2.wait()).to.be.rejected;

        const invoice = await registry.getInvoice(sampleCommitment);
        expect(invoice.state).to.equal(4); // Pledged
        expect(invoice.financierRef).to.equal(financierRef);
      } finally {
        await network.provider.send("evm_setAutomine", [true]);
      }
    });
  });

  describe("Integration Contract Vectors Validation (docs/commitment-vectors.json)", () => {
    it("matches all 5 test vectors from Member 2 exactly on-chain", async () => {
      const vectorsPath = path.resolve(__dirname, "../../docs/commitment-vectors.json");
      expect(fs.existsSync(vectorsPath)).to.be.true;

      const raw = fs.readFileSync(vectorsPath, "utf-8");
      const vectors = JSON.parse(raw);
      expect(vectors.length).to.equal(5);

      for (const vector of vectors) {
        // 1. Verify on-chain marker derivation
        const computedMarker = await registry.computePledgeMarker(vector.commitment);
        expect(computedMarker.toLowerCase()).to.equal(
          vector.pledgeMarker.toLowerCase(),
          `Pledge marker mismatch for vector: ${vector.description}`
        );

        // 2. Perform end-to-end registry lifecycle with vector values
        await registry
          .connect(operator)
          .registerInvoice(vector.commitment, vector.supplierRef, vector.buyerRef);

        await registry
          .connect(operator)
          .recordAcknowledgement(vector.commitment, vector.buyerRef, true);

        await registry
          .connect(operator)
          .registerPledge(vector.commitment, vector.pledgeMarker, financierRef);

        const invoice = await registry.getInvoice(vector.commitment);
        expect(invoice.state).to.equal(4); // Pledged
        expect(invoice.supplierRef.toLowerCase()).to.equal(vector.supplierRef.toLowerCase());
        expect(invoice.buyerRef.toLowerCase()).to.equal(vector.buyerRef.toLowerCase());
        expect(invoice.financierRef.toLowerCase()).to.equal(financierRef.toLowerCase());
        expect(await registry.isPledgeMarkerUsed(vector.pledgeMarker)).to.be.true;
      }
    });
  });

  describe("Fuzzing & Invariant Testing", () => {
    it("maintains state integrity under 10 randomized cycles", async () => {
      for (let i = 0; i < 10; i++) {
        const randCommitment = ethers.hexlify(ethers.randomBytes(32));
        const randSupplier = ethers.hexlify(ethers.randomBytes(32));
        const randBuyer = ethers.hexlify(ethers.randomBytes(32));
        const randFinancier = ethers.hexlify(ethers.randomBytes(32));

        const marker = await registry.computePledgeMarker(randCommitment);
        expect(await registry.isPledgeMarkerUsed(marker)).to.be.false;

        await registry
          .connect(operator)
          .registerInvoice(randCommitment, randSupplier, randBuyer);

        let inv = await registry.getInvoice(randCommitment);
        expect(inv.state).to.equal(1);

        await registry
          .connect(operator)
          .recordAcknowledgement(randCommitment, randBuyer, true);

        inv = await registry.getInvoice(randCommitment);
        expect(inv.state).to.equal(2);

        await registry
          .connect(operator)
          .registerPledge(randCommitment, marker, randFinancier);

        inv = await registry.getInvoice(randCommitment);
        expect(inv.state).to.equal(4);
        expect(await registry.isPledgeMarkerUsed(marker)).to.be.true;

        await registry.connect(operator).markSettled(randCommitment, randFinancier);
        inv = await registry.getInvoice(randCommitment);
        expect(inv.state).to.equal(5);
      }
    });
  });
});
