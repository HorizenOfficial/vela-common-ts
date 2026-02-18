import { JsonRpcProvider, Signer } from "ethers";
import ganache, { Server } from "ganache";
import assert from "assert";
import { deriveP521PrivateKeyFromSigner } from "./wallet";
import { decrypt, encrypt, importPrivateKeyFromHex, importPublicKeyFromHex } from "./p521";
import { bytesToString, hexToBytes, stringToBytes } from "./utils";

let server: Server;
let signer: Signer;
let signer2: Signer;

const TEST_MESSAGE = "Hello, World!";
const NODE_PORT = 9545

const VERIFIED_X = "AVWalFfYEbtdAm4ddovhT_mDjMuHo0oo6i2bQu4nGlQGk3esIVCyc1GuQ-O_WobCZEjofzsOGIzQZ8C-Y5R2zewm";
const VERIFIED_Y = "AK1Jj2KUwUD4f-scCiCbnYE_SO-CSjuCBVdaQF6xrPIcsb7bZywoseMH7O-yEm7ULGvcapZ0905qOFyUEWrleWaK";

describe("P521 test", function () {
  this.timeout(20000);
  
  before(async () => {
    //launch node
    server = ganache.server({
      wallet: {seed: "test test test test test test test test test test test junk"},
      logging: { quiet: true },
    });
    await server.listen(NODE_PORT);

    //connect provider
    const provider = new JsonRpcProvider(`http://127.0.0.1:${NODE_PORT}`);
    await provider.getBlockNumber();
    signer = await provider.getSigner(0);
    signer2 = await provider.getSigner(1);
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

    const keyPair3 = await deriveP521PrivateKeyFromSigner(signer2, true);
    const extracted3 = await crypto.subtle.exportKey("jwk", keyPair3.publicKey);

    assert.notEqual(extracted1.x, extracted3.x);
    assert.notEqual(extracted1.y, extracted3.y);
  });

  // TESTS
  it("crypt and decrypt", async () => {
    //derive key from signer
    const keyPair1 = await deriveP521PrivateKeyFromSigner(signer, true);
    const keyPair2 = await deriveP521PrivateKeyFromSigner(signer2, true);

    assert.notEqual(keyPair1.privateKey, keyPair2.privateKey);
    assert.notEqual(keyPair1.publicKey, keyPair2.publicKey);

    //encrypt message
    const encrypted = await encrypt(keyPair1.privateKey, keyPair2.publicKey, stringToBytes(TEST_MESSAGE));

    //decrypt message
    const decryptedBytes = await decrypt(keyPair2.privateKey, keyPair1.publicKey, encrypted);
    const decryptedMessage = bytesToString(decryptedBytes);

    assert.equal(decryptedMessage, TEST_MESSAGE);
  });

  it("decrypt Go library generated ciphertext and verify it is correct", async () => {
    // Test data from Go library
    const receiverPrivateKeyHex = "001183b8a4d7529277a45cfbc6a113eb228cbbfb95586b8a53cd00ba99544084a15a31111e2888831beaa25bec4e9a581c570c396fe79fb087b6e1b05ca028525940";
    const senderPublicKeyHex = "0401b6fb3fba703092f3f5f6c1b8b7cb86e876b4b1ba972176f2d39f77200d6f265a2ac7566809a3869ff3757b7f72d9c2df67e89caaf5a979a69b68cd4a13c1a3049f00ef9df5c8f61558c167586dd9a42430f7258e27058ed93311895fd92c9de8d642dd0b761dbc0a7fa9781eaccf7c63b1edf1ea6ea13effdbb126428c3226b5668bcf";
    const ciphertextHex = "78748faccaa4472319660f7a31bc6cbaa602f0b6d46e4369d0680f97304d9d9075c7720c21240c9d100dab1044ed74dee69f953e275b9d3e915ff5eee7baf5c7e8d972d72873b75556af8eafa84325e3f2b513d4a4764b64fceb5450c3d88536afa5eae6c5d81b04f3f7c7f5359784";
    const expectedDecrypted = '{"type":"deposit","amount":"0x38d7ea4c68000","balance":"0x38d7ea4c68000","nonce":4}';

    // Import keys
    const receiverPrivateKey = await importPrivateKeyFromHex(receiverPrivateKeyHex);
    const senderPublicKey = await importPublicKeyFromHex(senderPublicKeyHex);
    const ciphertext = hexToBytes(ciphertextHex);

    // Decrypt
    const decryptedBytes = await decrypt(receiverPrivateKey, senderPublicKey, ciphertext);
    const decryptedMessage = bytesToString(decryptedBytes);

    assert.equal(decryptedMessage, expectedDecrypted);
  });
});