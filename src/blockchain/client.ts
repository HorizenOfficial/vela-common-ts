import { Contract } from "ethers";
import { AuthorityRegistry } from "./abis/AuthorityRegistry";
import { ProcessorEndpoint } from "./abis/ProcessorEndpoint";
import { ITeeAuthenticator } from "./abis/ITeeAuthenticator";
import { TransactionReceipt } from "ethers";
import { Signer } from "ethers";

export enum RequestType {
  DEPLOYAPP = 0,
  PROCESS, 
  DEANONYMIZATION, 
  ASSOCIATEKEY
}

export class HorizenPESClient {
  private authRegistry: Contract;
  private teeAuthenticator: Contract;
  private processorEndpoint: Contract;
  private signer: Signer;

  constructor(signer: Signer, authRegistryAddress: string, teeAuthenticatorAddress: string, processorEndpointAddress: string) {
    this.signer = signer;
    this.authRegistry = new Contract(authRegistryAddress, AuthorityRegistry.abi, signer);
    this.teeAuthenticator = new Contract(teeAuthenticatorAddress, ITeeAuthenticator.abi, signer);
    this.processorEndpoint = new Contract(processorEndpointAddress, ProcessorEndpoint.abi, signer);
    
  }

  async submitRequest(protocolVersion: bigint, applicationId: bigint, requestType: RequestType, payload: Uint8Array, depositAmount: bigint, maxFeeValue: bigint): Promise<TransactionReceipt> {
    const tx = await this.processorEndpoint.submitRequest(
      protocolVersion,
      applicationId,
      requestType.valueOf(),
      payload,
      depositAmount,
      maxFeeValue
    );
    return tx;
  }

  async getTeePublicKey(): Promise<string> {
    return await this.teeAuthenticator.getPubSecp521r1();
  }

  async getCurrentUserEvents() {
    return await this.authRegistry.getUserEvents();
  }


}