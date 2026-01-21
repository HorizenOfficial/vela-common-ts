import { JsonRpcProvider } from "ethers";
import assert from "assert";
import { spawn, ChildProcess } from "child_process";
import kill from "tree-kill";
import { HorizenPESClient } from "./client.js";
import { AuthorityRegistry__factory, MockTeeAuthenticator__factory, ProcessorEndpoint__factory } from "../typechain-types/index.js";

let hardhatNode: ChildProcess;
let provider: JsonRpcProvider;
let client: HorizenPESClient;


//const PRIV_KEYS = ["0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"]
const TEST_PUBSECP = "0x"

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe("Hardhat integration", function () {
  this.timeout(20000);
  
  before(async () => {
    //launch node
    hardhatNode = spawn(
        "npx hardhat node --port 9545",
        { shell: true, stdio: "ignore", detached: true }
    );

    await wait(4000); //wait for node to start
    //connect provider
    provider = new JsonRpcProvider("http://127.0.0.1:9545");
    await provider.getBlockNumber();

    //deploy contracts
    const signer = await provider.getSigner(0);
    const authorityRegistry = await new AuthorityRegistry__factory(signer).deploy(signer, signer);
    await authorityRegistry.waitForDeployment();
    const teeAuthenticator = await new MockTeeAuthenticator__factory(signer).deploy(signer, TEST_PUBSECP);
    await teeAuthenticator.waitForDeployment();
    const processorEndpoint = await new ProcessorEndpoint__factory(signer).deploy(teeAuthenticator, authorityRegistry, signer, signer, 0);
    await processorEndpoint.waitForDeployment();

    client = new HorizenPESClient(signer, await authorityRegistry.getAddress(), await teeAuthenticator.getAddress(), await processorEndpoint.getAddress());
  });

  after(async () => {
    //kill node
    if (!hardhatNode || !hardhatNode.pid) return;
    kill(hardhatNode.pid, "SIGTERM", (err) => {});
  });

  // TESTS
  it("provider risponde", async () => {
    const block = await provider.getBlockNumber();
    assert.equal(block >= 0, true);
  });


});