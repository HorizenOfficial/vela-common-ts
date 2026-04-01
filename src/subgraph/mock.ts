import { type SubgraphClient, type RequestCompleted, type UserEvent } from "./types";
import { userEventSortKey } from "./userEvents";

/** Mock subgraph client that returns canned responses for tests. */
export class MockSubgraphClient implements SubgraphClient {
  private requests = new Map<string, RequestCompleted>();
  private events = new Map<number, UserEvent[]>();

  withRequestCompleted(rc: RequestCompleted): this {
    this.requests.set(rc.requestId, rc);
    return this;
  }

  withUserEvents(applicationId: number, events: UserEvent[]): this {
    this.events.set(applicationId, events);
    return this;
  }

  async healthCheck(): Promise<void> {}

  async getRequestCompletedByID(requestId: string): Promise<RequestCompleted | null> {
    return this.requests.get(requestId) ?? null;
  }

  async getUserEvents(
    applicationId: number,
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
}
