# Vela Common TypeScript Library

TypeScript library for interacting with Vela.
Provides P-521 ECDH encryption and a blockchain client optimized for browser applications.

## Installation

```bash
npm install vela-common-ts ethers
```

> **Note:** `ethers` v6 is a peer dependency and must be installed separately.

> **Compatibility:** this version targets the Vela **v0.3.0** contracts. Vela is deployed on Base (Base Sepolia for testing); any chain it runs on must be at the Cancun hardfork or later.

```bash
npm run build
```

This will build a browser-friendly version of the lib in the path: dist/index.js


## Quick Start

```typescript
import {
  VelaClient,
  RequestType,
  ETH_TOKEN,
  ethersSignerFromBrowser,
  stringToBytes
} from 'vela-common-ts';

// Connect to user's wallet (MetaMask, etc.)
const signer = await ethersSignerFromBrowser();

// Initialize the client
const client = new VelaClient(
  signer,
  false, // useAlternativeSign
  '0x...', // TEE Authenticator contract address (proxy)
  '0x...'  // Processor Endpoint contract address (proxy)
);

// Encrypt payload data for the TEE
const payload = stringToBytes(....);
const encryptedPayload = await client.encryptForTee(payload);

// Submit a request (ETH deposit)
const receipt = await client.submitRequestAndWaitForRequestId(
  1,                    // protocolVersion
  1n,                   // applicationId
  RequestType.PROCESS,  // requestType
  encryptedPayload,     // payload
  ETH_TOKEN,            // tokenAddress (use ETH_TOKEN for native ETH)
  0n,                   // assetAmount
  1000000000000000n     // maxFeeValue (wei)
);

console.log('Request ID:', receipt.requestId);
```

## API Reference

### Blockchain Client

#### `VelaClient`

Main client for interacting with Vela smart contracts.

```typescript
const client = new VelaClient(
  signer: Signer,              // ethers.js Signer instance
  useAlternativeSign: boolean, // Use alternative signing method
  teeAuthenticatorAddress: string,
  processorEndpointAddress: string
);
```

> **Contract addresses:** since Vela v0.3.0, `ProcessorEndpoint`, `TeeAuthenticator` and `AuthorityRegistry` run behind UUPS proxies. Pass the **proxy** addresses, not the implementation addresses. They stay the same across contract upgrades.

**Methods:**

| Method | Description |
|--------|-------------|
| `submitRequest(protocolVersion, applicationId, requestType, payload, tokenAddress, assetAmount, maxFeeValue)` | Submit a request (supports ETH and ERC-20 tokens) |
| `submitRequestAndWaitForRequestId(...)` | Submit and wait for request ID |
| `submitDeployRequest(protocolVersion, maxFeeValue, wasmSha256, constructorParams?)` | Submit a deploy request |
| `submitDeployRequestAndWaitForRequestId(...)` | Submit deploy request and wait for request ID |
| `submitDeployRequestWithTrigger(protocolVersion, maxFeeValue, wasmSha256, constructorParams, trigger)` | Submit a deploy request registering a trigger contract for the app (`trigger` must be a deployed contract; pass `constructorParams` as `undefined` if none) |
| `submitDeployRequestWithTriggerAndWaitForRequestId(...)` | Submit deploy request with trigger and wait for request ID |
| `approveToken(tokenAddress, amount)` | Approve ERC-20 token spending for the Processor Endpoint |
| `encryptForTee(data)` | Encrypt data for the TEE |
| `getTeePublicKey()` | Get the TEE's public key |
| `getSignerKeyPair()` | Get the P-521 key pair derived from the signer |
| `getRequestCompletedEvent(requestId, fromBlock, toBlock)` | Query for request completion |
| `getDeployRequestCompletedEvent(applicationId, requestId, fromBlock, toBlock)` | Query for deploy request completion |
| `getCurrentUserEvents(fromBlock, toBlock, applicationId, requestId, eventSubType, filter, stopAtFirst)` | Get encrypted `UserEvent`s for the current user, decrypting in-range |
| `getAppEvents(fromBlock, toBlock, applicationId, requestId, eventSubType)` | Get plaintext application-wide `AppEvent`s |
| `decryptAndFilterEvents(events, filter, stopAtFirst)` | Decrypt and filter events |
| `getPendingClaims(tokenAddress, payee)` | Get pending claim amount for an address |
| `claim(tokenAddress, payee)` | Claim pending funds |

> **Block range:** `fromBlock` must be **>=** `toBlock` (most-recent → oldest), the opposite of Ethereum's usual convention. Passing `fromBlock < toBlock` throws.

**Request processing (Vela v0.3.0):**

- **Batches:** several requests of the same application can be settled in a single transaction. Each request still gets its own `RequestCompleted`, `UserEvent`, `AppEvent`, `Refund` and `Withdrawal` events, so lookups by `requestId` work as before. Do not assume one completed request per transaction or per block. Trigger requests, deploys and requests of apps that have a trigger contract are always settled one per transaction.
- **Ordering:** each application has its own queue. Trigger requests are served first, then deploys, then applications take turns (round-robin). Requests are processed in submission order within one application, but not across applications, so a request can wait while other applications are served.

#### `RequestType`

```typescript
enum RequestType {
  DEPLOYAPP = 0,
  PROCESS = 1,
  DEANONYMIZATION = 2,
  ASSOCIATEKEY = 3,
  TRUSTPROCESS = 4
}
```

`TRUSTPROCESS` requests are created on-chain by an application's trigger contract and show up in `RequestSubmitted` events; they cannot be submitted directly (`submitRequest` reverts with `InvalidRequestType`, as it does for `DEPLOYAPP`).

#### `ErrorCode`

Mirrors `Structs.ErrorCode` in the Vela contracts. `RequestResult.errorCode` (bigint) and the subgraph's `errorCode` (number) carry these values; compare with `Number(result.errorCode) === ErrorCode.WRONG_KEY_SENT`. A successful request has `errorCode` `0n` (`ErrorCode.NO_ERROR`); before this version, `getRequestCompletedEvent` and `getDeployRequestCompletedEvent` returned `undefined` instead.

```typescript
enum ErrorCode {
  NO_ERROR = 0,
  UNKNOWN = 1,
  INTERNAL = 2,
  APPLICATION_ALREADY_DEPLOYED = 3,
  FUNCTION_NOT_FOUND = 4,
  DEPOSIT_FAILED = 5,
  REQUEST_FUNC_FAILED = 6,
  WRONG_KEY_SENT = 7,
  PUB_KEY_NOT_REGISTERED = 8,
  NO_REPORT_DATA_FOUND = 9,
  WASM_INTERNAL = 10,
  INSUFFICIENT_FUEL = 11
}
```

> **Vela v0.3.0:** `APP_NOT_DEPLOYED` was removed, so every code from `WRONG_KEY_SENT` onward is one lower than in v0.2.0. New failures map to existing codes: an oversized app state to `REQUEST_FUNC_FAILED`, a guest execution timeout to `WASM_INTERNAL` (`errorMessage` gives the detail, e.g. `guest execution timed out`).

### Crypto Functions

#### Key Derivation

```typescript
import {
  deriveP521PrivateKeyFromSigner,
  ethersSignerFromBrowser
} from 'vela-common-ts';

// Get signer from browser wallet
const signer = await ethersSignerFromBrowser();

// Derive P-521 key pair from signer
const keyPair = await deriveP521PrivateKeyFromSigner(signer, false);
```

#### Encryption/Decryption

```typescript
import {
  encrypt,
  decrypt,
  encryptWithAES,
  decryptWithAES,
  importPublicKeyFromHex,
  importPrivateKeyFromHex,
  importPrivateKeyFromJWK,
  exportPublicKeyToHex,
  exportPrivateKeyToJWK,
  generateKeyPair,
  deriveKeyPairFromHKDF,
  deriveKeyPairFromSeed,
  P521KeyPair
} from 'vela-common-ts';

// Encrypt message (ECDH + AES-GCM)
const ciphertext = await encrypt(
  senderKeyPair.privateKey,
  receiverPublicKey,
  messageBytes
);

// Decrypt message
const plaintext = await decrypt(
  receiverKeyPair.privateKey,
  senderPublicKey,
  ciphertext
);

// AES-only encryption/decryption
const aesCiphertext = await encryptWithAES(sharedKey, plaintext);
const aesPlaintext = await decryptWithAES(sharedKey, aesCiphertext);

// Generate a new P-521 key pair
const keyPair = await generateKeyPair();

// Import/export keys (hex or JWK)
const pubKey = await importPublicKeyFromHex(hexString);
const privKey = await importPrivateKeyFromHex(hexString);
const hexPubKey = await exportPublicKeyToHex(keyPair.publicKey);
const jwkPriv = await exportPrivateKeyToJWK(keyPair.privateKey);
const privFromJwk = await importPrivateKeyFromJWK(jwkPriv);

// Derive a key pair from HKDF input key material or from a raw seed
const derivedFromIkm = await deriveKeyPairFromHKDF(ikmBytes);
const derivedFromSeed = await deriveKeyPairFromSeed(seedBytes);
```

#### Privacy-preserving Subtypes (ASSOCIATEKEY)

Helpers to register a user key with the enclave and derive deterministic event subtypes that replace the WASM-provided ones.

```typescript
import {
  generateSeed,
  encryptSeed,
  buildAssociateKeyPayload,
  generateSubtypeSet
} from 'vela-common-ts';

// 1. Seed = 65-byte secp256k1 signature over keccak256("subtype-key-v1")
const seed = generateSeed(secp256k1PrivateKey);

// 2. Encrypt the seed for the enclave (ECDH + AES-256-GCM, 93-byte envelope)
const encryptedSeed = await encryptSeed(seed, userP521PrivateKey, enclaveP521PublicKey);

// 3. Build the ASSOCIATEKEY payload (133 bytes without seed, 226 with)
const payload = await buildAssociateKeyPayload(userP521PublicKey, encryptedSeed);

// 4. Locally derive the same N subtypes the enclave will emit
const subtypes = await generateSubtypeSet(seed); // defaults to DEFAULT_SUBTYPE_N
```

### Subgraph Client

The library provides a subgraph client for querying Vela indexed data (as an alternative to direct on-chain event queries).

```typescript
import {
  createSubgraphClient,
  fetchAndDecryptUserEvents,
  userEventSortKey
} from 'vela-common-ts';

// Create a subgraph client
const subgraphClient = createSubgraphClient(subgraphUrl);

// Health check
await subgraphClient.healthCheck();

// Query a completed request by ID
const result = await subgraphClient.getRequestCompletedByID(requestId);

// Query a completed deploy request (by applicationId and/or requestId)
const deploy = await subgraphClient.getDeployRequestCompleted(applicationId, requestId);

// Query user events (encrypted). eventSubType accepts a string or string[].
const userEvents = await subgraphClient.getUserEvents(applicationId, requestId, eventSubType, limit, before);

// Query application-wide (plaintext) events
const appEvents = await subgraphClient.getAppEvents(applicationId, requestId, eventSubType, limit, before);

// Query refunds, withdrawals, executed claims
const refunds     = await subgraphClient.getRefunds(applicationId, requestId, limit);
const withdrawals = await subgraphClient.getWithdrawals(applicationId, requestId, limit);
const claims      = await subgraphClient.getClaimsExecuted(payee, tokenAddress, limit);

// Fetch and decrypt user events (auto-paginates via sortKey)
const decryptedEvents = await fetchAndDecryptUserEvents(
  subgraphClient,
  teePublicKey,
  userPrivateKey,
  applicationId,
  requestId,
  eventSubType,
  limit,
  filter   // optional (data: Uint8Array) => boolean
);
```

**Types:**

| Type | Description |
|------|-------------|
| `SubgraphClient` | Interface for subgraph operations |
| `SubgraphClientImpl` | Default implementation of SubgraphClient |
| `MockSubgraphClient` | Mock implementation for testing |
| `RequestCompleted` | Completed request projection from subgraph |
| `DeployRequestCompleted` | Completed deploy request projection from subgraph |
| `UserEvent` | Encrypted user event projection from subgraph |
| `AppEvent` | Plaintext application-wide event projection from subgraph |
| `OnChainRefund` | Refund event projection from subgraph |
| `OnChainWithdrawal` | Withdrawal event projection from subgraph |
| `ClaimExecuted` | Claim execution event projection from subgraph |

### Constants

```typescript
import {
  ETH_TOKEN,
  PROTOCOL_VERSION,
  CHALLENGE,
  HKDF_SALT,
  HKDF_INFO,
  SUBTYPE_KEY_MESSAGE,
  DEFAULT_SUBTYPE_N
} from 'vela-common-ts';
```

| Constant | Description |
|----------|-------------|
| `ETH_TOKEN` | Sentinel address representing native ETH (use as `tokenAddress` for ETH deposits) |
| `PROTOCOL_VERSION` | Current Vela protocol version expected by the contracts |
| `CHALLENGE` | Challenge message used for key derivation signing |
| `HKDF_SALT` | Salt used in HKDF key derivation |
| `HKDF_INFO` | Info parameter used in HKDF key derivation |
| `SUBTYPE_KEY_MESSAGE` | Message signed to produce the seed for privacy-preserving subtypes |
| `DEFAULT_SUBTYPE_N` | Default number of HMAC-derived subtypes generated from a seed |

## Browser Compatibility

This library is designed for modern browsers with Web Crypto API support:

- Chrome 60+
- Firefox 57+
- Safari 11+
- Edge 79+

The library uses:
- **Web Crypto API** for cryptographic operations
- **ES Modules** (ESM) format
- **ES2020** target


## Development

### Build

```bash
npm install
npm run build
```

`npm run build` deletes `dist` first. Type declarations are emitted with `tsconfig.build.json`, which leaves specs and `src/testutil` out of the published `dist`.

### Run Tests

```bash
npm test
```

The tests start an in-process Hardhat node on port 9545 (`src/testutil/localNode.ts`), at the Cancun hardfork (the minimum Vela supports), and deploy the contracts from `src/typechain-types` behind `ERC1967Proxy` proxies, as in a real deployment. No external node is needed.

### Type Check

```bash
npm run check
```

### Update Contract Types

If `vela` contracts are updated, clone the [Vela repository](https://github.com/HorizenOfficial/vela), check out the release tag this library targets (e.g. `v0.3.0`), then run:

```bash
cd contracts
npm install
npx hardhat clean   # removes stale bindings of deleted contracts
npx hardhat compile
```

Delete `src/typechain-types` in this repository and replace it with the generated `contracts/typechain-types` folder, then run `npm run check && npm test`. If the contracts' `@openzeppelin/contracts` version changes, update the matching dev dependency here (used by the tests for `ERC1967Proxy`) and `NOTICES`.
