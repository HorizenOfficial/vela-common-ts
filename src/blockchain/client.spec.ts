import { JsonRpcProvider } from "ethers";
import ganache, { Server } from "ganache";
import assert from "assert";
import { HorizenPESClient, RequestType } from "../blockchain/client.js";
import { AuthorityRegistry, AuthorityRegistry__factory, MockTeeAuthenticator__factory, ProcessorEndpoint, ProcessorEndpoint__factory } from "../typechain-types/index.js";
import { encrypt, exportPublicKeyToHex, P521KeyPair } from "../crypto/p521.js";
import { deriveP521PrivateKeyFromSigner, deriveP521PrivateKeyFromSignerWithCustomChallenge } from "../crypto/wallet.js";
import { bytesToString, stringToBytes } from "../crypto/utils.js";

let server: Server;
let provider: JsonRpcProvider;
let client: HorizenPESClient;
let processorEndpoint: ProcessorEndpoint;
let authorityRegistry: AuthorityRegistry;
let teePubSecp: P521KeyPair;

const NODE_PORT = 9545

describe("Client test", function () {
  this.timeout(20000);
  
  before(async () => {
    //launch node
    server = ganache.server();
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

    client = new HorizenPESClient(signer, true, await authorityRegistry.getAddress(), await teeAuthenticator.getAddress(), await processorEndpoint.getAddress());
  });

  after(async () => {
    //kill node
    await server.close();
  });

  // TESTS
  it("provider is reachable", async () => {
    const block = await provider.getBlockNumber();
    assert.equal(block >= 0, true);
  });

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
    //submit request
    const submitResponse = await client.submitRequestAndWaitForRequestId(0, 1, RequestType.PROCESS, Uint8Array.from([1, 2, 3]), BigInt(10), BigInt(0));
    assert.notEqual(submitResponse.requestId, undefined);

    //generate user key
    const userKeyPair = await deriveP521PrivateKeyFromSigner(await provider.getSigner(0), true);
    //encrypt event
    const eventMessage = "Hello world!";
    const encrypted = await encrypt(teePubSecp.privateKey, userKeyPair.publicKey, stringToBytes(eventMessage));

    //retrieve and decrypt event
    const events = await client.decryptAndFilterEvents([encrypted], undefined, (event: Uint8Array) => true, true);
    assert.equal(events.length, 1);
    const decryptedMessage = bytesToString(events[0]);
    assert.equal(decryptedMessage, eventMessage);
  });


});