import { JsonRpcProvider, ZeroHash } from "ethers";
import { ETH_TOKEN } from "../constants";
import ganache, { Server } from "ganache";
import assert from "assert";
import { VelaClient, RequestType } from "../blockchain/client";
import { AuthorityRegistry, AuthorityRegistry__factory, MockTeeAuthenticator__factory, ProcessorEndpoint, ProcessorEndpoint__factory } from "../typechain-types/index";
import { decrypt, encrypt, exportPublicKeyToHex, generateKeyPair, P521KeyPair } from "../crypto/p521";
import { deriveP521PrivateKeyFromSigner } from "../crypto/wallet";
import { bytesToHex, bytesToString, stringToBytes } from "../crypto/utils";
import { UserEventEvent } from "../typechain-types/contracts/ProcessorEndpoint";
import { TypedContractEvent, TypedEventLog } from "../typechain-types/common";

let server: Server;
let provider: JsonRpcProvider;
let client: VelaClient;
let processorEndpoint: ProcessorEndpoint;
let authorityRegistry: AuthorityRegistry;
let teePubSecp: P521KeyPair;
let applicationId: bigint;

const NODE_PORT = 9545
const BYTES32_ZERO = ZeroHash;
const INITIAL_STATE_ROOT = "0x0000000000000000000000000000000000000000000000000000000000000001";

describe("Vela Client test", function () {
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
    teePubSecp = await generateKeyPair();
    const pubKey = await exportPublicKeyToHex(teePubSecp.publicKey);

    const teeAuthenticator = await new MockTeeAuthenticator__factory(signer).deploy(signer, "0x" + pubKey);
    await teeAuthenticator.waitForDeployment();
    
    authorityRegistry = await new AuthorityRegistry__factory(signer).deploy(signer, signer);
    await authorityRegistry.waitForDeployment();
    processorEndpoint = await new ProcessorEndpoint__factory(signer).deploy(teeAuthenticator, authorityRegistry, signer, signer, 0);
    await processorEndpoint.waitForDeployment();

    //bootstrap an application: submitDeployRequest then finalize via stateUpdate
    const deployTx = await processorEndpoint.submitDeployRequest(0, "0x00");
    const deployReceipt = await deployTx.wait();
    const iface = processorEndpoint.interface;
    let deployRequestId: string | undefined;
    for(const log of deployReceipt!.logs) {
      try {
        const parsed = iface.parseLog({topics: Array.from(log.topics), data: log.data});
        if(parsed?.name === "DeployRequestSubmitted") {
          applicationId = parsed.args.applicationId;
          deployRequestId = parsed.args.requestId;
          break;
        }
      } catch { continue; }
    }
    if(!deployRequestId) throw new Error("DeployRequestSubmitted not found");

    await processorEndpoint.stateUpdate(
      applicationId, BYTES32_ZERO, INITIAL_STATE_ROOT, deployRequestId,
      { events: [], subTypes: [] }, { events: [], subTypes: [] }, [], 0, 0, 0, "", "0x"
    );

    client = new VelaClient(signer, true, await teeAuthenticator.getAddress(), await processorEndpoint.getAddress());
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

  it("encryptForTee", async () => {
    const message = "Hello world!";
    const myPubKey = (await client.getSignerKeyPair()).publicKey;
    
    const data = stringToBytes(message);
    const encryptedData = await client.encryptForTee(data);
    const decryptedData = await decrypt(teePubSecp.privateKey, myPubKey, encryptedData);

    assert.equal(bytesToString(decryptedData), message);
  });

  it("submitDeployRequest", async () => {
    const wasmSha256 = new Uint8Array(32);
    wasmSha256.fill(0xab);
    const receipt = await client.submitDeployRequestAndWaitForRequestId(0, BigInt(0), wasmSha256, {foo: "bar"});
    assert.notEqual(receipt.requestId, undefined);
    assert.notEqual(receipt.transactionReceipt, undefined);
  })

  it("submitRequest", async () => {
    const submitResponse = await client.submitRequestAndWaitForRequestId(0, applicationId, RequestType.PROCESS, Uint8Array.from([1, 2, 3]), ETH_TOKEN, BigInt(10), BigInt(0));
    assert.notEqual(submitResponse.requestId, undefined);
    assert.notEqual(submitResponse.transactionReceipt, undefined);
  })

  it("getPendingClaims", async () => {
    const signer = await provider.getSigner(0);
    const address = await signer.getAddress();
    const pending = await client.getPendingClaims(ETH_TOKEN, address);
    assert.equal(pending, BigInt(0));
  });

  it("claim", async () => {
    const signer = await provider.getSigner(0);
    const address = await signer.getAddress();
    const tx = await client.claim(ETH_TOKEN, address);
    const receipt = await tx.wait();
    assert.notEqual(receipt, undefined);
    assert.equal(receipt!.status, 1);
  });

  it("getCurrentUserEvents (just decrypting - without retrieving events)", async () => {
    //generate user key
    const userKeyPair = await deriveP521PrivateKeyFromSigner(await provider.getSigner(0), true);
    //generate another user key
    const otherUserKeyPair = await deriveP521PrivateKeyFromSigner(await provider.getSigner(1), true);
    //encrypt event
    const eventMessage = "Hello world!";
    const correctEncryptedData = await encrypt(teePubSecp.privateKey, userKeyPair.publicKey, stringToBytes(eventMessage));
    const incorrectEncryptedData = await encrypt(teePubSecp.privateKey, otherUserKeyPair.publicKey, stringToBytes(eventMessage));

    const correctEvent = createEvent(correctEncryptedData);
    const incorrectEvent = createEvent(incorrectEncryptedData);


    //retrieve and decrypt event
    let events = await client.decryptAndFilterEvents([correctEvent, correctEvent, incorrectEvent], (Uint8Array) => true, true); //stop at first
    assert.equal(events.length, 1);
    const decryptedMessage = bytesToString(events[0]);
    assert.equal(decryptedMessage, eventMessage);

    events = await client.decryptAndFilterEvents([incorrectEvent], (Uint8Array) => true, true); // only incorrect events
    assert.equal(events.length, 0);

    events = await client.decryptAndFilterEvents([correctEvent, correctEvent, incorrectEvent], (Uint8Array) => true, false); //not stop at first
    assert.equal(events.length, 2);

    events = await client.decryptAndFilterEvents([correctEvent, correctEvent, incorrectEvent], (Uint8Array) => false, false); //filter returns false
    assert.equal(events.length, 0);
  });

  function createEvent(encryptedData: Uint8Array): TypedEventLog<TypedContractEvent<UserEventEvent.InputTuple, UserEventEvent.OutputTuple, UserEventEvent.OutputObject>> {
    return {
      args: {
        applicationId: BigInt(0),
        eventSubType: "subtype1",
        encryptedData: bytesToHex(encryptedData),
      },
      blockHash: "",
      blockNumber: 0,
    } as any as TypedEventLog<TypedContractEvent<UserEventEvent.InputTuple, UserEventEvent.OutputTuple, UserEventEvent.OutputObject>>;
  }


});