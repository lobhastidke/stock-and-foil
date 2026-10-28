import { toUtf8Bytes, keccak256 } from 'ethers';
import { HexString } from './commitment.js';

const USER_REF_PREFIX = 'STOCKFOIL_USER_V1:';

/**
 * Computes an opaque, privacy-preserving user reference for on-chain identity:
 * userRef = keccak256(utf8("STOCKFOIL_USER_V1:" + userId))
 * Ensures zero PII (names, emails, UUIDs) is exposed on the public blockchain.
 */
export function computeUserRef(userId: string): HexString {
  const normalizedId = userId.trim().toLowerCase();
  const rawString = `${USER_REF_PREFIX}${normalizedId}`;
  return keccak256(toUtf8Bytes(rawString)) as HexString;
}
