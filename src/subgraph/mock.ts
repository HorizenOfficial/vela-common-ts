import { type SubgraphClient, type RequestCompleted, type DeployRequestCompleted, type UserEvent, type OnChainRefund, type OnChainWithdrawal, type ClaimExecuted } from "./types";
import { userEventSortKey } from "./userEvents";

/** Mock subgraph client that returns canned responses for tests. */
export class MockSubgraphClient implements SubgraphClient {
  private requests = new Map<string, RequestCompleted>();
  private deployRequests: DeployRequestCompleted[] = [];
  private refunds: OnChainRefund[] = [];
  private withdrawals: OnChainWithdrawal[] = [];
  private claims: ClaimExecuted[] = [];
  private events = new Map<bigint, UserEvent[]>();

  withRequestCompleted(rc: RequestCompleted): this {
    this.requests.set(rc.requestId, rc);
    return this;
  }

  withDeployRequestCompleted(drc: DeployRequestCompleted): this {
    this.deployRequests.push(drc);
    return this;
  }

  withRefund(refund: OnChainRefund): this {
    this.refunds.push(refund);
    return this;
  }

  withWithdrawal(withdrawal: OnChainWithdrawal): this {
    this.withdrawals.push(withdrawal);
    return this;
  }

  withClaimExecuted(claim: ClaimExecuted): this {
    this.claims.push(claim);
    return this;
  }

  withUserEvents(applicationId: bigint, events: UserEvent[]): this {
    this.events.set(applicationId, events);
    return this;
  }

  async healthCheck(): Promise<void> {}

  async getRequestCompletedByID(requestId: string): Promise<RequestCompleted | null> {
    return this.requests.get(requestId) ?? null;
  }

  async getDeployRequestCompleted(applicationId: bigint | undefined, requestId: string | undefined): Promise<DeployRequestCompleted | null> {
    if (applicationId == undefined && requestId == undefined) {
      throw new Error("At least one of applicationId or requestId must be provided");
    }
    const match = this.deployRequests.find((drc) => {
      if (applicationId != undefined && drc.applicationId !== applicationId) return false;
      if (requestId != undefined && drc.requestId !== requestId) return false;
      return true;
    });
    return match ?? null;
  }

  async getUserEvents(
    applicationId: bigint,
    eventSubType: string | string[],
    limit: number,
    before?: bigint,
  ): Promise<UserEvent[]> {
    const all = this.events.get(applicationId);
    if (!all) return [];

    let filtered = [...all];

    if (Array.isArray(eventSubType)) {
      if (eventSubType.length > 0) {
        const set = new Set(eventSubType);
        filtered = filtered.filter((ev) => set.has(ev.eventSubType));
      }
    } else {
      const trimmedSubType = eventSubType.trim();
      if (trimmedSubType) {
        filtered = filtered.filter((ev) => ev.eventSubType === trimmedSubType);
      }
    }
    if (before != null) {
      filtered = filtered.filter((ev) => userEventSortKey(ev) < before);
    }

    // Sort descending by sortKey
    filtered.sort((a, b) => {
      const ka = userEventSortKey(a);
      const kb = userEventSortKey(b);
      if (kb > ka) return 1;
      if (kb < ka) return -1;
      return 0;
    });

    if (limit <= 0) limit = 10;
    if (limit > 1000) limit = 1000;

    return filtered.slice(0, limit);
  }

  async getRefunds(applicationId: bigint, requestId: string | undefined, limit: number): Promise<OnChainRefund[]> {
    if (limit <= 0) limit = 100;
    let filtered = this.refunds.filter((r) => r.applicationId === applicationId);
    if (requestId != undefined) {
      filtered = filtered.filter((r) => r.requestId === requestId);
    }
    return filtered.slice(0, limit);
  }

  async getWithdrawals(applicationId: bigint, requestId: string | undefined, limit: number): Promise<OnChainWithdrawal[]> {
    if (limit <= 0) limit = 100;
    let filtered = this.withdrawals.filter((w) => w.applicationId === applicationId);
    if (requestId != undefined) {
      filtered = filtered.filter((w) => w.requestId === requestId);
    }
    return filtered.slice(0, limit);
  }

  async getClaimsExecuted(payee: string, tokenAddress: string | undefined, limit: number): Promise<ClaimExecuted[]> {
    if (limit <= 0) limit = 100;
    let filtered = this.claims.filter((c) => c.payee.toLowerCase() === payee.toLowerCase());
    if (tokenAddress != undefined) {
      filtered = filtered.filter((c) => c.tokenAddress.toLowerCase() === tokenAddress.toLowerCase());
    }
    return filtered.slice(0, limit);
  }
}
