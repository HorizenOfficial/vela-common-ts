import { createHash, randomBytes, createCipheriv, createDecipheriv } from "crypto";

// ---------- AES-256-GCM ----------

function deriveAES256Key(sharedSecret: ArrayBuffer): Uint8Array {
  return new Uint8Array(createHash("sha256").update(Buffer.from(sharedSecret)).digest());
}

export async function encrypt(
  senderPrivKey: CryptoKey,
  receiverPubKey: CryptoKey,
  message: Uint8Array
): Promise<Uint8Array> {
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: receiverPubKey },
    senderPrivKey,
    521
  );

  const aesKey = deriveAES256Key(sharedSecret);
  const nonce = randomBytes(12);

  const cipher = createCipheriv("aes-256-gcm", aesKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(message), cipher.final()]);
  const tag = cipher.getAuthTag();

  const result = new Uint8Array(nonce.length + ciphertext.length + tag.length);
  result.set(nonce, 0);
  result.set(ciphertext, nonce.length);
  result.set(tag, nonce.length + ciphertext.length);
  return result;
}

export async function decrypt(
  receiverPrivKey: CryptoKey,
  senderPubKey: CryptoKey,
  encrypted: Uint8Array
): Promise<Uint8Array> {
  const nonce = encrypted.subarray(0, 12);
  const data = encrypted.subarray(12);
  const ciphertext = data.subarray(0, data.length - 16);
  const tag = data.subarray(data.length - 16);

  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: senderPubKey },
    receiverPrivKey,
    521
  );

  const aesKey = deriveAES256Key(sharedSecret);

  const decipher = createDecipheriv("aes-256-gcm", aesKey, nonce);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return new Uint8Array(plaintext);
}