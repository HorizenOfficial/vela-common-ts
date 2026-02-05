/**
 * P-521 ECDH Encryption/Decryption Library
 * Browser-compatible using Web Crypto API
 * Compatible with Go implementation using NIST P-521 curve and AES-256-GCM
 *
 * Uses @noble/curves for elliptic curve operations (audited, production-ready library)
 */

import { p521 } from '@noble/curves/nist.js';
import { bigIntToUint8Array, bytesToHex, hexToBytes, uint8ArrayToBase64Url } from "./utils";

export class P521KeyPair {
  constructor(
    public privateKey: CryptoKey,
    public publicKey: CryptoKey
  ) {}
}

/**
 * Derives a P-521 key pair from a seed (browser-compatible)
 * Uses SHA-512 via Web Crypto API with rejection sampling to avoid modulo bias
 *
 * WARNING: This function uses rejection sampling which is not constant-time.
 * It may leak information about the private key through side-channel timing attacks.
 */
export async function deriveKeyPairFromSeed(seed: Uint8Array): Promise<P521KeyPair> {
  const n = p521.Point.Fn.ORDER;
  let d: bigint;
  let counter = 0;

  // Rejection sampling to avoid modulo bias
  // Keep deriving until we get a value in the valid range [1, n-1]
  while (true) {
    // Append counter to seed to get different values on each iteration
    const counterBytes = new Uint8Array(4);
    new DataView(counterBytes.buffer).setUint32(0, counter, false);

    const input = new Uint8Array(seed.length + counterBytes.length);
    input.set(seed, 0);
    input.set(counterBytes, seed.length);

    const hashBuffer = await crypto.subtle.digest("SHA-512", input as BufferSource);
    const hash = new Uint8Array(hashBuffer);
    const hashHex = bytesToHex(hash);
    const candidate = BigInt("0x" + hashHex);

    // Accept if candidate is in valid range [1, n-1]
    if (candidate > BigInt(0) && candidate < n) {
      d = candidate;
      break;
    }

    counter++;
  }

  // P-521 requires exactly 66 bytes for d, x, y
  const dBytes = bigIntToUint8Array(d, 66);

  const { x, y } = computePublicKeyFromPrivate(d);

  const xBytes = bigIntToUint8Array(x, 66);
  const yBytes = bigIntToUint8Array(y, 66);

  const xB64 = uint8ArrayToBase64Url(xBytes);
  const yB64 = uint8ArrayToBase64Url(yBytes);
  const dB64 = uint8ArrayToBase64Url(dBytes);

  const fullPrivateJwk: JsonWebKey = {
    kty: "EC",
    crv: "P-521",
    x: xB64,
    y: yB64,
    d: dB64,
    ext: true,
  };

  const publicJwk: JsonWebKey = {
    kty: "EC",
    crv: "P-521",
    x: xB64,
    y: yB64,
    ext: true,
  };

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    fullPrivateJwk,
    { name: "ECDH", namedCurve: "P-521" },
    true,
    []
  );

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    publicJwk,
    { name: "ECDH", namedCurve: "P-521" },
    true,
    []
  );

  return new P521KeyPair(privateKey, publicKey);
}

/**
 * Derives a P-521 key pair using HKDF (HMAC-based Key Derivation Function)
 * The signature is used as the Input Keying Material (IKM)
 * salt and info are used to separate versions and context
 *
 * IMPORTANT SECURITY NOTES:
 * 1. This function uses rejection sampling which is not constant-time.
 *    It may leak information about the private key through side-channel timing attacks.
 * 2. The derived bits only have ~256 bits of entropy (not 512), because the IKM
 *    is typically derived from an ECDSA signature which only has ~256 bits of entropy.
 */
export async function deriveKeyPairFromHKDF(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array
): Promise<P521KeyPair> {
  const n = p521.Point.Fn.ORDER;
  let d: bigint;
  let counter = 0;

  // Rejection sampling to avoid modulo bias
  // Keep deriving until we get a value in the valid range [1, n-1]
  while (true) {
    // Append counter to salt to get different values on each iteration
    const counterBytes = new Uint8Array(4);
    new DataView(counterBytes.buffer).setUint32(0, counter, false);

    const saltWithCounter = new Uint8Array(salt.length + counterBytes.length);
    saltWithCounter.set(salt, 0);
    saltWithCounter.set(counterBytes, salt.length);

    // Import IKM as HKDF key
    const ikmKey = await crypto.subtle.importKey(
      "raw",
      ikm as BufferSource,
      "HKDF",
      false,
      ["deriveBits"]
    );

    // Derive 64 bytes (512 bits) using HKDF
    // Note: Despite deriving 512 bits, the effective entropy is limited by the IKM (~256 bits)
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: saltWithCounter as BufferSource,
        info: info as BufferSource,
      },
      ikmKey,
      528
    );

    // Convert to bytes
    const derivedBytes = new Uint8Array(derivedBits);
    // Set the 7 most significant bits to 0 to get a uniformly distributed 521-bit value.
    // This greatly reduces the rejection rate since P-521 order is very close to 2^521.
    derivedBytes[0] &= 0x01;
    const hashHex = bytesToHex(derivedBytes);
    const candidate = BigInt("0x" + hashHex);

    // Accept if candidate is in valid range [1, n-1]
    if (candidate > BigInt(0) && candidate < n) {
      d = candidate;
      break;
    }

    counter++;
  }

  // P-521 requires exactly 66 bytes for d, x, y
  const dBytes = bigIntToUint8Array(d, 66);

  const { x, y } = computePublicKeyFromPrivate(d);

  const xBytes = bigIntToUint8Array(x, 66);
  const yBytes = bigIntToUint8Array(y, 66);

  const xB64 = uint8ArrayToBase64Url(xBytes);
  const yB64 = uint8ArrayToBase64Url(yBytes);
  const dB64 = uint8ArrayToBase64Url(dBytes);

  const fullPrivateJwk: JsonWebKey = {
    kty: "EC",
    crv: "P-521",
    x: xB64,
    y: yB64,
    d: dB64,
    ext: true,
  };

  const publicJwk: JsonWebKey = {
    kty: "EC",
    crv: "P-521",
    x: xB64,
    y: yB64,
    ext: true,
  };

  const privateKey = await crypto.subtle.importKey(
    "jwk",
    fullPrivateJwk,
    { name: "ECDH", namedCurve: "P-521" },
    true,
    ["deriveBits", "deriveKey"]
  );

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    publicJwk,
    { name: "ECDH", namedCurve: "P-521" },
    true,
    []
  );

  return new P521KeyPair(privateKey, publicKey);
}

/**
 * Computes the public key from a private key using @noble/curves
 */
function computePublicKeyFromPrivate(d: bigint): { x: bigint; y: bigint } {
  const point = p521.Point.BASE.multiply(d);
  return { x: point.x, y: point.y };
}

/**
 * Generates a new P-521 key pair
 */
export async function generateKeyPair(): Promise<P521KeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-521" },
    true,
    ["deriveKey", "deriveBits"]
  );
  return new P521KeyPair(keyPair.privateKey, keyPair.publicKey);
}

/**
 * Imports a public key from hex bytes
 */
export async function importPublicKeyFromHex(hexString: string): Promise<CryptoKey> {
  const bytes = hexToBytes(hexString);
  return await crypto.subtle.importKey(
    "raw",
    bytes as BufferSource,
    { name: "ECDH", namedCurve: "P-521" },
    true,
    []
  );
}

/**
 * Exports a public key as hex string
 */
export async function exportPublicKeyToHex(publicKey: CryptoKey): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.exportKey("raw", publicKey));
  return bytesToHex(bytes);
}

/**
 * Imports a private key from JWK
 */
export async function importPrivateKeyFromJWK(jwk: JsonWebKey): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-521" },
    true,
    ["deriveKey", "deriveBits"]
  );
}

/**
 * Imports a private key from hex bytes (d value)
 */
export async function importPrivateKeyFromHex(hexString: string): Promise<CryptoKey> {
  const dBytes = hexToBytes(hexString);
  const d = BigInt("0x" + hexString);

  const { x, y } = computePublicKeyFromPrivate(d);

  const xBytes = bigIntToUint8Array(x, 66);
  const yBytes = bigIntToUint8Array(y, 66);

  const xB64 = uint8ArrayToBase64Url(xBytes);
  const yB64 = uint8ArrayToBase64Url(yBytes);
  const dB64 = uint8ArrayToBase64Url(dBytes);

  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-521",
    x: xB64,
    y: yB64,
    d: dB64,
    ext: true,
  };

  return await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-521" },
    true,
    ["deriveKey", "deriveBits"]
  );
}

/**
 * Exports a private key as JWK
 */
export async function exportPrivateKeyToJWK(privateKey: CryptoKey): Promise<JsonWebKey> {
  return (await crypto.subtle.exportKey("jwk", privateKey)) as JsonWebKey;
}

/**
 * Encrypts a message using ECDH + AES-256-GCM
 */
export async function encrypt(
  senderPrivateKey: CryptoKey,
  receiverPublicKey: CryptoKey,
  message: Uint8Array
): Promise<Uint8Array> {
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: receiverPublicKey },
    senderPrivateKey,
    528 // P521 uses 528 bits (rounded up from 521)
  );
  const aesKey = await deriveAES256KeyFromBits(new Uint8Array(sharedSecret));
  return await encryptWithAES(aesKey, message);
}

/**
 * Decrypts a message using ECDH + AES-256-GCM
 */
export async function decrypt(
  receiverPrivateKey: CryptoKey,
  senderPublicKey: CryptoKey,
  ciphertext: Uint8Array
): Promise<Uint8Array> {
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: senderPublicKey },
    receiverPrivateKey,
    528 // P521 uses 528 bits (rounded up from 521)
  );
  const aesKey = await deriveAES256KeyFromBits(new Uint8Array(sharedSecret));
  return await decryptWithAES(aesKey, ciphertext);
}

/**
 * Encrypts with AES-256-GCM (Go-compatible format)
 */
export async function encryptWithAES(key: CryptoKey, message: Uint8Array): Promise<Uint8Array> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    key,
    message as BufferSource
  );
  const result = new Uint8Array(nonce.length + ciphertext.byteLength);
  result.set(nonce, 0);
  result.set(new Uint8Array(ciphertext), nonce.length);
  return result;
}

/**
 * Decrypts with AES-256-GCM (Go-compatible format)
 */
export async function decryptWithAES(key: CryptoKey, encryptedData: Uint8Array): Promise<Uint8Array> {
  const nonce = encryptedData.slice(0, 12);
  const ciphertext = encryptedData.slice(12);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    key,
    ciphertext
  );
  return new Uint8Array(plaintext);
}

/**
 * Derives an AES-256 key from shared secret bits
 */
async function deriveAES256KeyFromBits(sharedBytes: Uint8Array): Promise<CryptoKey> {
  const importedSecret = await crypto.subtle.importKey(
    "raw",
    sharedBytes as BufferSource,
    "HKDF",
    false,
    ["deriveKey"]
  );
  return await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new Uint8Array(0) },
    importedSecret,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}