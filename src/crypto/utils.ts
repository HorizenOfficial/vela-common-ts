import { ethers, Signer } from "ethers";

const CHALLENGE = "challenge";

export async function deriveP521PrivateKeyFromSigner(signer: Signer): Promise<Uint8Array> {
  return await deriveP521PrivateKeyFromSignerWithCustomChallenge(signer, CHALLENGE);
}

export async function deriveP521PrivateKeyFromSignerWithCustomChallenge(
  signer: Signer,
  challenge: string
): Promise<Uint8Array> {
  if (!(window as any).ethereum) {
    throw new Error("wallet not connected");
  }

  //sign challenge
  const signature: string = await signer.signMessage(challenge);

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

  // private key P-521 ≈ 66 byte
  return hash.slice(0, 66);
}

export async function ethersSignerFromBrowser(): Promise<Signer> {
  if (!(window as any).ethereum) {
    throw new Error("wallet not connected");
  }
  const ethereum = (window as any).ethereum;
  const provider = new ethers.BrowserProvider(ethereum);
  const signer = await provider.getSigner();
  return signer;
}