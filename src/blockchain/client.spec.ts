import { JsonRpcProvider } from "ethers";
import ganache, { Server } from "ganache";
import assert from "assert";
import { HorizenPESClient, RequestType } from "../blockchain/client.js";
import { AuthorityRegistry__factory, MockTeeAuthenticator__factory, ProcessorEndpoint__factory } from "../typechain-types/index.js";

let server: Server;
let provider: JsonRpcProvider;
let client: HorizenPESClient;

const TEST_PUBSECP = "0x1234"
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

    //deploy contracts
    const signer = await provider.getSigner(0);
    const authorityRegistry = await new AuthorityRegistry__factory(signer).deploy(signer, signer);
    await authorityRegistry.waitForDeployment();
    const teeAuthenticator = await new MockTeeAuthenticator__factory(signer).deploy(signer, TEST_PUBSECP);
    await teeAuthenticator.waitForDeployment();
    const processorEndpoint = await new ProcessorEndpoint__factory(signer).deploy(teeAuthenticator, authorityRegistry, signer, signer, 0);
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
    assert.equal(publicKey, TEST_PUBSECP);
  })

  it("submitRequest", async () => {
    const submitRequestTx = await client.submitRequest(0, 1, RequestType.PROCESS, Uint8Array.from([1, 2, 3]), BigInt(10), BigInt(0));
    assert.notEqual(submitRequestTx, undefined);
    assert.notEqual(submitRequestTx.hash, undefined);

    const receipt = await submitRequestTx.wait();
    assert.notEqual(receipt, undefined);
  })



});