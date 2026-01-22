import { ethers, JsonRpcProvider, Signer } from "ethers";
import { CHALLENGE, importPrivateKeyP521, importPublicKeyP521 } from "./utils";
import { createHash } from "crypto";

export interface DerivedP521KeyPair {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}

// KEY DERIVATION
export async function deriveP521PrivateKeyFromSigner(signer: Signer, useAlternativeSign: boolean): Promise<DerivedP521KeyPair> {
  return await deriveP521PrivateKeyFromSignerWithCustomChallenge(signer, CHALLENGE, useAlternativeSign);
}

export async function deriveP521PrivateKeyFromSignerWithCustomChallenge(
  signer: Signer,
  challenge: string,
  useAlternativeSign: boolean
): Promise<DerivedP521KeyPair> {

  //sign challenge
  const signature: string = useAlternativeSign && signer.provider instanceof JsonRpcProvider? await _alternativeSign(signer, challenge) : await signer.signMessage(challenge);

  const sigHex = signature.startsWith("0x")
    ? signature.slice(2)
    : signature;

  const sigBytes = Uint8Array.from(
    sigHex.match(/.{1,2}/g)!.map(b => parseInt(b, 16))
  );

  //use signature + challenge as seed to derive private key
  const challengeBytes = new TextEncoder().encode(challenge);
  const seed = new Uint8Array(sigBytes.length + challengeBytes.length);
  seed.set(sigBytes);
  seed.set(challengeBytes, sigBytes.length);

  const hashBuffer = await crypto.subtle.digest("SHA-512", seed);
  const hash = new Uint8Array(hashBuffer);

  return await deriveP521KeyFromSeed(hash);
}

async function _alternativeSign(signer: Signer, message: string): Promise<string> {
  const prefix = `\x19Ethereum Signed Message:\n${message.length}`;
  const prefixed = ethers.toUtf8Bytes(prefix + message);
  const hash = ethers.keccak256(prefixed);

  return await (signer.provider as JsonRpcProvider).send("eth_sign", [await signer.getAddress(), hash]);
}

export async function deriveP521KeyFromSeed(seed: Uint8Array): Promise<DerivedP521KeyPair> {
  const { p521 } = await import("@noble/curves/nist.js");

  //seed to 99 bytes required
  const hash = createHash("sha512").update(seed).digest();
  const extra = createHash("sha512").update(hash).digest();

  const combined = new Uint8Array([...hash, ...extra]).subarray(0, 99);

  const priv = p521.utils.randomSecretKey(combined);
  const pub = p521.getPublicKey(priv);
  return { 
    privateKey: await importPrivateKeyP521(priv),
    publicKey: await importPublicKeyP521(pub)
  };
}