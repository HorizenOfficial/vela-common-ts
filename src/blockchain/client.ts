import { Contract, ContractTransactionResponse } from "ethers";
import { TransactionReceipt } from "ethers";
import { Signer } from "ethers";
import { AuthorityRegistry, AuthorityRegistry__factory, ITeeAuthenticator, ITeeAuthenticator__factory, ProcessorEndpoint, ProcessorEndpoint__factory } from "../typechain-types";
import { deriveP521PrivateKeyFromSigner } from "../crypto/utils";

export enum RequestType {
  DEPLOYAPP = 0,
  PROCESS, 
  DEANONYMIZATION, 
  ASSOCIATEKEY
}

export class HorizenPESClient {
  private authRegistry: AuthorityRegistry;
  private teeAuthenticator: ITeeAuthenticator;
  private processorEndpoint: ProcessorEndpoint;
  private signer: Signer;

  constructor(signer: Signer, authRegistryAddress: string, teeAuthenticatorAddress: string, processorEndpointAddress: string) {
    this.signer = signer;
    this.authRegistry = AuthorityRegistry__factory.connect(authRegistryAddress, signer);
    this.teeAuthenticator = ITeeAuthenticator__factory.connect(teeAuthenticatorAddress, signer);
    this.processorEndpoint = ProcessorEndpoint__factory.connect(processorEndpointAddress, signer);
    
  }

  async submitRequest(protocolVersion: bigint, applicationId: bigint, requestType: RequestType, payload: Uint8Array, depositAmount: bigint, maxFeeValue: bigint): Promise<ContractTransactionResponse> {
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

  async getCurrentUserEvents(fromBlock: number | undefined, toBlock: number | undefined, eventSubType: string | undefined, filter: (event: Uint8Array) => boolean, stopAtFirst: boolean): Promise<Uint8Array[]> {
    if (fromBlock == undefined) {
      //get chain last block
      const latestBlock = await this.signer.provider!.getBlock("latest");
      fromBlock = latestBlock ? latestBlock.number : 0;
    }
    if(toBlock == undefined) {
      toBlock = 0; 
    }

    if(fromBlock < toBlock) {
      throw new Error("fromBlock cannot be less than toBlock");
    }

    //recover decrypt key
    const teePublicKey = await this.getTeePublicKey();
    const privateKey = await deriveP521PrivateKeyFromSigner(this.signer);

    //get UserEvent events from Processor Endpoint
    const events = await this.processorEndpoint.queryFilter(
      this.processorEndpoint.filters.UserEvent(eventSubType),
      fromBlock,
      toBlock
    );

    //decrypt and filter
    const returnEvents: Uint8Array[] = [];
    for (const event of events) {
      const decryptedData: Uint8Array = new Uint8Array(); // TODO decrypt
      if (filter(decryptedData)) {
        returnEvents.push(decryptedData);
      }

      if(returnEvents.length > 0 && stopAtFirst) {
        return returnEvents;
      }
    }
    return returnEvents;
  }
}