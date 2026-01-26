import { ethers, JsonRpcProvider, Signer } from "ethers";
import { CHALLENGE, HKDF_SALT, HKDF_INFO } from "../constants";
import { deriveKeyPairFromHKDF, P521KeyPair } from "./p521";
import { hexToBytes } from "./utils";

// ---------- KEY DERIVATION ----------
export async function deriveP521PrivateKeyFromSigner(
  signer: Signer,
  useAlternativeSign: boolean
): Promise<P521KeyPair> {
  const address = await signer.getAddress();
  const messageToSign: string = CHALLENGE + address;
  
  // Sign the message
  const signature: string = useAlternativeSign && signer.provider instanceof JsonRpcProvider
    ? await _alternativeSign(signer, messageToSign)
    : await signer.signMessage(messageToSign);

  // Convert signature hex to bytes
  const sigBytes = hexToBytes(signature);

  // Derive P521 key pair using HKDF with the signature as IKM
  return await deriveKeyPairFromHKDF(sigBytes, HKDF_SALT, HKDF_INFO);
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