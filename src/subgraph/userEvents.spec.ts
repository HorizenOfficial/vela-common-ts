import assert from "assert";
import { randomBytes } from "crypto";
import { generateKeyPair, encrypt, decrypt } from "../crypto/p521";
import { bytesToString, stringToBytes } from "../crypto/utils";
import { generateSubtypeSet } from "../crypto/seed";
import { DEFAULT_SUBTYPE_N } from "../constants";
import { MockSubgraphClient } from "./mock";
import { fetchAndDecryptUserEvents, setUserEventsPageSize } from "./userEvents";
import { type UserEvent } from "./types";

function makeEvent(
  appId: bigint,
  requestId: string,
  encryptedData: Uint8Array,
  subType: string,
  blockNumber: number,
  logIndex = 0,
): UserEvent {
  return {
    applicationId: appId,
    requestId,
    eventSubType: subType,
    encryptedData,
    blockNumber,
    logIndex,
    sortKey: BigInt(blockNumber) * BigInt(1_000_000_000_000) + BigInt(logIndex),
  };
}

describe("fetchAndDecryptUserEvents", function () {
  this.timeout(20_000);

  it("limit one", async () => {
    const teeKey = await generateKeyPair();
    const userKey = await generateKeyPair();

    const appId = 1n;
    const ev1Cipher = await encrypt(teeKey.privateKey, userKey.publicKey, stringToBytes("msg-1"));
    const ev2Cipher = await encrypt(teeKey.privateKey, userKey.publicKey, stringToBytes("msg-2"));

    const mock = new MockSubgraphClient().withUserEvents(appId, [
      makeEvent(appId, "0x01", ev2Cipher, "a", 3),
      makeEvent(appId, "0x02", ev1Cipher, "a", 2),
    ]);

    const result = await fetchAndDecryptUserEvents(
      mock, teeKey.publicKey, userKey.privateKey, appId, "", 1,
    );

    assert.equal(result.length, 1);
    assert.equal(bytesToString(result[0]), "msg-2");
  });

  it("filter", async () => {
    const teeKey = await generateKeyPair();
    const userKey = await generateKeyPair();

    const appId = 2n;
    const ev1Cipher = await encrypt(teeKey.privateKey, userKey.publicKey, stringToBytes("keep-this"));
    const ev2Cipher = await encrypt(teeKey.privateKey, userKey.publicKey, stringToBytes("drop-this"));

    const mock = new MockSubgraphClient().withUserEvents(appId, [
      makeEvent(appId, "0x01", ev1Cipher, "b", 5),
      makeEvent(appId, "0x02", ev2Cipher, "b", 4),
    ]);

    const filter = (data: Uint8Array) => bytesToString(data).includes("keep");

    const result = await fetchAndDecryptUserEvents(
      mock, teeKey.publicKey, userKey.privateKey, appId, "", 10, filter,
    );

    assert.equal(result.length, 1);
    assert.equal(bytesToString(result[0]), "keep-this");
  });

  it("user-specific decryption", async () => {
    const teeKey = await generateKeyPair();
    const userKeyA = await generateKeyPair();
    const userKeyB = await generateKeyPair();

    const appId = 3n;
    const ev1Cipher = await encrypt(teeKey.privateKey, userKeyA.publicKey, stringToBytes("user-a"));
    const ev2Cipher = await encrypt(teeKey.privateKey, userKeyB.publicKey, stringToBytes("user-b"));

    const mock = new MockSubgraphClient().withUserEvents(appId, [
      makeEvent(appId, "0x01", ev1Cipher, "c", 3),
      makeEvent(appId, "0x02", ev2Cipher, "c", 2),
    ]);

    const resultA = await fetchAndDecryptUserEvents(
      mock, teeKey.publicKey, userKeyA.privateKey, appId, "", 10,
    );
    assert.equal(resultA.length, 1);
    assert.equal(bytesToString(resultA[0]), "user-a");

    const resultB = await fetchAndDecryptUserEvents(
      mock, teeKey.publicKey, userKeyB.privateKey, appId, "", 10,
    );
    assert.equal(resultB.length, 1);
    assert.equal(bytesToString(resultB[0]), "user-b");
  });

  it("paginates until match", async () => {
    const oldPageSize = setUserEventsPageSize(1);

    try {
      const teeKey = await generateKeyPair();
      const userKey = await generateKeyPair();

      const appId = 3n;
      const ev1Cipher = await encrypt(teeKey.privateKey, userKey.publicKey, stringToBytes("skip-me"));
      const ev2Cipher = await encrypt(teeKey.privateKey, userKey.publicKey, stringToBytes("target"));

      const mock = new MockSubgraphClient().withUserEvents(appId, [
        makeEvent(appId, "0x01", ev1Cipher, "c", 2),
        makeEvent(appId, "0x02", ev2Cipher, "c", 1),
      ]);

      const filter = (data: Uint8Array) => bytesToString(data).includes("target");

      const result = await fetchAndDecryptUserEvents(
        mock, teeKey.publicKey, userKey.privateKey, appId, "", 1, filter,
      );

      assert.equal(result.length, 1);
      assert.equal(bytesToString(result[0]), "target");
    } finally {
      setUserEventsPageSize(oldPageSize);
    }
  });

  it("max results", async () => {
    const teeKey = await generateKeyPair();
    const userKey = await generateKeyPair();

    const appId = 4n;
    const ev1Cipher = await encrypt(teeKey.privateKey, userKey.publicKey, stringToBytes("first"));
    const ev2Cipher = await encrypt(teeKey.privateKey, userKey.publicKey, stringToBytes("second"));

    const mock = new MockSubgraphClient().withUserEvents(appId, [
      makeEvent(appId, "0x01", ev1Cipher, "d", 2),
      makeEvent(appId, "0x02", ev2Cipher, "d", 1),
    ]);

    const result = await fetchAndDecryptUserEvents(
      mock, teeKey.publicKey, userKey.privateKey, appId, "", 1,
    );

    assert.equal(result.length, 1);
    assert.equal(bytesToString(result[0]), "first");
  });

  it("no limit returns all", async () => {
    const teeKey = await generateKeyPair();
    const userKey = await generateKeyPair();

    const appId = 5n;
    const ev1Cipher = await encrypt(teeKey.privateKey, userKey.publicKey, stringToBytes("one"));
    const ev2Cipher = await encrypt(teeKey.privateKey, userKey.publicKey, stringToBytes("two"));

    const mock = new MockSubgraphClient().withUserEvents(appId, [
      makeEvent(appId, "0x01", ev1Cipher, "e", 2),
      makeEvent(appId, "0x02", ev2Cipher, "e", 1),
    ]);

    const result = await fetchAndDecryptUserEvents(
      mock, teeKey.publicKey, userKey.privateKey, appId, "", 0,
    );

    assert.equal(result.length, 2);
    assert.equal(bytesToString(result[0]), "one");
    assert.equal(bytesToString(result[1]), "two");
  });

  it("filters by seed-derived subtypes", async () => {
    const teeKey = await generateKeyPair();
    const userKey = await generateKeyPair();

    const seed = randomBytes(65);
    const subtypes = await generateSubtypeSet(seed, DEFAULT_SUBTYPE_N);

    const appId = 7n;
    const ev1Cipher = await encrypt(teeKey.privateKey, userKey.publicKey, stringToBytes("seeded-1"));
    const ev2Cipher = await encrypt(teeKey.privateKey, userKey.publicKey, stringToBytes("seeded-2"));
    const ev3Cipher = await encrypt(teeKey.privateKey, userKey.publicKey, stringToBytes("other-1"));
    const ev4Cipher = await encrypt(teeKey.privateKey, userKey.publicKey, stringToBytes("other-2"));

    const mock = new MockSubgraphClient().withUserEvents(appId, [
      makeEvent(appId, "0x01", ev1Cipher, subtypes[0], 10),
      makeEvent(appId, "0x02", ev2Cipher, subtypes[5], 9),
      makeEvent(appId, "0x03", ev3Cipher, "0xdeadbeef", 8),
      makeEvent(appId, "0x04", ev4Cipher, "0xcafebabe", 7),
    ]);

    const result = await fetchAndDecryptUserEvents(
      mock, teeKey.publicKey, userKey.privateKey, appId, subtypes, 0,
    );

    assert.equal(result.length, 2);
    assert.equal(bytesToString(result[0]), "seeded-1");
    assert.equal(bytesToString(result[1]), "seeded-2");
  });

  it("order within block", async () => {
    const teeKey = await generateKeyPair();
    const userKey = await generateKeyPair();

    const appId = 6n;
    const ev1Cipher = await encrypt(teeKey.privateKey, userKey.publicKey, stringToBytes("first-log"));
    const ev2Cipher = await encrypt(teeKey.privateKey, userKey.publicKey, stringToBytes("second-log"));

    const mock = new MockSubgraphClient().withUserEvents(appId, [
      makeEvent(appId, "0x01", ev1Cipher, "f", 10, 1),
      makeEvent(appId, "0x02", ev2Cipher, "f", 10, 2),
    ]);

    // descending order: logIndex 2 comes first
    const result = await fetchAndDecryptUserEvents(
      mock, teeKey.publicKey, userKey.privateKey, appId, "", 1,
    );

    assert.equal(result.length, 1);
    assert.equal(bytesToString(result[0]), "second-log");
  });
});
