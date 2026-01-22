import { ethers, Signer } from "ethers";

export const CHALLENGE = "challenge";

// ---------- HELPER ----------

export function stringToUint8Array(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

export function uint8ArrayToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

// ---------- ETHERJS SIGNER FROM BROWSER WALLET ----------
export async function ethersSignerFromBrowser(): Promise<Signer> {
  if (!(window as any).ethereum) {
    throw new Error("wallet not connected");
  }
  const ethereum = (window as any).ethereum;
  const provider = new ethers.BrowserProvider(ethereum);
  const signer = await provider.getSigner();
  return signer;
}

// ---------- P-521 KEY IMPORT ----------
export async function importPrivateKeyP521(privateKeyBytes: Uint8Array): Promise<CryptoKey> {
  const { p521 } = await import("@noble/curves/nist.js");
  const jwk = {
    kty: "EC",
    crv: "P-521",
    d: Buffer.from(privateKeyBytes).toString("base64url"),
    x: "",
    y: "",
    ext: true
  };

  const pub = p521.getPublicKey(privateKeyBytes);
  jwk.x = Buffer.from(pub.slice(1, 67)).toString("base64url");
  jwk.y = Buffer.from(pub.slice(67)).toString("base64url");

  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-521" },
    true,
    ["deriveBits"]
  );
}

export async function importPublicKeyP521(publicKeyBytes: Uint8Array): Promise<CryptoKey> {
  const jwk = {
    kty: "EC",
    crv: "P-521",
    x: Buffer.from(publicKeyBytes.slice(1, 67)).toString("base64url"),
    y: Buffer.from(publicKeyBytes.slice(67)).toString("base64url"),
    ext: true
  };

  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-521" },
    true,
    []
  );
}


