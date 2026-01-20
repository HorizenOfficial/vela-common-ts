import { JsonRpcProvider } from "ethers";
import { expect } from "chai";
import { spawn, ChildProcess } from "child_process";
import kill from "tree-kill";

let hardhatNode: ChildProcess;
let provider: JsonRpcProvider;

const PRIV_KEYS = ["0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"]

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe("Hardhat integration", function () {
  this.timeout(20000);
  
  before(async () => {
    //launch node
    hardhatNode = spawn(
        "npx hardhat node --port 8545",
        { shell: true, stdio: "ignore", detached: true }
    );

    await wait(4000); //wait for node to start
    //connect provider
    provider = new JsonRpcProvider("http://127.0.0.1:8545");
    await provider.getBlockNumber();

    //deploy contracts
    
  });

  after(async () => {
    //kill node
    if (!hardhatNode || !hardhatNode.pid) return;
    kill(hardhatNode.pid, "SIGTERM", (err) => {});
  });

  // TESTS
  it("provider risponde", async () => {
    const block = await provider.getBlockNumber();
    expect(block).to.equal(0);
  });


});