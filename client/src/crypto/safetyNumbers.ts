import { ensureSodium } from './e2ee.js';

export interface SafetyNumberDetails {
  numericFormat: string; // 12 groups of 5 digits: "12345 67890 ..."
  fingerprintHex: string; // 8 groups of 4 hex digits: "A1B2 C3D4 ..."
  qrData: string;
}

/**
 * Generate cryptographic safety number and visual fingerprint for contact identity verification
 */
export async function computeSafetyNumber(
  myIdentityPublicKeyBase64: string,
  contactIdentityPublicKeyBase64: string
): Promise<SafetyNumberDetails> {
  const s = await ensureSodium();

  // 1. Sort public keys lexicographically for determinism regardless of who calculates
  const sorted = [myIdentityPublicKeyBase64, contactIdentityPublicKeyBase64].sort();
  const concatenated = `${sorted[0]}:${sorted[1]}`;

  // 2. Compute 64-byte SHA-512 generic hash
  const hash = s.crypto_generichash(64, s.from_string(concatenated), null);

  // 3. Format 60 decimal digits (12 groups of 5 digits)
  let digits = '';
  for (let i = 0; i < hash.length && digits.length < 60; i += 2) {
    const num = ((hash[i] << 8) | hash[i + 1]) % 100000;
    digits += num.toString().padStart(5, '0');
  }

  const raw60 = digits.slice(0, 60);
  const numericGroups: string[] = [];
  for (let i = 0; i < 60; i += 5) {
    numericGroups.push(raw60.slice(i, i + 5));
  }
  const numericFormat = numericGroups.join(' ');

  // 4. Hex fingerprint (first 16 bytes = 32 hex chars formatted in 8 groups of 4)
  const hex = s.to_hex(hash.slice(0, 16)).toUpperCase();
  const hexGroups: string[] = [];
  for (let i = 0; i < 32; i += 4) {
    hexGroups.push(hex.slice(i, i + 4));
  }
  const fingerprintHex = hexGroups.join(' ');

  const qrData = `privatechat:safety:${numericFormat.replace(/\s+/g, '')}`;

  return {
    numericFormat,
    fingerprintHex,
    qrData,
  };
}
