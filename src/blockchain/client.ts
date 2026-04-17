import { ContractTransactionReceipt, ContractTransactionResponse } from "ethers";
import { Signer } from "ethers";
import { ITeeAuthenticator, ITeeAuthenticator__factory, ProcessorEndpoint, ProcessorEndpoint__factory } from "../typechain-types";
import { IERC20__factory } from "../typechain-types/factories/@openzeppelin/contracts/token/ERC20/IERC20__factory";
import { deriveP521PrivateKeyFromSigner } from "../crypto/wallet";
import { decrypt, encrypt, importPublicKeyFromHex, P521KeyPair } from "../crypto/p521";
import { bytesToHex, hexToBytes, stringToBytes } from "../crypto/utils";
import { TypedContractEvent, TypedEventLog } from "../typechain-types/common";
import { UserEventEvent, AppEventEvent } from "../typechain-types/contracts/ProcessorEndpoint";
import { ETH_TOKEN } from "../constants";

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
    public applicationId: bigint,
    public applicationFees: bigint,
    public status: bigint,
    public errorCode: bigint | undefined,
    public errorMessage: string | undefined,
  ) {}
}

const DEPLOY_MODE_ARTIFACT_REF = "artifact_ref";

interface DeployDescriptor {
  mode: string;
  artifactId: string;
  wasmSha256: string;
  constructorParams?: unknown;
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

  async submitRequest(protocolVersion: number, applicationId: bigint, requestType: RequestType, payload: Uint8Array, tokenAddress: string, assetAmount: bigint, maxFeeValue: bigint): Promise<ContractTransactionResponse> {
    // For ETH deposits msg.value covers both fee and asset; for ERC-20 deposits the asset is
    // pulled via transferFrom and msg.value carries only the fee (caller must pre-approve).
    const isEth = tokenAddress === ETH_TOKEN;
    const value = isEth ? assetAmount + maxFeeValue : maxFeeValue;
    const tx = await this.processorEndpoint.submitRequest(
      protocolVersion,
      applicationId,
      requestType.valueOf(),
      payload,
      tokenAddress,
      assetAmount,
      maxFeeValue,
      {value}
    );
    return tx;
  }

  async submitRequestAndWaitForRequestId(protocolVersion: number, applicationId: bigint, requestType: RequestType, payload: Uint8Array, tokenAddress: string, assetAmount: bigint, maxFeeValue: bigint): Promise<RequestReceipt> {
    const tx = await this.submitRequest(protocolVersion, applicationId, requestType, payload, tokenAddress, assetAmount, maxFeeValue);
    const receipt = await tx.wait();
    if(!receipt) {
      throw new Error("Transaction receipt not available");
    }
    //find the RequestSubmitted event and read its requestId arg
    const iface = this.processorEndpoint.interface;
    for(const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({topics: Array.from(log.topics), data: log.data});
        if(parsed?.name === "RequestSubmitted") {
          return new RequestReceipt(parsed.args.requestId as string, receipt);
        }
      } catch {
        continue;
      }
    }
    throw new Error("RequestSubmitted event not found in transaction receipt");
  }

  async submitDeployRequest(protocolVersion: number, maxFeeValue: bigint, wasmSha256: Uint8Array, constructorParams?: unknown): Promise<ContractTransactionResponse> {
    const payload = this.buildDeployPayload(wasmSha256, constructorParams);
    return await this.processorEndpoint.submitDeployRequest(
      protocolVersion,
      payload,
      {value: maxFeeValue}
    );
  }

  async submitDeployRequestAndWaitForRequestId(protocolVersion: number, maxFeeValue: bigint, wasmSha256: Uint8Array, constructorParams?: unknown): Promise<RequestReceipt> {
    const tx = await this.submitDeployRequest(protocolVersion, maxFeeValue, wasmSha256, constructorParams);
    const receipt = await tx.wait();
    if(!receipt) {
      throw new Error("Transaction receipt not available");
    }
    //find the DeployRequestSubmitted event and read its requestId arg (not indexed — in log data)
    const iface = this.processorEndpoint.interface;
    for(const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({topics: Array.from(log.topics), data: log.data});
        if(parsed?.name === "DeployRequestSubmitted") {
          return new RequestReceipt(parsed.args.requestId as string, receipt);
        }
      } catch {
        continue;
      }
    }
    throw new Error("DeployRequestSubmitted event not found in transaction receipt");
  }

  private buildDeployPayload(wasmSha256: Uint8Array, constructorParams?: unknown): Uint8Array {
    const sha256Hex = bytesToHex(wasmSha256);
    const descriptor: DeployDescriptor = {
      mode: DEPLOY_MODE_ARTIFACT_REF,
      artifactId: "sha256:" + sha256Hex,
      wasmSha256: sha256Hex,
    };
    if (constructorParams !== undefined) {
      descriptor.constructorParams = constructorParams;
    }
    return stringToBytes(JSON.stringify(descriptor));
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
    //get RequestCompleted events from Processor Endpoint.
    //RequestCompleted(uint64 indexed applicationId, bytes32 indexed requestId, ...) — requestId is the second indexed topic.
    const events = await this.processorEndpoint.queryFilter(
      this.processorEndpoint.filters.RequestCompleted(undefined, requestId),
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
      event.args.applicationId,
      event.args.applicationFees,
      event.args.status,
      event.args.errorCode || undefined,
      event.args.errorMessage || undefined
    );
  };

  async getDeployRequestCompletedEvent(applicationId: bigint | undefined, requestId: string | undefined, fromBlock: number | undefined, toBlock: number | undefined): Promise<RequestResult | undefined> {
    if(applicationId == undefined && requestId == undefined) {
      throw new Error("At least one of applicationId or requestId must be provided");
    }
    if(fromBlock != undefined && toBlock != undefined && fromBlock < toBlock) {
      throw new Error("fromBlock cannot be less than toBlock");
    }
    //DeployRequestCompleted(uint64 indexed applicationId, bytes32 indexed requestId, ...) — same indexed layout as RequestCompleted.
    const events = await this.processorEndpoint.queryFilter(
      this.processorEndpoint.filters.DeployRequestCompleted(applicationId ?? undefined, requestId ?? undefined),
      toBlock,
      fromBlock
    );

    const validEvents = events.filter(e => !e.removed);

    if(validEvents.length === 0) {
      return undefined;
    }
    if(validEvents.length > 1) {
      throw new Error("Multiple DeployRequestCompleted events found");
    }

    const event = validEvents[0];
    return new RequestResult(
      event.args.requestId,
      event.args.applicationId,
      event.args.applicationFees,
      event.args.status,
      event.args.errorCode || undefined,
      event.args.errorMessage || undefined
    );
  };

  async getCurrentUserEvents(fromBlock: number | undefined, toBlock: number | undefined, applicationId: string, eventSubType: string | undefined, filter: (event: Uint8Array) => boolean, stopAtFirst: boolean): Promise<Uint8Array[]> {
    // eventSubType must be a bytes32 hex value (use ethers.encodeBytes32String() to convert from a readable string)
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

  async getAppEvents(fromBlock: number | undefined, toBlock: number | undefined, applicationId: string, requestId: string | undefined, eventSubType: string | undefined): Promise<{ requestId: string; eventSubType: string; data: Uint8Array }[]> {
    // eventSubType must be a bytes32 hex value (use ethers.encodeBytes32String() to convert from a readable string)
    if(fromBlock != undefined && toBlock != undefined && fromBlock < toBlock) {
      throw new Error("fromBlock cannot be less than toBlock");
    }

    const events = await this.processorEndpoint.queryFilter(
      this.processorEndpoint.filters.AppEvent(applicationId, requestId ?? undefined, eventSubType, undefined),
      toBlock,
      fromBlock
    );

    return events
      .filter(e => !e.removed)
      .map(e => ({
        requestId: e.args.requestId,
        eventSubType: e.args.eventSubType,
        data: hexToBytes(e.args.data),
      }));
  }

  async approveToken(tokenAddress: string, amount: bigint): Promise<ContractTransactionResponse> {
    if(tokenAddress === ETH_TOKEN) {
      throw new Error("Cannot approve ETH token address");
    }
    const token = IERC20__factory.connect(tokenAddress, this.signer);
    return await token.approve(await this.processorEndpoint.getAddress(), amount);
  }

  async getPendingClaims(tokenAddress: string, payee: string): Promise<bigint> {
    return await this.processorEndpoint.pendingClaims(tokenAddress, payee);
  }

  async claim(tokenAddress: string, payee: string): Promise<ContractTransactionResponse> {
    return await this.processorEndpoint.claim(tokenAddress, payee);
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