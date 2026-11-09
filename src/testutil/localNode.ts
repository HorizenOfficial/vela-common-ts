import { JsonRpcProvider } from "ethers";
import type { JsonRpcServer } from "hardhat/types/network";

// Keys ganache derived from the seed "test test ... junk", kept so that
// signer-derived test vectors stay stable.
const ACCOUNTS = [
  "0x6253e7a56ee838a325bd0497ae5e58cace66792c5c9e23dea30b6dabcea95ec6",
  "0x6b02365789fde307f6026aef9208653d3e2f2e9f36e78783845a99989f794577",
].map((privateKey) => ({ privateKey, balance: "1000000000000000000000" }));

export interface LocalNode {
  provider: JsonRpcProvider;
  close(): Promise<void>;
}

// Starts an in-process Hardhat (EDR) JSON-RPC node at Cancun, the minimum hardfork Vela supports.
export async function startLocalNode(port: number): Promise<LocalNode> {
  // Dynamic import: mocha loads specs through tsx's CJS hook, and a static import would load
  // hardhat's plugin modules twice (HHE2 "Duplicated plugin id").
  const { createHardhatRuntimeEnvironment } = await import("hardhat/hre");
  const hre = await createHardhatRuntimeEnvironment({
    networks: {
      default: { type: "edr-simulated", chainType: "l1", hardfork: "cancun", accounts: ACCOUNTS },
    },
  });
  const server: JsonRpcServer = await hre.network.createServer("default", "127.0.0.1", port);
  await server.listen();
  const provider = new JsonRpcProvider(`http://127.0.0.1:${port}`);
  await provider.getBlockNumber();
  return {
    provider,
    async close() {
      provider.destroy();
      await server.close();
    },
  };
}
