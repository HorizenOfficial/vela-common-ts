# horizen-cce-common-ts

## Update contract-related types

If `horizen-pes` contracts are updated, clone the [Horizen PES repository](https://github.com/HorizenOfficial/horizen-pes), then run

```
cd contracts
npm install
npx hardhat compile
```

The commands will compile the contracts and generate the `contracts/typechain-types` folder, that can be copied to replace the current `src/typechain-types` folder in this repository.

## Build
The library can be built executing the following commands

```
npm install
npm run build
```

Node.js is required.
The library will be available in `dist` folder, that can be then copied and imported to the project that should use it.