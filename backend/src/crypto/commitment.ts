import crypto from 'crypto';
import { getBytes, toUtf8Bytes, concat, keccak256 } from 'ethers';
import { CommittedInvoiceData, toCanonicalJson } from './canonical.js';

export type HexString = `0x${string}`;

/**
 * Generates 32 cryptographically secure random bytes as a hex string with '0x' prefix.
 */
export function generateSalt(): HexString {
  const bytes = crypto.randomBytes(32);
  return `0x${bytes.toString('hex')}`;
}

/**
 * Computes commitment = keccak256( salt_bytes32 || utf8(canonicalJson) ) -> 0x + 64 hex
 *
 * Why keccak256?
 * We intentionally select keccak256 rather than SHA-256 because keccak256 is the native
 * hashing primitive of the EVM (Ethereum / MST Testnet). Using keccak256 across both off-chain
 * backend logic and on-chain smart contracts eliminates cross-algorithm translation bugs and
 * minimizes gas cost in smart contract verification.
 */
export function computeCommitment(saltHex: string, canonicalJson: string): HexString {
  const saltBytes = getBytes(saltHex);
  if (saltBytes.length !== 32) {
    throw new Error(`Salt must be exactly 32 bytes, got ${saltBytes.length}`);
  }
  const utf8Bytes = toUtf8Bytes(canonicalJson);
  const combined = concat([saltBytes, utf8Bytes]);
  return keccak256(combined) as HexString;
}

/**
 * Helper to compute commitment directly from invoice data and a salt.
 */
export function computeCommitmentFromData(saltHex: string, data: CommittedInvoiceData): {
  canonicalJson: string;
  commitment: HexString;
} {
  const canonicalJson = toCanonicalJson(data);
  const commitment = computeCommitment(saltHex, canonicalJson);
  return { canonicalJson, commitment };
}

/**
 * Verifies that the recomputed commitment matches the expected commitment.
 */
export function verifyCommitment(
  saltHex: string,
  data: CommittedInvoiceData,
  expectedCommitment: string
): boolean {
  const { commitment } = computeCommitmentFromData(saltHex, data);
  return commitment.toLowerCase() === expectedCommitment.toLowerCase();
}
