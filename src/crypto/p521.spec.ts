import { JsonRpcProvider, Signer } from "ethers";
import ganache, { Server } from "ganache";
import assert from "assert";
import { deriveP521PrivateKeyFromSigner, deriveP521PrivateKeyFromSignerWithCustomChallenge } from "./wallet.js";
import { decrypt, encrypt } from "./p521.js";
import { bytesToString, stringToBytes } from "./utils.js";

let server: Server;
let signer: Signer;

const TEST_MESSAGE = "Hello, World!";
const TEST_DIFFERENT_CHALLENGE = "test challenge 2";
const NODE_PORT = 9545

const VERIFIED_X = "AHQLV2h6ij_il9rxvKj5AbcZrbfBUQpGBwGNMJ6C0KOtwu4cJUFXMbCtRRQFwBFixmJuhLSHxHYKH6yx4YF92uaN";
const VERIFIED_Y = "ALZgrC1q7P2zFmjJkraeHeGTB3K_SnOE0VpApxLYIshH7dEOv-yEbHKuZ_zdGiE1PC0-Fq4TudVn8DrbQziLAYlt";

describe("Client test", function () {
  this.timeout(20000);
  
  before(async () => {
    //launch node
    server = ganache.server({wallet: {seed: "test test test test test test test test test test test junk"}});
    await server.listen(NODE_PORT);

    //connect provider
    const provider = new JsonRpcProvider(`http://127.0.0.1:${NODE_PORT}`);
    await provider.getBlockNumber();
    signer = await provider.getSigner(0);
  });

  after(async () => {
    //kill node
    await server.close();
  });

  it("deterministic key derivation", async () => {
    const keyPair1 = await deriveP521PrivateKeyFromSigner(signer, true);
    const keyPair2 = await deriveP521PrivateKeyFromSigner(signer, true);

    const extracted1 = await crypto.subtle.exportKey("jwk", keyPair1.publicKey);
    const extracted2 = await crypto.subtle.exportKey("jwk", keyPair2.publicKey);

    assert.equal(extracted1.x, extracted2.x);
    assert.equal(extracted1.y, extracted2.y);
    assert.equal(extracted1.x, VERIFIED_X);
    assert.equal(extracted1.y, VERIFIED_Y);

    const keyPair3 = await deriveP521PrivateKeyFromSignerWithCustomChallenge(signer, TEST_DIFFERENT_CHALLENGE, true);
    const extracted3 = await crypto.subtle.exportKey("jwk", keyPair3.publicKey);

    assert.notEqual(extracted1.x, extracted3.x);
    assert.notEqual(extracted1.y, extracted3.y);
  });

  // TESTS
  it("cipher and decipher", async () => {
    //derive key from signer
    const keyPair1 = await deriveP521PrivateKeyFromSigner(signer, true);
    const keyPair2 = await deriveP521PrivateKeyFromSignerWithCustomChallenge(signer, TEST_DIFFERENT_CHALLENGE, true);

    assert.notEqual(keyPair1.privateKey, keyPair2.privateKey);
    assert.notEqual(keyPair1.publicKey, keyPair2.publicKey);

    //cipher message
    const encrypted = await encrypt(keyPair1.privateKey, keyPair2.publicKey, stringToBytes(TEST_MESSAGE));

    //decipher message
    const decryptedBytes = await decrypt(keyPair2.privateKey, keyPair1.publicKey, encrypted);
    const decryptedMessage = bytesToString(decryptedBytes);

    assert.equal(decryptedMessage, TEST_MESSAGE);
  });
});