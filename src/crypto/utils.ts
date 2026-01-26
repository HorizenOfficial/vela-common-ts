export const CHALLENGE = "challenge";

// ---------- HELPER ----------

export function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.replace(/^0x/, '').replace(/\s/g, '');
  if(cleaned.length % 2 != 0) {
    throw new Error(`Invalid hex string (odd length: ${cleaned.length}`);
  }

  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes[i / 2] = parseInt(cleaned.substr(i, 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

export function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Converts BigInt to Uint8Array with specified length
 */
export function bigIntToUint8Array(n: bigint, length: number): Uint8Array {
  const hex = n.toString(16).padStart(length * 2, "0");
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Converts Uint8Array to base64url string
 */
export function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}