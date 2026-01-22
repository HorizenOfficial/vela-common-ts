import { JsonRpcProvider, Signer } from "ethers";
import ganache, { Server } from "ganache";
import assert from "assert";
import { deriveP521PrivateKeyFromSigner, deriveP521PrivateKeyFromSignerWithCustomChallenge } from "./wallet.js";
import { encrypt } from "./cipher.js";
import { stringToUint8Array, uint8ArrayToString } from "./utils.js";

let server: Server;
let signer: Signer;

const TEST_MESSAGE = "Hello, World!";
const TEST_CHALLENGE = "test challenge 2";
const NODE_PORT = 9545

describe("Client test", function () {
  this.timeout(20000);
  
  before(async () => {
    //launch node
    server = ganache.server();
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

  // TESTS
  it("cipher and decipher", async () => {
    //derive key from signer
    const keyPair1 = await deriveP521PrivateKeyFromSigner(signer, true);
    const keyPair2 = await deriveP521PrivateKeyFromSignerWithCustomChallenge(signer, TEST_CHALLENGE, true);

    //separate keys
    const privateKey1 = keyPair1.privateKey;
    const publicKey1 = keyPair1.publicKey;
    const privateKey2 = keyPair2.privateKey;
    const publicKey2 = keyPair2.publicKey;
    assert.notEqual(privateKey1, privateKey2);
    assert.notEqual(publicKey1, publicKey2);

    //cipher message
    const encrypted = await encrypt(privateKey1, publicKey2, stringToUint8Array(TEST_MESSAGE));

    //decipher message
    const decryptedBytes = await encrypt(privateKey2, publicKey1, encrypted);
    const decryptedMessage = uint8ArrayToString(decryptedBytes);

    assert.equal(decryptedMessage, TEST_MESSAGE);
  });
});