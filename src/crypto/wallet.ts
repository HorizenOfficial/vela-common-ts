import { ethers, JsonRpcProvider, Signer } from "ethers";
import { CHALLENGE } from "./utils";
import { deriveKeyPairFromSeed, P521KeyPair } from "./p521";

// KEY DERIVATION
export async function deriveP521PrivateKeyFromSigner(signer: Signer, useAlternativeSign: boolean): Promise<P521KeyPair> {
  return await deriveP521PrivateKeyFromSignerWithCustomChallenge(signer, CHALLENGE, useAlternativeSign);
}

export async function deriveP521PrivateKeyFromSignerWithCustomChallenge(
  signer: Signer,
  challenge: string,
  useAlternativeSign: boolean
): Promise<P521KeyPair> {

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

  return await deriveKeyPairFromSeed(hash);
}

async function _alternativeSign(signer: Signer, message: string): Promise<string> {
  const prefix = `\x19Ethereum Signed Message:\n${message.length}`;
  const prefixed = ethers.toUtf8Bytes(prefix + message);
  const hash = ethers.keccak256(prefixed);

  return await (signer.provider as JsonRpcProvider).send("eth_sign", [await signer.getAddress(), hash]);
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