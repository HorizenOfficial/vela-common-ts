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
  - `p521.ts`: key generation, import/export (hex + JWK), ECDH + AES-256-GCM encrypt/decrypt, HKDF/seed-based key derivation.
  - `wallet.ts`: derives P-521 key pairs from ethers.js Signers via HKDF (sign a challenge, use signature as IKM).
  - `utils.ts`: hex/bytes/string conversions.
  - `seed.ts`: privacy-preserving event subtypes for `ASSOCIATEKEY`. A 65-byte secp256k1 signature over `keccak256("subtype-key-v1")` is the seed; the enclave HMACs it to produce deterministic per-app `EventSubType` values that replace the WASM-provided ones.

- **blockchain/** — `VelaClient` wraps two on-chain contracts (`ITeeAuthenticator`, `ProcessorEndpoint`) via typechain-types. Handles request submission (including deploy requests), ERC-20 token approval, TEE encryption, on-chain event querying/decryption, and claims.
  - **Block range convention (inverted from Ethereum):** in methods taking `fromBlock` / `toBlock` (`getRequestCompletedEvent`, `getDeployRequestCompletedEvent`, `getCurrentUserEvents`, `getAppEvents`), `fromBlock` is the **most recent** block and `toBlock` is the **oldest** — i.e. `fromBlock >= toBlock`. This is the opposite of Ethereum's standard (where `fromBlock` is older). Passing `fromBlock < toBlock` throws.
  - `UserEvent` carries encrypted per-user payloads (decrypted via `decryptAndFilterEvents`); `AppEvent` carries application-wide plaintext data returned as-is by `getAppEvents`.

- **subgraph/** — `SubgraphClient` queries indexed data via GraphQL as an alternative to direct on-chain event filtering. Covers `RequestCompleted`, `DeployRequestCompleted`, `UserEvent`, `AppEvent`, `OnChainRefund`, `OnChainWithdrawal`, and `ClaimExecuted` projections. Provides pagination via `sortKey` and batch decryption of user events via `fetchAndDecryptUserEvents`.

### Blockchain vs Subgraph

Both modules can read the same `UserEvent` / `AppEvent` data. `VelaClient` queries events by block range directly on-chain; `SubgraphClient` queries indexed data via GraphQL (faster, paginated, richer projections, but depends on subgraph availability).

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
