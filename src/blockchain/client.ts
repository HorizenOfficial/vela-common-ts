import { AddressLike, ContractTransactionReceipt, ContractTransactionResponse } from "ethers";
import { Signer } from "ethers";
import { ITeeAuthenticator, ITeeAuthenticator__factory, ProcessorEndpoint, ProcessorEndpoint__factory } from "../typechain-types";
import { deriveP521PrivateKeyFromSigner } from "../crypto/wallet";
import { decrypt, encrypt, importPublicKeyFromHex, P521KeyPair } from "../crypto/p521";
import { hexToBytes } from "../crypto/utils";
import { TypedContractEvent, TypedEventLog } from "../typechain-types/common";
import { UserEventEvent } from "../typechain-types/contracts/ProcessorEndpoint";

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

export class RequestResult {
  constructor(
    public requestId: string,
    public status: bigint,
    public errorCode: bigint | undefined,
    public errorMessage: string | undefined,
  ) {}
}

export class VelaClient {
  private teeAuthenticator: ITeeAuthenticator;
  private processorEndpoint: ProcessorEndpoint;
  private signer: Signer;
  private useAlternativeSign: boolean;

  constructor(signer: Signer, useAlternativeSign: boolean, teeAuthenticatorAddress: string, processorEndpointAddress: string) {
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
      {value: depositAmount + maxFeeValue}
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

  async encryptForTee(data: Uint8Array): Promise<Uint8Array> {
    const teePublicKeyString = await this.getTeePublicKey();
    const teePublicKey = await importPublicKeyFromHex(teePublicKeyString);
    const privateKey = (await this.getSignerKeyPair()).privateKey;
    return await encrypt(privateKey, teePublicKey, data);
  }

  async getRequestCompletedEvent(requestId: string, fromBlock: number | undefined, toBlock: number | undefined): Promise<RequestResult | undefined> {
    if(fromBlock != undefined && toBlock != undefined && fromBlock < toBlock) {
      throw new Error("fromBlock cannot be less than toBlock");
    }
    //get RequestCompleted events from Processor Endpoint
    const events = await this.processorEndpoint.queryFilter(
      this.processorEndpoint.filters.RequestCompleted(requestId),
      toBlock,
      fromBlock
    );

    const validEvents = events.filter(e => !e.removed)

    if(validEvents.length === 0) {
      return undefined;
    }
    if(validEvents.length > 1) {
      throw new Error("Multiple RequestCompleted events found for the same requestId");
    }

    const event = validEvents[0];
    return new RequestResult(
      event.args.requestId,
      event.args.status,
      event.args.errorCode || undefined,
      event.args.errorMessage || undefined
    );
  };

  async getCurrentUserEvents(fromBlock: number | undefined, toBlock: number | undefined, applicationId: string, eventSubType: string | undefined, filter: (event: Uint8Array) => boolean, stopAtFirst: boolean): Promise<Uint8Array[]> {
    if(fromBlock != undefined && toBlock != undefined && fromBlock < toBlock) {
      throw new Error("fromBlock cannot be less than toBlock");
    }

    //get UserEvent events from Processor Endpoint
    const events = await this.processorEndpoint.queryFilter(
      this.processorEndpoint.filters.UserEvent(applicationId, undefined, eventSubType, undefined),
      toBlock,
      fromBlock
    );

    return await this.decryptAndFilterEvents(events, filter, stopAtFirst);
  }

  async getPendingPayments(address: AddressLike): Promise<bigint> {
    return await this.processorEndpoint.payments(address);
  }

  async withdrawPayments(payee: AddressLike): Promise<ContractTransactionResponse> {
    return await this.processorEndpoint.withdrawPayments(payee);
  }

  async decryptAndFilterEvents(events: TypedEventLog<TypedContractEvent<UserEventEvent.InputTuple, UserEventEvent.OutputTuple, UserEventEvent.OutputObject>>[], filter: (event: Uint8Array) => boolean, stopAtFirst: boolean): Promise<Uint8Array[]> {
    //recover decrypt key
    const teePublicKeyString = await this.getTeePublicKey();
    const teePublicKey = await importPublicKeyFromHex(teePublicKeyString);
    const privateKey = (await this.getSignerKeyPair()).privateKey;

    //decrypt and filter
    const returnEvents: Uint8Array[] = [];
    for(let i = events.length - 1; i >= 0; i--) {
      try {
        //attempt to decrypt
        const encryptedData = hexToBytes(events[i].args.encryptedData);
        const decryptedData = await decrypt(privateKey, teePublicKey, encryptedData);
        if (filter(decryptedData)) {
          returnEvents.push(decryptedData);
          if(stopAtFirst) return returnEvents;
        }
      } catch (e) {
        //not intended for this user
        continue;
      }
    }
    return returnEvents;
  }
}