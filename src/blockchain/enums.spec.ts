import assert from "assert";
import { ErrorCode, RequestType } from "../index";

function numericEntries(e: object): [string, unknown][] {
  return Object.entries(e).filter(([, v]) => typeof v === "number");
}

describe("RequestType", () => {
  // Values must match Structs.RequestType in vela v0.3.0.
  it("mirrors the on-chain enum", () => {
    assert.deepStrictEqual(numericEntries(RequestType), [
      ["DEPLOYAPP", 0],
      ["PROCESS", 1],
      ["DEANONYMIZATION", 2],
      ["ASSOCIATEKEY", 3],
      ["TRUSTPROCESS", 4],
    ]);
  });
});

describe("ErrorCode", () => {
  // Values must match Structs.ErrorCode in vela v0.3.0 (APP_NOT_DEPLOYED removed).
  it("mirrors the on-chain enum", () => {
    assert.deepStrictEqual(numericEntries(ErrorCode), [
      ["NO_ERROR", 0],
      ["UNKNOWN", 1],
      ["INTERNAL", 2],
      ["APPLICATION_ALREADY_DEPLOYED", 3],
      ["FUNCTION_NOT_FOUND", 4],
      ["DEPOSIT_FAILED", 5],
      ["REQUEST_FUNC_FAILED", 6],
      ["WRONG_KEY_SENT", 7],
      ["PUB_KEY_NOT_REGISTERED", 8],
      ["NO_REPORT_DATA_FOUND", 9],
      ["WASM_INTERNAL", 10],
      ["INSUFFICIENT_FUEL", 11],
    ]);
  });
});
