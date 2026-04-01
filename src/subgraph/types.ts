/**
 * SubgraphClient defines the subgraph operations used by the services.
 */
export interface SubgraphClient {
  healthCheck(): Promise<void>;
  getRequestCompletedByID(requestId: string): Promise<RequestCompleted | null>;
  getUserEvents(
    applicationId: number,
    eventSubType: string | string[],
    limit: number,
    before?: bigint,
  ): Promise<UserEvent[]>;
}

/** Projection returned by the subgraph for completed requests. */
export interface RequestCompleted {
  requestId: string;
  status: number;
  errorCode: number;
  errorMessage: string;
  applicationFees: bigint;
  blockNumber: number;
}

/** Projection returned by the subgraph for user events. */
export interface UserEvent {
  applicationId: number;
  requestId: string;
  eventSubType: string;
  encryptedData: Uint8Array;
  blockNumber: number;
  logIndex: number;
  sortKey: bigint;
}
