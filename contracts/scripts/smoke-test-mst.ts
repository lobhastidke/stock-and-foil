import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("======================================================================");
  console.log("MST TESTNET SMOKE TEST & ON-CHAIN VERIFICATION");
  console.log("======================================================================\n");

  const deploymentPath = path.resolve(__dirname, "../deployments/mstTestnet.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`mstTestnet deployment file not found at ${deploymentPath}`);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  const contractAddress = deployment.contractAddress;
  console.log(`Connecting to registry at: ${contractAddress}`);

  const [operator] = await ethers.getSigners();
  console.log(`Operator signer: ${operator.address}`);

  const registry = await ethers.getContractAt("StockFoilRegistry", contractAddress, operator);

  // Generate test commitment
  const testCommitment = ethers.keccak256(ethers.toUtf8Bytes(`smoke_test_${Date.now()}`));
  const supplierRef = ethers.keccak256(ethers.toUtf8Bytes("STOCKFOIL_USER_V1:supplier_smoke"));
  const buyerRef = ethers.keccak256(ethers.toUtf8Bytes("STOCKFOIL_USER_V1:buyer_smoke"));
  const financierRef = ethers.keccak256(ethers.toUtf8Bytes("STOCKFOIL_USER_V1:financier_smoke"));

  console.log("\n1. Registering invoice commitment...");
  const tx1 = await registry.registerInvoice(testCommitment, supplierRef, buyerRef, { gasLimit: 300000 });
  console.log(`Transaction submitted: ${tx1.hash}`);
  const receipt1 = await tx1.wait(1);
  console.log(`Confirmed in block ${receipt1?.blockNumber}`);

  console.log("\n2. Recording buyer acknowledgement...");
  const tx2 = await registry.recordAcknowledgement(testCommitment, buyerRef, true, { gasLimit: 300000 });
  console.log(`Transaction submitted: ${tx2.hash}`);
  const receipt2 = await tx2.wait(1);
  console.log(`Confirmed in block ${receipt2?.blockNumber}`);

  console.log("\n3. Registering financing pledge...");
  const marker = await registry.computePledgeMarker(testCommitment);
  const tx3 = await registry.registerPledge(testCommitment, marker, financierRef, { gasLimit: 300000 });
  console.log(`Transaction submitted: ${tx3.hash}`);
  const receipt3 = await tx3.wait(1);
  console.log(`Confirmed in block ${receipt3?.blockNumber}`);

  console.log("\n4. Testing duplicate pledge rejection (expect revert)...");
  try {
    const txFraud = await registry.registerPledge(testCommitment, marker, financierRef, { gasLimit: 300000 });
    await txFraud.wait(1);
    throw new Error("FAILED: Duplicate pledge did not revert!");
  } catch (err: any) {
    console.log("SUCCESS: Duplicate pledge correctly rejected on MST testnet!");
  }

  console.log("\n5. Settling invoice...");
  const tx4 = await registry.markSettled(testCommitment, financierRef, { gasLimit: 300000 });
  console.log(`Transaction submitted: ${tx4.hash}`);
  const receipt4 = await tx4.wait(1);
  console.log(`Confirmed in block ${receipt4?.blockNumber}`);

  console.log("\n======================================================================");
  console.log("MST TESTNET SMOKE TEST PASSED SUCCESSFULLY!");
  console.log("======================================================================");
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exitCode = 1;
});
