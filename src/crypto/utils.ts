import { ethers, Signer } from "ethers";

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