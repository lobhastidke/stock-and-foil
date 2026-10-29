import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

// Load environment variables from repo root .env if present
dotenv.config({ path: "../.env" });

const chainRpcUrl = process.env.CHAIN_RPC_URL || "";
const chainId = process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID, 10) : undefined;
const operatorKey = process.env.OPERATOR_PRIVATE_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      // Explicitly set evmVersion to 'paris' to avoid Shanghai PUSH0 opcode incompatibility
      // on younger EVM / L2 networks such as MST Testnet.
      evmVersion: "paris",
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    // mstTestnet is configured dynamically from environment variables only (no hardcoding)
    ...(chainRpcUrl && chainId && operatorKey
      ? {
          mstTestnet: {
            url: chainRpcUrl,
            chainId: chainId,
            accounts: [operatorKey.startsWith("0x") ? operatorKey : `0x${operatorKey}`],
          },
        }
      : {}),
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
