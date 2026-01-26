import { JsonRpcProvider } from "ethers";
import ganache, { Server } from "ganache";
import assert from "assert";
import { HorizenCCEClient, RequestType } from "../blockchain/client";
import { AuthorityRegistry, AuthorityRegistry__factory, MockTeeAuthenticator__factory, ProcessorEndpoint, ProcessorEndpoint__factory } from "../typechain-types/index";
import { encrypt, exportPublicKeyToHex, P521KeyPair } from "../crypto/p521.js";
import { deriveP521PrivateKeyFromSigner, deriveP521PrivateKeyFromSignerWithCustomChallenge } from "../crypto/wallet";
import { bytesToString, stringToBytes } from "../crypto/utils";

let server: Server;
let provider: JsonRpcProvider;
let client: HorizenCCEClient;
let processorEndpoint: ProcessorEndpoint;
let authorityRegistry: AuthorityRegistry;
let teePubSecp: P521KeyPair;

const NODE_PORT = 9545

describe("CCE Client test", function () {
  this.timeout(20000);
  
  before(async () => {
    //launch node
    server = ganache.server({
      wallet: {seed: "test test test test test test test test test test test junk"},
      logging: { quiet: true },
    });    
    await server.listen(NODE_PORT);

    //connect provider
    provider = new JsonRpcProvider(`http://127.0.0.1:${NODE_PORT}`);
    await provider.getBlockNumber();

    //generate key

    //deploy contracts
    const signer = await provider.getSigner(0);
    teePubSecp = await deriveP521PrivateKeyFromSignerWithCustomChallenge(signer, "tee secp challenge", true);
    const pubKey = await exportPublicKeyToHex(teePubSecp.publicKey);

    const teeAuthenticator = await new MockTeeAuthenticator__factory(signer).deploy(signer, "0x" + pubKey);
    await teeAuthenticator.waitForDeployment();
    
    authorityRegistry = await new AuthorityRegistry__factory(signer).deploy(signer, signer);
    await authorityRegistry.waitForDeployment();
    processorEndpoint = await new ProcessorEndpoint__factory(signer).deploy(teeAuthenticator, authorityRegistry, signer, signer, 0);
    await processorEndpoint.waitForDeployment();

    client = new HorizenCCEClient(signer, true, await teeAuthenticator.getAddress(), await processorEndpoint.getAddress());
  });

  after(async () => {
    //kill node
    await server.close();
  });

  // TESTS
  it("getPublicKey", async () => {
    const publicKey = await client.getTeePublicKey();
    const expectedPubKey = await exportPublicKeyToHex(teePubSecp.publicKey);
    assert.equal(publicKey, "0x"+expectedPubKey);
  })

  it("submitRequest", async () => {
    const submitResponse = await client.submitRequestAndWaitForRequestId(0, 1, RequestType.PROCESS, Uint8Array.from([1, 2, 3]), BigInt(10), BigInt(0));
    assert.notEqual(submitResponse.requestId, undefined);
    assert.notEqual(submitResponse.transactionReceipt, undefined);
  })

  it("getCurrentUserEvents (just decrypting - without retrieving events)", async () => {
    //generate user key
    const userKeyPair = await deriveP521PrivateKeyFromSigner(await provider.getSigner(0), true);
    //generate another user key
    const otherUserKeyPair = await deriveP521PrivateKeyFromSigner(await provider.getSigner(1), true);
    //encrypt event
    const eventMessage = "Hello world!";
    const correctEvent = await encrypt(teePubSecp.privateKey, userKeyPair.publicKey, stringToBytes(eventMessage));
    const incorrectEvent = await encrypt(teePubSecp.privateKey, otherUserKeyPair.publicKey, stringToBytes(eventMessage));

    //retrieve and decrypt event
    let events = await client.decryptAndFilterEvents([incorrectEvent, correctEvent, correctEvent], undefined, (event: Uint8Array) => true, true); //stop at first
    assert.equal(events.length, 1);
    const decryptedMessage = bytesToString(events[0]);
    assert.equal(decryptedMessage, eventMessage);

    events = await client.decryptAndFilterEvents([incorrectEvent], undefined, (event: Uint8Array) => true, true); // only incorrect events
    assert.equal(events.length, 0);

    events = await client.decryptAndFilterEvents([incorrectEvent, correctEvent, correctEvent], undefined, (event: Uint8Array) => true, false); //not stop at first
    assert.equal(events.length, 2);

    events = await client.decryptAndFilterEvents([incorrectEvent, correctEvent, correctEvent], undefined, (event: Uint8Array) => false, false); //filter returns false
    assert.equal(events.length, 0);
  });


});