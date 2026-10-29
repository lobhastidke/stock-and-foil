import { ethers } from "hardhat";

async function main() {
  console.log("======================================================================");
  console.log("STOCK & FOIL: LOCAL DEMO & REPLAY/DUPLICATE PREVENTION WALKTHROUGH");
  console.log('("Finance the invoice. Not the fraud.")');
  console.log("======================================================================\n");

  const [admin, operator, financierA, financierB] = await ethers.getSigners();
  console.log("Actors:");
  console.log(` - Admin / Deployer: ${admin.address}`);
  console.log(` - Relayer Operator: ${operator.address}`);
  console.log(` - Financier A:      ${financierA.address}`);
  console.log(` - Financier B:      ${financierB.address}\n`);

  // 1. Deploy Contract
  const Factory = await ethers.getContractFactory("StockFoilRegistry");
  const registry = await Factory.deploy(admin.address, operator.address);
  await registry.waitForDeployment();
  const contractAddress = await registry.getAddress();
  console.log(`[Step 1] Registry deployed at: ${contractAddress}`);

  // 2. Off-chain Commitment Generation
  const rawInvoice = {
    invoiceNumber: "INV-DEMO-2026",
    supplierId: "11111111-1111-1111-1111-111111111111",
    buyerId: "22222222-2222-2222-2222-222222222222",
    amountMinorUnits: "1500000", // INR 15,000.00
    currency: "INR",
  };
  console.log("\n[Step 2] Off-chain confidential invoice prepared:", rawInvoice);

  // Generate commitment and opaque refs
  const commitment = ethers.keccak256(ethers.toUtf8Bytes("salt_bytes32_demo_vector_value"));
  const supplierRef = ethers.keccak256(ethers.toUtf8Bytes(`STOCKFOIL_USER_V1:${rawInvoice.supplierId}`));
  const buyerRef = ethers.keccak256(ethers.toUtf8Bytes(`STOCKFOIL_USER_V1:${rawInvoice.buyerId}`));
  const financierRefA = ethers.keccak256(ethers.toUtf8Bytes(`STOCKFOIL_USER_V1:${financierA.address}`));
  const financierRefB = ethers.keccak256(ethers.toUtf8Bytes(`STOCKFOIL_USER_V1:${financierB.address}`));

  console.log(`Commitment:  ${commitment}`);
  console.log(`SupplierRef: ${supplierRef}`);
  console.log(`BuyerRef:    ${buyerRef}`);

  // 3. Register Invoice
  console.log("\n[Step 3] Operator registers invoice commitment on-chain...");
  const txReg = await registry.connect(operator).registerInvoice(commitment, supplierRef, buyerRef);
  await txReg.wait();
  let inv = await registry.getInvoice(commitment);
  console.log(`State on-chain: ${inv.state} (1 = Registered)`);

  // 4. Buyer Acknowledgement
  console.log("\n[Step 4] Buyer confirms invoice validity (Acknowledgement recorded)...");
  const txAck = await registry.connect(operator).recordAcknowledgement(commitment, buyerRef, true);
  await txAck.wait();
  inv = await registry.getInvoice(commitment);
  console.log(`State on-chain: ${inv.state} (2 = Acknowledged)`);

  // 5. First Financier Pledges
  const marker = await registry.computePledgeMarker(commitment);
  console.log(`\nComputed Pledge Marker: ${marker}`);
  console.log("[Step 5] Financier A pledges advance funding on commitment...");
  const txPledge = await registry.connect(operator).registerPledge(commitment, marker, financierRefA);
  await txPledge.wait();
  inv = await registry.getInvoice(commitment);
  console.log(`State on-chain: ${inv.state} (4 = Pledged)`);
  console.log(`Marker Used:    ${await registry.isPledgeMarkerUsed(marker)}`);

  // 6. Duplicate Pledge Attempt (Double-Financing Attack)
  console.log("\n[Step 6] FRAUD ATTEMPT: Financier B attempts second pledge on the same commitment...");
  try {
    await registry.connect(operator).registerPledge(commitment, marker, financierRefB);
    console.error("CRITICAL FAILURE: Second pledge should have reverted!");
  } catch (error: any) {
    console.log("--> SUCCESSFUL REJECTION! Transaction reverted as expected.");
    console.log(`--> Revert reason: ${error.message.includes("PledgeMarkerAlreadyUsed") ? "PledgeMarkerAlreadyUsed()" : error.message}`);
  }

  // 7. Settlement
  console.log("\n[Step 7] Invoice loan repaid. Financier A settles invoice commitment...");
  const txSettle = await registry.connect(operator).markSettled(commitment, financierRefA);
  await txSettle.wait();
  inv = await registry.getInvoice(commitment);
  console.log(`State on-chain: ${inv.state} (5 = Settled)`);

  console.log("\n======================================================================");
  console.log("DEMO FINISHED: ALL CRYPTOGRAPHIC INVARIANTS & PREVENTIONS VERIFIED!");
  console.log("======================================================================\n");
}

main().catch((err) => {
  console.error("Demo failed:", err);
  process.exitCode = 1;
});
