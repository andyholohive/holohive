/**
 * EVM wallet address validation + EIP-55 checksum normalization.
 *
 * Used by the /wallet command in the Telegram payment bot — see
 * HHP /wallet Command spec § 5. The bot accepts mixed-case input and
 * stores values in canonical EIP-55 form so payouts always read a
 * consistent address regardless of how the KOL pasted it.
 */

import { keccak256 } from 'js-sha3';

/**
 * Extract the first 0x-prefixed 42-char token from a message body.
 * Tolerates trailing text like "/wallet 0xabc...123 thanks" per
 * spec § 4 — first matching token wins.
 *
 * Returns null if no candidate token is present.
 */
export function extractAddressCandidate(input: string): string | null {
  const match = input.match(/0x[a-fA-F0-9]{40}/);
  return match ? match[0] : null;
}

/**
 * True iff `addr` is a structurally-valid EVM address — 0x prefix,
 * 42 chars total, 40 hex chars after. Mixed case is allowed at the
 * input layer; the case-sensitive EIP-55 verification is a separate
 * optional check (spec § 5 v2 hardening).
 */
export function isValidEvmAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

/**
 * Normalize an EVM address to EIP-55 checksum case. Input may be
 * all-lower, all-upper, or mixed; output is always canonical
 * checksum form — uppercase for hex chars where the keccak256 hash
 * of the lowercase address (without 0x) has a high bit at that
 * nibble's position.
 *
 * Throws if the address is structurally invalid — callers should
 * validate with `isValidEvmAddress` first.
 *
 * Reference: https://eips.ethereum.org/EIPS/eip-55
 */
export function toChecksumAddress(addr: string): string {
  if (!isValidEvmAddress(addr)) {
    throw new Error(`Invalid EVM address: ${addr}`);
  }
  const lower = addr.slice(2).toLowerCase();
  const hash = keccak256(lower);
  let out = '0x';
  for (let i = 0; i < lower.length; i++) {
    // EIP-55: char becomes uppercase iff the corresponding nibble of
    // the keccak256 hash is >= 8. Digits stay as-is.
    const ch = lower[i];
    if (ch >= '0' && ch <= '9') {
      out += ch;
    } else {
      out += parseInt(hash[i], 16) >= 8 ? ch.toUpperCase() : ch;
    }
  }
  return out;
}

/**
 * OPTIONAL spec § 5 v2 hardening — verify that a MIXED-case address
 * matches its EIP-55 checksum. Returns true for all-lower / all-upper
 * inputs (no checksum to verify) and for mixed-case inputs whose
 * checksum is correct. Returns false only for mixed-case inputs with
 * a wrong checksum — a strong typo signal.
 *
 * Not used in v1 per spec; provided for v2 escalation.
 */
export function hasValidChecksumIfMixed(addr: string): boolean {
  if (!isValidEvmAddress(addr)) return false;
  const body = addr.slice(2);
  const hasUpper = /[A-F]/.test(body);
  const hasLower = /[a-f]/.test(body);
  if (!hasUpper || !hasLower) return true; // all-one-case — nothing to verify
  return toChecksumAddress(addr) === addr;
}
