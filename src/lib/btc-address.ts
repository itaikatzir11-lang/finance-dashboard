/**
 * BTC address utilities — validation and privacy masking.
 *
 * These functions are shared by both server-side API routes and
 * client-side validation. No sensitive data is processed here —
 * masking is one-way and validation is format-only.
 *
 * Supported formats:
 *   P2PKH     – starts with 1     (legacy, e.g. 1A1zP1...)
 *   P2SH      – starts with 3     (e.g. 3J98t1...)
 *   Bech32    – starts with bc1q  (native SegWit, most common)
 *   Bech32m   – starts with bc1p  (Taproot)
 *
 * NOTE: This is structural validation only (prefix + length + charset).
 * It does not verify the checksum. Full checksum verification would
 * require a bech32 library and is intentionally out of scope here.
 *
 * FUTURE: When remote deployment is required, add field-level encryption
 * before DB writes. The API surface (PUT /btc-address) and DB schema do
 * not need to change — only the storage layer needs an encrypt/decrypt
 * wrapper around btcAddress reads/writes.
 */

const BASE58_CHARS = /^[a-km-zA-HJ-NP-Z1-9]+$/
const BECH32_CHARS = /^[a-z0-9]+$/

/**
 * Returns true if the string looks like a valid mainnet BTC address.
 * Call this on both client (live feedback) and server (before DB write).
 */
export function isValidBTCAddress(address: string): boolean {
  if (!address || typeof address !== 'string') return false
  const trimmed = address.trim()

  // P2PKH: 1 + 25–33 base58 chars = 26–34 total
  if (trimmed.startsWith('1')) {
    return trimmed.length >= 26 && trimmed.length <= 34 && BASE58_CHARS.test(trimmed.slice(1))
  }

  // P2SH: 3 + 25–33 base58 chars = 26–34 total
  if (trimmed.startsWith('3')) {
    return trimmed.length >= 26 && trimmed.length <= 34 && BASE58_CHARS.test(trimmed.slice(1))
  }

  // Bech32 / Bech32m: bc1 + 6–87 lowercase alphanumeric
  if (trimmed.toLowerCase().startsWith('bc1')) {
    const suffix = trimmed.toLowerCase().slice(3)
    return suffix.length >= 6 && suffix.length <= 87 && BECH32_CHARS.test(suffix)
  }

  return false
}

/**
 * Returns a privacy-safe masked version for display.
 * Shows enough to confirm identity without exposing the full key.
 * Example: "bc1qar0...4hkp28" or "1A1zP1...7PVNJ"
 *
 * Never call this with a full address in a log statement —
 * always log the masked version only.
 */
export function maskBTCAddress(address: string): string {
  if (!address || address.length < 12) return '***'
  return address.slice(0, 8) + '...' + address.slice(-6)
}

/**
 * Returns a human-readable label for the address type.
 */
export function btcAddressType(address: string): string {
  if (address.startsWith('bc1p')) return 'Taproot (P2TR)'
  if (address.startsWith('bc1q')) return 'Native SegWit (P2WPKH)'
  if (address.startsWith('bc1'))  return 'SegWit'
  if (address.startsWith('3'))    return 'P2SH'
  if (address.startsWith('1'))    return 'Legacy (P2PKH)'
  return 'Unknown'
}

/**
 * Sanitize account metadata before sending to the client.
 * Replaces the raw btcAddress with:
 *   - hasWatchOnlyAddress: boolean
 *   - btcAddressMasked: string | null
 *   - btcAddressType: string | null
 *
 * The full address is NEVER included in the returned object.
 */
export function sanitizeAccountMetadata(
  metadata: Record<string, unknown>
): Record<string, unknown> {
  const { btcAddress, ...rest } = metadata as { btcAddress?: string; [k: string]: unknown }

  return {
    ...rest,
    hasWatchOnlyAddress: !!btcAddress,
    btcAddressMasked: btcAddress ? maskBTCAddress(btcAddress) : null,
    btcAddressType: btcAddress ? btcAddressType(btcAddress) : null,
  }
}
