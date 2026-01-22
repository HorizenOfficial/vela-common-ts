/**
 * P-521 ECDH Encryption/Decryption Library
 * Compatible with Go implementation using NIST P-521 curve and AES-256-GCM
 */

import { bytesToHex, hexToBytes } from "./utils";

export class P521KeyPair {
  constructor(
    public privateKey: CryptoKey,
    public publicKey: CryptoKey
  ) {}
}

import { createHash, webcrypto } from "crypto";
import { ec as EC } from "elliptic";

const ec = new EC("p521");
const subtle = webcrypto.subtle;

export async function deriveKeyPairFromSeed(seed: Uint8Array): Promise<P521KeyPair> {
  const hash = createHash("sha512").update(seed).digest();
  const n = BigInt(ec.curve.n.toString(10));
  const d = (BigInt("0x" + hash.toString("hex")) % (n - BigInt(1))) + BigInt(1);

  const key = ec.keyFromPrivate(d.toString(16), "hex");
  const pub = key.getPublic();

  const x = Buffer.from(pub.getX().toArray("be", 66));
  const y = Buffer.from(pub.getY().toArray("be", 66));
  const dBuf = Buffer.from(d.toString(16), "hex");

  const privateJwk: JsonWebKey = {
    kty: "EC",
    crv: "P-521",
    x: b64url(x),
    y: b64url(y),
    d: b64url(dBuf),
    ext: true,
  };

  const publicJwk: JsonWebKey = {
    kty: "EC",
    crv: "P-521",
    x: b64url(x),
    y: b64url(y),
    ext: true,
  };

  const privateKey = await subtle.importKey(
    "jwk",
    privateJwk,
    { name: "ECDH", namedCurve: "P-521" },
    true,
    ["deriveBits", "deriveKey"]
  );

  const publicKey = await subtle.importKey(
    "jwk",
    publicJwk,
    { name: "ECDH", namedCurve: "P-521" },
    true,
    []
  );

  return new P521KeyPair(privateKey, publicKey);
}

/**
 * Derives a P-521 key pair from a seed
 * Note: Web Crypto API doesn't natively support deterministic key derivation from seed
 * This is a simplified implementation - for production use a library like @noble/curves
 */
export async function deriveKeyPairFromSeedOld(seed: Uint8Array): Promise<P521KeyPair> {
  // For now, generate a random key pair
  // True deterministic derivation requires lower-level crypto operations
  // not available in Web Crypto API
  console.warn('deriveKeyPairFromSeed: Using random generation instead of seed derivation');
  console.warn('For deterministic derivation, use a library like @noble/curves');
  
  return await generateKeyPair();
}

/**
 * Generates a new P-521 key pair
 */
export async function generateKeyPair(): Promise<P521KeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-521'
    },
    true,
    ['deriveKey', 'deriveBits']
  );

  return new P521KeyPair(keyPair.privateKey, keyPair.publicKey);
}

/**
 * Imports a public key from hex bytes
 */
export async function importPublicKeyFromHex(hexString: string): Promise<CryptoKey> {
  const bytes = hexToBytes(hexString);
  
  return await crypto.subtle.importKey(
    'raw',
    bytes as BufferSource,
    {
      name: 'ECDH',
      namedCurve: 'P-521'
    },
    true,
    []
  );
}

/**
 * Exports a public key as hex string
 */
export async function exportPublicKeyToHex(publicKey: CryptoKey): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey));
  return bytesToHex(bytes);
}

/**
 * Imports a private key from hex bytes (JWK format required)
 */
export async function importPrivateKeyFromHex(hexString: string): Promise<CryptoKey> {
  // Web Crypto API requires JWK format for private key import
  // This is a limitation - you'll need the full JWK, not just raw bytes
  throw new Error('Private key import from raw hex not supported by Web Crypto API. Use importPrivateKeyFromJWK instead.');
}

/**
 * Imports a private key from JWK
 */
export async function importPrivateKeyFromJWK(jwk: JsonWebKey): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'ECDH',
      namedCurve: 'P-521'
    },
    true,
    ['deriveKey', 'deriveBits']
  );
}

/**
 * Exports a private key as JWK
 */
export async function exportPrivateKeyToJWK(privateKey: CryptoKey): Promise<JsonWebKey> {
  return await crypto.subtle.exportKey('jwk', privateKey) as JsonWebKey;
}

/**
 * Encrypts a message using ECDH + AES-256-GCM
 */
export async function encrypt(
  senderPrivateKey: CryptoKey,
  receiverPublicKey: CryptoKey,
  message: Uint8Array
): Promise<Uint8Array> {
  // Derive shared secret with ECDH
  const sharedSecret = await crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: receiverPublicKey
    },
    senderPrivateKey,
    256 // 256 bits for AES-256
  );

  // Derive final AES-256 key using HKDF
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
  // Derive shared secret with ECDH
  const sharedSecret = await crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: senderPublicKey
    },
    receiverPrivateKey,
    256 // 256 bits for AES-256
  );

  // Derive final AES-256 key using HKDF
  const aesKey = await deriveAES256KeyFromBits(new Uint8Array(sharedSecret));

  return await decryptWithAES(aesKey, ciphertext);
}

/**
 * Encrypts with AES-256-GCM (Go-compatible format)
 */
export async function encryptWithAES(
  key: CryptoKey,
  message: Uint8Array
): Promise<Uint8Array> {
  // Generate random 12-byte nonce (standard for GCM)
  const nonce = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt the message
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce,
      tagLength: 128 // 16 bytes authentication tag
    },
    key,
    message as BufferSource
  );

  // Prepend nonce to ciphertext (as Go does)
  const result = new Uint8Array(nonce.length + ciphertext.byteLength);
  result.set(nonce, 0);
  result.set(new Uint8Array(ciphertext), nonce.length);

  return result;
}

/**
 * Decrypts with AES-256-GCM (Go-compatible format)
 */
export async function decryptWithAES(
  key: CryptoKey,
  encryptedData: Uint8Array
): Promise<Uint8Array> {
  // Extract nonce (first 12 bytes)
  const nonce = encryptedData.slice(0, 12);
  const ciphertext = encryptedData.slice(12);

  // Decrypt the message
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: nonce,
      tagLength: 128
    },
    key,
    ciphertext
  );

  return new Uint8Array(plaintext);
}

/**
 * Derives an AES-256 key from shared secret bits (mimics Go behavior)
 */
async function deriveAES256KeyFromBits(sharedBytes: Uint8Array): Promise<CryptoKey> {
  // Convert shared bytes buffer to proper BufferSource
  const sharedBuffer = sharedBytes.buffer.slice(
    sharedBytes.byteOffset,
    sharedBytes.byteOffset + sharedBytes.byteLength
  );

  // Import shared secret for HKDF
  const importedSecret = await crypto.subtle.importKey(
    'raw',
    sharedBuffer as BufferSource,
    'HKDF',
    false,
    ['deriveKey']
  );

  // Use HKDF to derive final AES-256 key
  return await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: new Uint8Array(0)
    },
    importedSecret,
    {
      name: 'AES-GCM',
      length: 256
    },
    false,
    ['encrypt', 'decrypt']
  );
}

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}