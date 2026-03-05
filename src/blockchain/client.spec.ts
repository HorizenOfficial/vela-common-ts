import { JsonRpcProvider } from "ethers";
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

const NODE_PORT = 9545

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

  it("submitRequest", async () => {
    const submitResponse = await client.submitRequestAndWaitForRequestId(0, 1, RequestType.PROCESS, Uint8Array.from([1, 2, 3]), BigInt(10), BigInt(0));
    assert.notEqual(submitResponse.requestId, undefined);
    assert.notEqual(submitResponse.transactionReceipt, undefined);
  })

  it("getPendingPayments", async () => {
    const signer = await provider.getSigner(0);
    const address = await signer.getAddress();
    const pending = await client.getPendingPayments(address);
    assert.equal(pending, BigInt(0));
  });

  it("withdrawPayments", async () => {
    const signer = await provider.getSigner(0);
    const address = await signer.getAddress();
    const tx = await client.withdrawPayments(address);
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