import axios, { type AxiosInstance } from "axios";
import { type SubgraphClient, type RequestCompleted, type UserEvent } from "./types";
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
      requestId: entity.requestId,
      status: Number(entity.status),
      errorCode: Number(entity.errorCode),
      errorMessage: entity.errorMessage,
      applicationFees: BigInt(entity.applicationFees),
      blockNumber: Number(entity.blockNumber),
    };
  }

  async getUserEvents(
    applicationId: number,
    eventSubType: string,
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

    if (eventSubType.trim()) {
      varDefs += ", $eventSubType: Bytes!";
      variables.eventSubType = eventSubType;
      whereParts.push("eventSubType: $eventSubType");
    }
    if (before != null) {
      varDefs += ", $before: BigInt!";
      variables.before = before.toString();
      whereParts.push("sortKey_lt: $before");
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
