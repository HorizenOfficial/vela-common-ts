# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm install              # Install dependencies
npm run build            # Full build (esbuild bundle + TypeScript declarations)
npm run build:bundle     # ESM bundle only (esbuild, browser platform, ES2020)
npm run build:types      # Type declarations only (tsc --emitDeclarationOnly)
npm run check            # Type check without emitting
npm test                 # Run all tests (mocha + tsx)
```

No linter or formatter is configured.

To run a single test file:
```bash
node --import tsx node_modules/.bin/mocha 'src/crypto/p521.spec.ts'
```

## Architecture

This is a browser-oriented TypeScript library published to npm. It bundles with esbuild into a single ESM file (`dist/index.js`) and ships type declarations alongside.

### Three modules, one entry point

Everything is re-exported from `src/index.ts`:

- **crypto/** — P-521 ECDH encryption using Web Crypto API.
  - `p521.ts`: key generation, import/export, ECDH + AES-256-GCM encrypt/decrypt.
  - `wallet.ts`: derives P-521 key pairs from ethers.js Signers via HKDF (sign a challenge, use signature as IKM).
  - `utils.ts`: hex/bytes/string conversions.

- **blockchain/** — `VelaClient` wraps two on-chain contracts (`ITeeAuthenticator`, `ProcessorEndpoint`) via typechain-types. Handles request submission, TEE encryption, on-chain event querying/decryption, and payment withdrawal.

- **subgraph/** — `SubgraphClient` queries the same data (RequestCompleted, UserEvent) through a GraphQL subgraph instead of direct on-chain event filtering. Provides pagination via `sortKey` and batch decryption via `fetchAndDecryptUserEvents`.

### Blockchain vs Subgraph

Both modules decrypt the same `UserEvent` data. `VelaClient` queries events by block range directly on-chain; `SubgraphClient` queries indexed data via GraphQL (faster, paginated, but depends on subgraph availability).

### typechain-types

`src/typechain-types/` contains generated contract bindings. These are **excluded from tsconfig compilation** but consumed by the blockchain module. To regenerate, compile contracts with Hardhat in the vela repo and copy `typechain-types/` here.

### Key derivation flow

1. User's ethers Signer signs a challenge string (`"horizen"` + address)
2. Signature becomes HKDF input key material
3. HKDF derives a seed → rejection-sampled into a valid P-521 private key
4. The resulting key pair is used for ECDH encryption with the TEE's public key

## CI

GitHub Actions (`.github/workflows/ci.yml`): type check → build → test → verify dist artifacts. On version tags, validates tag/package.json match and publishes to npm.

## Peer Dependencies

`ethers` v6 is a peer dependency — not bundled, must be installed by consumers.
