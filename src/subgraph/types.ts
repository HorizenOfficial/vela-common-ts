/**
 * SubgraphClient defines the subgraph operations used by the services.
 */
export interface SubgraphClient {
  healthCheck(): Promise<void>;
  getRequestCompletedByID(requestId: string): Promise<RequestCompleted | null>;
  getDeployRequestCompleted(applicationId: bigint | undefined, requestId: string | undefined): Promise<DeployRequestCompleted | null>;
  getUserEvents(
    applicationId: bigint,
    requestId: string | undefined,
    eventSubType: string | string[],
    limit: number,
    before?: bigint,
  ): Promise<UserEvent[]>;
  getAppEvents(
    applicationId: bigint,
    requestId: string | undefined,
    eventSubType: string | string[],
    limit: number,
    before?: bigint,
  ): Promise<AppEvent[]>;
  getRefunds(applicationId: bigint, requestId: string | undefined, limit: number): Promise<OnChainRefund[]>;
  getWithdrawals(applicationId: bigint, requestId: string | undefined, limit: number): Promise<OnChainWithdrawal[]>;
  getClaimsExecuted(payee: string, tokenAddress: string | undefined, limit: number): Promise<ClaimExecuted[]>;
}

/** Projection returned by the subgraph for completed requests. */
export interface RequestCompleted {
  applicationId: bigint;
  requestId: string;
  status: number;
  errorCode: number;
  errorMessage: string;
  applicationFees: bigint;
  blockNumber: number;
}

/** Projection returned by the subgraph for completed deploy requests. */
export interface DeployRequestCompleted {
  applicationId: bigint;
  requestId: string;
  applicationFees: bigint;
  status: number;
  errorCode: number;
  errorMessage: string;
  blockNumber: number;
}

/** Projection returned by the subgraph for a Refund event. */
export interface OnChainRefund {
  applicationId: bigint;
  requestId: string;
  to: string;
  tokenAddress: string;
  amount: bigint;
  blockNumber: number;
}

/** Projection returned by the subgraph for a Withdrawal event. */
export interface OnChainWithdrawal {
  applicationId: bigint;
  requestId: string;
  to: string;
  tokenAddress: string;
  amount: bigint;
  blockNumber: number;
}

/** Projection returned by the subgraph for a PaymentWithdrawn event. */
export interface ClaimExecuted {
  tokenAddress: string;
  payee: string;
  amount: bigint;
  blockNumber: number;
}

/** Projection returned by the subgraph for user events. */
export interface UserEvent {
  applicationId: bigint;
  requestId: string;
  eventSubType: string;
  encryptedData: Uint8Array;
  blockNumber: number;
  logIndex: number;
  sortKey: bigint;
}

/** Projection returned by the subgraph for application-level (non-encrypted) events. */
export interface AppEvent {
  applicationId: bigint;
  requestId: string;
  eventSubType: string;
  data: Uint8Array;
  blockNumber: number;
  logIndex: number;
  sortKey: bigint;
}
