/**
 * P-521 ECDH Encryption/Decryption Library
 * Browser-compatible using Web Crypto API
 * Compatible with Go implementation using NIST P-521 curve and AES-256-GCM
 */

import { bigIntToUint8Array, bytesToHex, hexToBytes, uint8ArrayToBase64Url } from "./utils";

export class P521KeyPair {
  constructor(
    public privateKey: CryptoKey,
    public publicKey: CryptoKey
  ) {}
}

/**
 * Derives a P-521 key pair from a seed (browser-compatible)
 * Uses SHA-512 via Web Crypto API
 */
export async function deriveKeyPairFromSeed(seed: Uint8Array): Promise<P521KeyPair> {
  const hashBuffer = await crypto.subtle.digest("SHA-512", seed as BufferSource);
  const hash = new Uint8Array(hashBuffer);

  const n = P521.n;
  const hashHex = bytesToHex(hash);
  const d = (BigInt("0x" + hashHex) % (n - BigInt(1))) + BigInt(1);

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
 * P-521 curve parameters
 */
const P521 = {
  // p = 2^521 - 1
  p: BigInt(
    "0x01ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
  ),
  a: BigInt(-3),
  b: BigInt(
    "0x0051953eb9618e1c9a1f929a21a0b68540eea2da725b99b315f3b8b489918ef109e156193951ec7e937b1652c0bd3bb1bf073573df883d2c34f1ef451fd46b503f00"
  ),
  Gx: BigInt(
    "0x00c6858e06b70404e9cd9e3ecb662395b4429c648139053fb521f828af606b4d3dbaa14b5e77efe75928fe1dc127a2ffa8de3348b3c1856a429bf97e7e31c2e5bd66"
  ),
  Gy: BigInt(
    "0x0118 39296a789a3bc0045c8a5fb42c7d1bd998f54449579b446817afbd17273e662c97ee72995ef42640c550b9013fad0761353c7086a272c24088be94769fd16650".replace(/\s/g, "")
  ),
  n: BigInt(
    "0x01fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffa51868783bf2f966b7fcc0148f709a5d03bb5c9b8899c47aebb6fb71e91386409"
  ),
};

function mod(a: bigint, m: bigint): bigint {
  return ((a % m) + m) % m;
}

function modInverse(a: bigint, m: bigint): bigint {
  let [old_r, r] = [mod(a, m), m];
  let [old_s, s] = [BigInt(1), BigInt(0)];
  while (r !== BigInt(0)) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  return mod(old_s, m);
}

interface Point {
  x: bigint;
  y: bigint;
  isInfinity?: boolean;
}

const INFINITY: Point = { x: BigInt(0), y: BigInt(0), isInfinity: true };

function pointAdd(p1: Point, p2: Point): Point {
  if (p1.isInfinity) return p2;
  if (p2.isInfinity) return p1;

  const { p, a } = P521;

  if (p1.x === p2.x) {
    if (mod(p1.y + p2.y, p) === BigInt(0)) return INFINITY;
    // Point doubling
    const num = mod(BigInt(3) * p1.x * p1.x + a, p);
    const den = modInverse(BigInt(2) * p1.y, p);
    const m = mod(num * den, p);
    const x3 = mod(m * m - BigInt(2) * p1.x, p);
    const y3 = mod(m * (p1.x - x3) - p1.y, p);
    return { x: x3, y: y3 };
  }

  // Point addition
  const num = mod(p2.y - p1.y, p);
  const den = modInverse(mod(p2.x - p1.x, p), p);
  const m = mod(num * den, p);
  const x3 = mod(m * m - p1.x - p2.x, p);
  const y3 = mod(m * (p1.x - x3) - p1.y, p);
  return { x: x3, y: y3 };
}

function pointMul(k: bigint, point: Point): Point {
  let result: Point = INFINITY;
  let addend: Point = { x: point.x, y: point.y };

  let scalar = k;
  while (scalar > BigInt(0)) {
    if (scalar & BigInt(1)) {
      result = pointAdd(result, addend);
    }
    addend = pointAdd(addend, addend);
    scalar >>= BigInt(1);
  }
  return result;
}

function computePublicKeyFromPrivate(d: bigint): { x: bigint; y: bigint } {
  const G: Point = { x: P521.Gx, y: P521.Gy };
  const pub = pointMul(d, G);
  return { x: pub.x, y: pub.y };
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
    256
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
    256
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