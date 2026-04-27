/**
 * Seed generation and privacy-preserving event subtype utilities.
 *
 * A seed is a 65-byte secp256k1 signature over keccak256("subtype-key-v1").
 * When registered via ASSOCIATEKEY, the executor replaces WASM-provided
 * EventSubType values with deterministic HMAC-derived alternatives.
 */

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex } from "./utils";
import { encrypt } from "./p521";

import { SUBTYPE_KEY_MESSAGE, DEFAULT_SUBTYPE_N } from "../constants";

/**
 * Generates a seed by signing keccak256(SUBTYPE_KEY_MESSAGE) with a raw
 * secp256k1 private key.
 *
 * @param secp256k1PrivateKey - 32-byte raw private key
 * @returns 65-byte signature in [R ‖ S ‖ V] format (V ∈ {0, 1})
 */
export function generateSeed(secp256k1PrivateKey: Uint8Array): Uint8Array {
  const msgHash = keccak_256(new TextEncoder().encode(SUBTYPE_KEY_MESSAGE));
  return secp256k1.sign(msgHash, secp256k1PrivateKey, {
    prehash: false,
    format: "recovered",
  });
}

/**
 * Encrypts a 65-byte seed using ECDH(user_P521_private, enclave_P521_public)
 * followed by AES-256-GCM.
 *
 * @returns 93-byte envelope: nonce (12) ‖ ciphertext (65) ‖ tag (16)
 */
export async function encryptSeed(
  seed: Uint8Array,
  userP521PrivateKey: CryptoKey,
  enclaveP521PublicKey: CryptoKey,
): Promise<Uint8Array> {
  return await encrypt(userP521PrivateKey, enclaveP521PublicKey, seed);
}

/**
 * Builds the ASSOCIATEKEY payload.
 *
 * - Without seed: 133 bytes (P521 public key only)
 * - With encrypted seed: 226 bytes (P521 public key ‖ encrypted seed)
 */
export async function buildAssociateKeyPayload(
  p521PublicKey: CryptoKey,
  encryptedSeed?: Uint8Array,
): Promise<Uint8Array> {
  const pubKeyBytes = new Uint8Array(
    await crypto.subtle.exportKey("raw", p521PublicKey),
  );
  if (pubKeyBytes.length !== 133) {
    throw new Error(
      `Expected P521 public key to be 133 bytes, got ${pubKeyBytes.length}`,
    );
  }

  if (!encryptedSeed) {
    return pubKeyBytes;
  }

  if (encryptedSeed.length !== 93) {
    throw new Error(
      `Expected encrypted seed to be 93 bytes, got ${encryptedSeed.length}`,
    );
  }

  const payload = new Uint8Array(226);
  payload.set(pubKeyBytes, 0);
  payload.set(encryptedSeed, 133);
  return payload;
}

/**
 * Generates the set of N privacy-preserving subtypes from a seed.
 *
 * ```
 * subtype[i] = "0x" + hex(HMAC-SHA256(key=seed, data=byte(i)))
 * ```
 * for i in [1, N].
 */
export async function generateSubtypeSet(
  seed: Uint8Array,
  n: number = DEFAULT_SUBTYPE_N,
): Promise<string[]> {
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    seed as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const subtypes: string[] = [];
  for (let i = 1; i <= n; i++) {
    const data = new Uint8Array([i]);
    const mac = await crypto.subtle.sign("HMAC", hmacKey, data as BufferSource);
    subtypes.push("0x" + bytesToHex(new Uint8Array(mac)));
  }
  return subtypes;
}
