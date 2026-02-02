# horizen-cce-common-ts

TypeScript library for interacting with Horizen CCE (Confidential Computing Environment) smart contracts. Provides P-521 ECDH encryption and a blockchain client optimized for browser applications.

## Installation

```bash
npm install horizen-cce-common-ts ethers
```

> **Note:** `ethers` v6 is a peer dependency and must be installed separately.

## Quick Start

```typescript
import {
  HorizenCCEClient,
  RequestType,
  ethersSignerFromBrowser,
  stringToBytes
} from 'horizen-cce-common-ts';

// Connect to user's wallet (MetaMask, etc.)
const signer = await ethersSignerFromBrowser();

// Initialize the client
const client = new HorizenCCEClient(
  signer,
  false, // useAlternativeSign
  '0x...', // TEE Authenticator contract address
  '0x...'  // Processor Endpoint contract address
);

// Encrypt payload data for the TEE
const payload = stringToBytes(....);
const encryptedPayload = await client.encryptForTee(payload);

// Submit a request
const receipt = await client.submitRequestAndWaitForRequestId(
  1,                    // protocolVersion
  1,                    // applicationId
  RequestType.PROCESS,  // requestType
  encryptedPayload,     // payload
  0n,                   // depositAmount
  1000000000000000n     // maxFeeValue (wei)
);

console.log('Request ID:', receipt.requestId);
```

## API Reference

### Blockchain Client

#### `HorizenCCEClient`

Main client for interacting with Horizen CCE smart contracts.

```typescript
const client = new HorizenCCEClient(
  signer: Signer,              // ethers.js Signer instance
  useAlternativeSign: boolean, // Use alternative signing method
  teeAuthenticatorAddress: string,
  processorEndpointAddress: string
);
```

**Methods:**

| Method | Description |
|--------|-------------|
| `submitRequest(...)` | Submit a request to the CCE |
| `submitRequestAndWaitForRequestId(...)` | Submit and wait for request ID |
| `encryptForTee(data)` | Encrypt data for the TEE |
| `getTeePublicKey()` | Get the TEE's public key |
| `getRequestCompletedEvent(requestId, fromBlock, toBlock)` | Query for request completion |
| `getCurrentUserEvents(fromBlock, toBlock, applicationId, eventSubType, filter, stopAtFirst)` | Get encrypted events for current user |
| `decryptAndFilterEvents(events, filter, stopAtFirst)` | Decrypt and filter events |

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
} from 'horizen-cce-common-ts';

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
  importPublicKeyFromHex,
  P521KeyPair
} from 'horizen-cce-common-ts';

// Encrypt message
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
```

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

If `horizen-pes` contracts are updated, clone the [Horizen PES repository](https://github.com/HorizenOfficial/horizen-pes), then run:

```bash
cd contracts
npm install
npx hardhat compile
```

Copy the generated `contracts/typechain-types` folder to replace `src/typechain-types` in this repository.
