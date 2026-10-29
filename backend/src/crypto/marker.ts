import { toUtf8Bytes, getBytes, concat, keccak256 } from 'ethers';
import { HexString } from './commitment.js';

const PLEDGE_DOMAIN = 'STOCKFOIL_PLEDGE_V1';

/**
 * Computes pledgeMarker = keccak256( abi.encodePacked("STOCKFOIL_PLEDGE_V1", commitment) )
 * The domain string is encoded as raw UTF-8 bytes without padding.
 * This guarantees exactly one deterministic pledgeMarker per commitment.
 */
export function computePledgeMarker(commitment: string): HexString {
  const domainBytes = toUtf8Bytes(PLEDGE_DOMAIN);
  const commitmentBytes = getBytes(commitment);
  if (commitmentBytes.length !== 32) {
    throw new Error(`Commitment must be exactly 32 bytes, got ${commitmentBytes.length}`);
  }
  const combined = concat([domainBytes, commitmentBytes]);
  return keccak256(combined) as HexString;
}
