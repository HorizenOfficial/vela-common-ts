import { bytesToString, hexToBytes, stringToBytes } from "./utils";
import assert from "assert";

const TEST_MSG_HEX = "0x48656c6c6f20576f726c64"
const TEST_MSG_UTF8 = "Hello World"

describe("Utils test", function () {  
  it("hex-bytes conversion test", async () => {
    
    let string = bytesToString(hexToBytes(TEST_MSG_HEX));
    assert.equal(string, TEST_MSG_UTF8);

    let byt = stringToBytes(TEST_MSG_UTF8);
    let converted = hexToBytes(TEST_MSG_HEX);
    assert.equal(byt.length, converted.length);
    for(let i = 0; i < byt.length; i++) {
      assert.equal(byt[i], converted[i]);
    }
  });
});