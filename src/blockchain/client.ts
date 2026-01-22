import { ContractTransactionReceipt, ContractTransactionResponse } from "ethers";
import { Signer } from "ethers";
import { ITeeAuthenticator, ITeeAuthenticator__factory, ProcessorEndpoint, ProcessorEndpoint__factory } from "../typechain-types";
import { deriveP521PrivateKeyFromSigner } from "../crypto/wallet";
import { decrypt, importPublicKeyFromHex, P521KeyPair } from "../crypto/p521";
import { stringToBytes } from "../crypto/utils";

export enum RequestType {
  DEPLOYAPP = 0,
  PROCESS, 
  DEANONYMIZATION, 
  ASSOCIATEKEY
}

export class RequestReceipt {
  constructor(
    public requestId: string, 
    public transactionReceipt: ContractTransactionReceipt
  ) {}
}

export class HorizenPESClient {
  private teeAuthenticator: ITeeAuthenticator;
  private processorEndpoint: ProcessorEndpoint;
  private signer: Signer;
  private useAlternativeSign: boolean;

  constructor(signer: Signer, useAlternativeSign: boolean, authRegistryAddress: string, teeAuthenticatorAddress: string, processorEndpointAddress: string) {
    this.signer = signer;
    this.useAlternativeSign = useAlternativeSign;
    this.teeAuthenticator = ITeeAuthenticator__factory.connect(teeAuthenticatorAddress, signer);
    this.processorEndpoint = ProcessorEndpoint__factory.connect(processorEndpointAddress, signer);
    
  }

  async getSignerKeyPair(): Promise<P521KeyPair> {
    return await deriveP521PrivateKeyFromSigner(this.signer, this.useAlternativeSign);
  }

  async submitRequest(protocolVersion: number, applicationId: number, requestType: RequestType, payload: Uint8Array, depositAmount: bigint, maxFeeValue: bigint): Promise<ContractTransactionResponse> {
    const tx = await this.processorEndpoint.submitRequest(
      protocolVersion,
      applicationId,
      requestType.valueOf(),
      payload,
      depositAmount,
      maxFeeValue,
      {value: depositAmount}
    );
    return tx;
  }

  async submitRequestAndWaitForRequestId(protocolVersion: number, applicationId: number, requestType: RequestType, payload: Uint8Array, depositAmount: bigint, maxFeeValue: bigint): Promise<RequestReceipt> {
    const tx = await this.submitRequest(protocolVersion, applicationId, requestType, payload, depositAmount, maxFeeValue);
    //get request id from event
    const receipt = await tx.wait();
    const events = receipt?.logs;
    const requestId = events && events.length > 0 ? events[0].topics[1] : undefined;
    if(!requestId) {
      throw new Error("Request ID not found in transaction events");
    }
    return new RequestReceipt(requestId, receipt!);
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

    //get UserEvent events from Processor Endpoint
    const events = await this.processorEndpoint.queryFilter(
      this.processorEndpoint.filters.UserEvent(eventSubType),
      toBlock,
      fromBlock
    );

    return await this.decryptAndFilterEvents(events.map(e => stringToBytes(e.args.encryptedData)), eventSubType, filter, stopAtFirst);
  }

  async decryptAndFilterEvents(encryptedDatas: Uint8Array[], eventSubType: string | undefined,filter: (event: Uint8Array) => boolean, stopAtFirst: boolean): Promise<Uint8Array[]> {
    //recover decrypt key
    const teePublicKeyString = await this.getTeePublicKey();
    const teePublicKey = await importPublicKeyFromHex(teePublicKeyString);
    const privateKey = (await this.getSignerKeyPair()).privateKey;

    //decrypt and filter
    const returnEvents: Uint8Array[] = [];
    for(let i = encryptedDatas.length - 1; i >= 0; i--) {
      const event = encryptedDatas[i];
      const decryptedData: Uint8Array = await decrypt(privateKey, teePublicKey, stringToBytes(event.toString()));
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