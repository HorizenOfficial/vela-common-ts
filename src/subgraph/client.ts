import axios, { type AxiosInstance } from "axios";
import { type SubgraphClient, type RequestCompleted, type DeployRequestCompleted, type UserEvent, type AppEvent, type OnChainRefund, type OnChainWithdrawal, type ClaimExecuted } from "./types";
import { hexToBytes } from "../crypto/utils";

interface GraphError {
  message: string;
}

interface GraphResponse<T> {
  data: T;
  errors?: GraphError[];
}

// ---------- internal response shapes ----------

interface HealthCheckData {
  _meta: { hasIndexingErrors: boolean } | null;
}

interface RequestCompletedEntity {
  applicationId: string;
  requestId: string;
  status: string;
  errorCode: string;
  errorMessage: string;
  applicationFees: string;
  blockNumber: string;
}

interface RequestCompletedData {
  requestCompleteds: RequestCompletedEntity[];
}

interface DeployRequestCompletedEntity {
  applicationId: string;
  requestId: string;
  status: string;
  errorCode: string;
  errorMessage: string;
  applicationFees: string;
  blockNumber: string;
}

interface DeployRequestCompletedData {
  deployRequestCompleteds: DeployRequestCompletedEntity[];
}

interface RefundEntity {
  applicationId: string;
  requestId: string;
  to: string;
  tokenAddress: string;
  amount: string;
  blockNumber: string;
}

interface WithdrawalEntity {
  applicationId: string;
  requestId: string;
  to: string;
  tokenAddress: string;
  amount: string;
  blockNumber: string;
}

interface ClaimEntity {
  tokenAddress: string;
  payee: string;
  amount: string;
  blockNumber: string;
}

interface UserEventEntity {
  applicationId: string;
  requestId: string;
  eventSubType: string;
  encryptedData: string;
  blockNumber: string;
  logIndex: string;
  sortKey: string;
}

interface UserEventData {
  userEvents: UserEventEntity[];
}

interface AppEventEntity {
  applicationId: string;
  requestId: string;
  eventSubType: string;
  data: string;
  blockNumber: string;
  logIndex: string;
  sortKey: string;
}

interface AppEventData {
  appEvents: AppEventEntity[];
}

// ---------- client implementation ----------

export class SubgraphClientImpl implements SubgraphClient {
  private httpClient: AxiosInstance;

  constructor(
    private endpoint: string,
    timeoutMs = 10_000,
  ) {
    this.httpClient = axios.create({
      timeout: timeoutMs,
      headers: { "Content-Type": "application/json" },
    });
  }

  async healthCheck(): Promise<void> {
    const query = `
query HealthCheck {
  _meta {
    hasIndexingErrors
  }
}`;

    const resp = await this.doGraphQL<HealthCheckData>(query, {});
    if (resp.errors?.length) {
      throw new Error(`subgraph returned errors: ${resp.errors[0].message}`);
    }
    if (!resp.data._meta) {
      throw new Error("subgraph health check returned empty meta");
    }
    if (resp.data._meta.hasIndexingErrors) {
      throw new Error("subgraph reports indexing errors");
    }
  }

  async getRequestCompletedByID(requestId: string): Promise<RequestCompleted | null> {
    const query = `
query($requestId: Bytes!) {
  requestCompleteds(where: { requestId: $requestId }, first: 1) {
    applicationId
    requestId
    status
    errorCode
    errorMessage
    applicationFees
    blockNumber
  }
}`;

    const hexId = requestId.startsWith("0x") ? requestId : `0x${requestId}`;
    const resp = await this.doGraphQL<RequestCompletedData>(query, { requestId: hexId });

    if (resp.errors?.length) {
      throw new Error(`subgraph returned errors: ${resp.errors[0].message}`);
    }
    if (resp.data.requestCompleteds.length === 0) {
      return null;
    }

    const entity = resp.data.requestCompleteds[0];
    return {
      applicationId: BigInt(entity.applicationId),
      requestId: entity.requestId,
      status: Number(entity.status),
      errorCode: Number(entity.errorCode),
      errorMessage: entity.errorMessage,
      applicationFees: BigInt(entity.applicationFees),
      blockNumber: Number(entity.blockNumber),
    };
  }

  async getDeployRequestCompleted(applicationId: bigint | undefined, requestId: string | undefined): Promise<DeployRequestCompleted | null> {
    if (applicationId == undefined && requestId == undefined) {
      throw new Error("At least one of applicationId or requestId must be provided");
    }

    const variables: Record<string, unknown> = {};
    let varDefs = "";
    const whereParts: string[] = [];

    if (applicationId != undefined) {
      varDefs += "$applicationId: BigInt!";
      variables.applicationId = applicationId.toString();
      whereParts.push("applicationId: $applicationId");
    }
    if (requestId != undefined) {
      if (varDefs) varDefs += ", ";
      varDefs += "$requestId: Bytes!";
      variables.requestId = requestId.startsWith("0x") ? requestId : `0x${requestId}`;
      whereParts.push("requestId: $requestId");
    }

    const query = `
query(${varDefs}) {
  deployRequestCompleteds(where: { ${whereParts.join(", ")} }, first: 1, orderBy: blockNumber, orderDirection: desc) {
    applicationId
    requestId
    applicationFees
    status
    errorCode
    errorMessage
    blockNumber
  }
}`;

    const resp = await this.doGraphQL<DeployRequestCompletedData>(query, variables);

    if (resp.errors?.length) {
      throw new Error(`subgraph returned errors: ${resp.errors[0].message}`);
    }
    if (resp.data.deployRequestCompleteds.length === 0) {
      return null;
    }

    const entity = resp.data.deployRequestCompleteds[0];
    return {
      applicationId: BigInt(entity.applicationId),
      requestId: entity.requestId,
      applicationFees: BigInt(entity.applicationFees),
      status: Number(entity.status),
      errorCode: Number(entity.errorCode),
      errorMessage: entity.errorMessage,
      blockNumber: Number(entity.blockNumber),
    };
  }

  async getUserEvents(
    applicationId: bigint,
    requestId: string | undefined,
    eventSubType: string | string[],
    limit: number,
    before?: bigint,
  ): Promise<UserEvent[]> {
    if (limit <= 0) limit = 10;
    if (limit > 1000) limit = 1000;

    const variables: Record<string, unknown> = {
      applicationId: String(applicationId),
      limit,
    };

    let varDefs = "";
    const whereParts = ["applicationId: $applicationId"];

    if (Array.isArray(eventSubType)) {
      if (eventSubType.length > 0) {
        varDefs += ", $eventSubTypes: [Bytes!]!";
        variables.eventSubTypes = eventSubType;
        whereParts.push("eventSubType_in: $eventSubTypes");
      }
    } else if (eventSubType.trim()) {
      varDefs += ", $eventSubType: Bytes!";
      variables.eventSubType = eventSubType;
      whereParts.push("eventSubType: $eventSubType");
    }
    if (before != null) {
      varDefs += ", $before: BigInt!";
      variables.before = before.toString();
      whereParts.push("sortKey_lt: $before");
    }
    if (requestId != undefined) {
      varDefs += ", $requestId: Bytes!";
      variables.requestId = requestId.startsWith("0x") ? requestId : `0x${requestId}`;
      whereParts.push("requestId: $requestId");
    }

    const query = `
query($applicationId: BigInt!, $limit: Int!${varDefs}) {
  userEvents(
    where: { ${whereParts.join(", ")} }
    orderBy: sortKey
    orderDirection: desc
    first: $limit
  ) {
    applicationId
    requestId
    eventSubType
    encryptedData
    blockNumber
    logIndex
    sortKey
  }
}`;

    const resp = await this.doGraphQL<UserEventData>(query, variables);
    if (resp.errors?.length) {
      throw new Error(`subgraph returned errors: ${resp.errors[0].message}`);
    }

    return resp.data.userEvents.map((entity) => ({
      applicationId,
      requestId: entity.requestId,
      eventSubType: entity.eventSubType,
      encryptedData: entity.encryptedData ? hexToBytes(entity.encryptedData) : new Uint8Array(0),
      blockNumber: Number(entity.blockNumber),
      logIndex: Number(entity.logIndex),
      sortKey: BigInt(entity.sortKey),
    }));
  }

  async getAppEvents(
    applicationId: bigint,
    requestId: string | undefined,
    eventSubType: string | string[],
    limit: number,
    before?: bigint,
  ): Promise<AppEvent[]> {
    if (limit <= 0) limit = 10;
    if (limit > 1000) limit = 1000;

    const variables: Record<string, unknown> = {
      applicationId: String(applicationId),
      limit,
    };

    let varDefs = "";
    const whereParts = ["applicationId: $applicationId"];

    if (Array.isArray(eventSubType)) {
      if (eventSubType.length > 0) {
        varDefs += ", $eventSubTypes: [Bytes!]!";
        variables.eventSubTypes = eventSubType;
        whereParts.push("eventSubType_in: $eventSubTypes");
      }
    } else if (eventSubType.trim()) {
      varDefs += ", $eventSubType: Bytes!";
      variables.eventSubType = eventSubType;
      whereParts.push("eventSubType: $eventSubType");
    }
    if (before != null) {
      varDefs += ", $before: BigInt!";
      variables.before = before.toString();
      whereParts.push("sortKey_lt: $before");
    }
    if (requestId != undefined) {
      varDefs += ", $requestId: Bytes!";
      variables.requestId = requestId.startsWith("0x") ? requestId : `0x${requestId}`;
      whereParts.push("requestId: $requestId");
    }

    const query = `
query($applicationId: BigInt!, $limit: Int!${varDefs}) {
  appEvents(
    where: { ${whereParts.join(", ")} }
    orderBy: sortKey
    orderDirection: desc
    first: $limit
  ) {
    applicationId
    requestId
    eventSubType
    data
    blockNumber
    logIndex
    sortKey
  }
}`;

    const resp = await this.doGraphQL<AppEventData>(query, variables);
    if (resp.errors?.length) {
      throw new Error(`subgraph returned errors: ${resp.errors[0].message}`);
    }

    return resp.data.appEvents.map((entity) => ({
      applicationId,
      requestId: entity.requestId,
      eventSubType: entity.eventSubType,
      data: entity.data ? hexToBytes(entity.data) : new Uint8Array(0),
      blockNumber: Number(entity.blockNumber),
      logIndex: Number(entity.logIndex),
      sortKey: BigInt(entity.sortKey),
    }));
  }

  async getRefunds(applicationId: bigint, requestId: string | undefined, limit: number): Promise<OnChainRefund[]> {
    if (limit <= 0) limit = 100;

    const variables: Record<string, unknown> = {
      appId: applicationId.toString(),
      first: limit,
    };

    let extraVarDefs = "";
    let where = "applicationId: $appId";
    if (requestId != undefined) {
      extraVarDefs = ", $reqId: Bytes!";
      variables.reqId = requestId.startsWith("0x") ? requestId : `0x${requestId}`;
      where += ", requestId: $reqId";
    }

    const query = `
query($appId: BigInt!, $first: Int!${extraVarDefs}) {
  onChainRefunds(first: $first, where: {${where}}, orderBy: blockNumber, orderDirection: desc) {
    applicationId requestId to tokenAddress amount blockNumber
  }
}`;

    type Response = { onChainRefunds: RefundEntity[] };
    const resp = await this.doGraphQL<Response>(query, variables);
    if (resp.errors?.length) {
      throw new Error(`subgraph returned errors: ${resp.errors[0].message}`);
    }

    return resp.data.onChainRefunds.map((e) => ({
      applicationId: BigInt(e.applicationId),
      requestId: e.requestId,
      to: e.to,
      tokenAddress: e.tokenAddress,
      amount: BigInt(e.amount),
      blockNumber: Number(e.blockNumber),
    }));
  }

  async getWithdrawals(applicationId: bigint, requestId: string | undefined, limit: number): Promise<OnChainWithdrawal[]> {
    if (limit <= 0) limit = 100;

    const variables: Record<string, unknown> = {
      appId: applicationId.toString(),
      first: limit,
    };

    let extraVarDefs = "";
    let where = "applicationId: $appId";
    if (requestId != undefined) {
      extraVarDefs = ", $reqId: Bytes!";
      variables.reqId = requestId.startsWith("0x") ? requestId : `0x${requestId}`;
      where += ", requestId: $reqId";
    }

    const query = `
query($appId: BigInt!, $first: Int!${extraVarDefs}) {
  onChainWithdrawals(first: $first, where: {${where}}, orderBy: blockNumber, orderDirection: desc) {
    applicationId requestId to tokenAddress amount blockNumber
  }
}`;

    type Response = { onChainWithdrawals: WithdrawalEntity[] };
    const resp = await this.doGraphQL<Response>(query, variables);
    if (resp.errors?.length) {
      throw new Error(`subgraph returned errors: ${resp.errors[0].message}`);
    }

    return resp.data.onChainWithdrawals.map((e) => ({
      applicationId: BigInt(e.applicationId),
      requestId: e.requestId,
      to: e.to,
      tokenAddress: e.tokenAddress,
      amount: BigInt(e.amount),
      blockNumber: Number(e.blockNumber),
    }));
  }

  async getClaimsExecuted(payee: string, tokenAddress: string | undefined, limit: number): Promise<ClaimExecuted[]> {
    if (limit <= 0) limit = 100;

    const variables: Record<string, unknown> = {
      payee: payee.toLowerCase(),
      first: limit,
    };

    let extraVarDefs = "";
    let where = "payee: $payee";
    if (tokenAddress != undefined) {
      extraVarDefs = ", $token: Bytes!";
      variables.token = tokenAddress.toLowerCase();
      where += ", tokenAddress: $token";
    }

    const query = `
query($payee: Bytes!, $first: Int!${extraVarDefs}) {
  claimExecuteds(first: $first, where: {${where}}, orderBy: blockNumber, orderDirection: desc) {
    tokenAddress payee amount blockNumber
  }
}`;

    type Response = { claimExecuteds: ClaimEntity[] };
    const resp = await this.doGraphQL<Response>(query, variables);
    if (resp.errors?.length) {
      throw new Error(`subgraph returned errors: ${resp.errors[0].message}`);
    }

    return resp.data.claimExecuteds.map((e) => ({
      tokenAddress: e.tokenAddress,
      payee: e.payee,
      amount: BigInt(e.amount),
      blockNumber: Number(e.blockNumber),
    }));
  }

  private async doGraphQL<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<GraphResponse<T>> {
    const res = await this.httpClient.post<GraphResponse<T>>(this.endpoint, {
      query,
      variables,
    });
    return res.data;
  }
}

/** Creates a SubgraphClient pointing to the given endpoint. */
export function createSubgraphClient(endpoint: string, timeoutMs = 10_000): SubgraphClient {
  return new SubgraphClientImpl(endpoint, timeoutMs);
}
