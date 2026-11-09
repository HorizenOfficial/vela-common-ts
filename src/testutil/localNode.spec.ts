import assert from "assert";
import { LocalNode, startLocalNode } from "./localNode";

describe("startLocalNode", function () {
  this.timeout(20000);
  let node: LocalNode;

  before(async () => {
    node = await startLocalNode(9545);
  });

  after(async () => {
    await node.close();
  });

  // Cancun is the minimum hardfork Vela supports, so tests must run there.
  it("runs at the Cancun hardfork", async () => {
    const block = await node.provider.send("eth_getBlockByNumber", ["latest", false]);
    assert.ok("blobGasUsed" in block, "pre-Cancun block (no blobGasUsed)");
    assert.ok(!("requestsHash" in block), "post-Cancun block (has Prague's requestsHash)");
  });
});
