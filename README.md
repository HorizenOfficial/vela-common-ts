# Vela Common TypeScript Library

TypeScript library for interacting with Vela.
Provides P-521 ECDH encryption and a blockchain client optimized for browser applications.

## Installation

```bash
npm install vela-common-ts ethers
```

> **Note:** `ethers` v6 is a peer dependency and must be installed separately.

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
  '0x...', // TEE Authenticator contract address
  '0x...'  // Processor Endpoint contract address
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

**Methods:**

| Method | Description |
|--------|-------------|
| `submitRequest(protocolVersion, applicationId, requestType, payload, tokenAddress, assetAmount, maxFeeValue)` | Submit a request (supports ETH and ERC-20 tokens) |
| `submitRequestAndWaitForRequestId(...)` | Submit and wait for request ID |
| `submitDeployRequest(protocolVersion, maxFeeValue, wasmSha256, constructorParams?)` | Submit a deploy request |
| `submitDeployRequestAndWaitForRequestId(...)` | Submit deploy request and wait for request ID |
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

#### `RequestType`

```typescript
enum RequestType {
  DEPLOYAPP = 0,
  PROCESS = 1,
  DEANONYMIZATION = 2,
  ASSOCIATEKEY = 3
}
```

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

### Run Tests

```bash
npm test
```

### Type Check

```bash
npm run check
```

### Update Contract Types

If `vela` contracts are updated, clone the [Vela repository](https://github.com/HorizenOfficial/vela), then run:

```bash
cd contracts
npm install
npx hardhat compile
```

Copy the generated `contracts/typechain-types` folder to replace `src/typechain-types` in this repository.
