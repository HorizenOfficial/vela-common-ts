import { Contract } from "ethers";
import { AuthorityRegistry } from "./abis/AuthorityRegistry";
import { ProcessorEndpoint } from "./abis/ProcessorEndpoint";
import { ITeeAuthenticator } from "./abis/ITeeAuthenticator";

export class HorizenPESClient {
  private authRegistry: Contract;
  private teeAuthenticator: Contract;
  private processorEndpoint: Contract;

  constructor(authRegistryAddress: string, teeAuthenticatorAddress: string, processorEndpointAddress: string, signer: any) {
    this.authRegistry = new Contract(authRegistryAddress, AuthorityRegistry.abi, signer);
    this.teeAuthenticator = new Contract(teeAuthenticatorAddress, ITeeAuthenticator.abi, signer);
    this.processorEndpoint = new Contract(processorEndpointAddress, ProcessorEndpoint.abi, signer);
  }

}