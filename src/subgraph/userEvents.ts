import { type SubgraphClient, type UserEvent } from "./types";
import { decrypt } from "../crypto/p521";

/** Must match SORT_BASE in the subgraph mapping. */
const SORT_KEY_BASE = BigInt(1_000_000_000_000);

/** Default internal page size when fetching user events. */
export let userEventsPageSize = 1000;

/** Override the page size (for testing). Returns the previous value. */
export function setUserEventsPageSize(size: number): number {
  const prev = userEventsPageSize;
  userEventsPageSize = size;
  return prev;
}

/** Computes the sort key for a user event, using the stored sortKey when available. */
export function userEventSortKey(ev: UserEvent): bigint {
  if (ev.sortKey != null) {
    return ev.sortKey;
  }
  return BigInt(ev.blockNumber) * SORT_KEY_BASE + BigInt(ev.logIndex);
}

/**
 * Queries the subgraph for user events and decrypts them.
 *
 * The limit caps the number of decrypted events returned; limit <= 0 means no cap.
 * It applies the optional filter on decrypted payloads.
 */
export async function fetchAndDecryptUserEvents(
  client: SubgraphClient,
  teePublicKey: CryptoKey,
  privateKey: CryptoKey,
  applicationId: number,
  eventSubType: string | string[],
  limit: number,
  filter?: (data: Uint8Array) => boolean,
): Promise<Uint8Array[]> {
  const maxResults = limit > 0 ? limit : 0;
  let pageSize = userEventsPageSize;
  if (pageSize <= 0) pageSize = 1000;
  if (pageSize > 1000) pageSize = 1000;

  const decryptedEvents: Uint8Array[] = [];
  let before: bigint | undefined;

  while (true) {
    const events = await client.getUserEvents(applicationId, eventSubType, pageSize, before);
    if (events.length === 0) break;

    for (const ev of events) {
      try {
        const plain = await decrypt(privateKey, teePublicKey, ev.encryptedData);
        if (filter && !filter(plain)) continue;
        decryptedEvents.push(plain);
        if (maxResults > 0 && decryptedEvents.length >= maxResults) {
          return decryptedEvents;
        }
      } catch {
        // Decryption failed — event not intended for this user
        continue;
      }
    }

    if (events.length < pageSize) break;
    before = userEventSortKey(events[events.length - 1]);
  }

  return decryptedEvents;
}
