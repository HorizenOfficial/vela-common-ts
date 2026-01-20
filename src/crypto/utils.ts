import { ethers, Signer } from "ethers";

export async function deriveP521PrivateKeyFromMetamask(
  challenge: string
): Promise<Uint8Array> {
  if (!(window as any).ethereum) {
    throw new Error("wallet not connected");
  }

  const ethereum = (window as any).ethereum;

  //sign challenge message
  const accounts: string[] = await ethereum.request({
    method: "eth_requestAccounts"
  });

  const address = accounts[0];

  const signature: string = await ethereum.request({
    method: "personal_sign",
    params: [challenge, address]
  });

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