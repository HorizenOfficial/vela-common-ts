import { JsonRpcProvider, Signer } from "ethers";
import ganache, { Server } from "ganache";
import assert from "assert";
import { deriveP521PrivateKeyFromSigner } from "./wallet";
import { decrypt, encrypt } from "./p521";
import { bytesToString, stringToBytes } from "./utils";

let server: Server;
let signer: Signer;
let signer2: Signer;

const TEST_MESSAGE = "Hello, World!";
const NODE_PORT = 9545

const VERIFIED_X = "AbOeZFV64oi3mjH7sAuC0887JSFk6ndcgG2EXmT9nMZCxiUwucJdmKSGHX_E2PrvhDNOIsSmLq26W_I3r0OgpEnu";
const VERIFIED_Y = "AAxyKLjUdolIHVzX5bCWsZ31Emkm8FnvJjbh6CaAK46wdh5RhBjr_1G4b05kVGWHTeQKVil3TlImiQqlhuBBEvyI";

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
});