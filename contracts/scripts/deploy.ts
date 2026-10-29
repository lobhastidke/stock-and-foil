import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("--------------------------------------------------");
  console.log("Stock & Foil Registry - Deployment");
  console.log("--------------------------------------------------");
  console.log(`Network:  ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);

  const operatorAddress = process.env.OPERATOR_ADDRESS || deployer.address;
  console.log(`Operator: ${operatorAddress}`);

  const Factory = await ethers.getContractFactory("StockFoilRegistry");
  const registry = await Factory.deploy(deployer.address, operatorAddress);
  await registry.waitForDeployment();

  const contractAddress = await registry.getAddress();
  const chainId = (await ethers.provider.getNetwork()).chainId.toString();

  console.log(`\nRegistry deployed successfully!`);
  console.log(`Contract Address: ${contractAddress}`);
  console.log(`Chain ID:         ${chainId}`);

  // Save deployment artifact to contracts/deployments/<network>.json
  const deploymentsDir = path.resolve(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentData = {
    network: network.name,
    chainId: Number(chainId),
    contractAddress,
    deployer: deployer.address,
    operator: operatorAddress,
    deployedAt: new Date().toISOString(),
  };

  const outFilePath = path.join(deploymentsDir, `${network.name}.json`);
  fs.writeFileSync(outFilePath, JSON.stringify(deploymentData, null, 2));
  console.log(`Saved deployment info to: ${outFilePath}`);
  console.log("--------------------------------------------------");
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});
