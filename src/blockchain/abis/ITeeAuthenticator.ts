export const ITeeAuthenticator = {
  "_format": "hh-sol-artifact-1",
  "contractName": "ITeeAuthenticator",
  "sourceName": "contracts/interfaces/ITeeAuthenticator.sol",
  "abi": [
    {
      "inputs": [
        {
          "internalType": "uint64",
          "name": "applicationId",
          "type": "uint64"
        },
        {
          "internalType": "bytes32",
          "name": "prevStateRoot",
          "type": "bytes32"
        },
        {
          "internalType": "bytes32",
          "name": "newStateRoot",
          "type": "bytes32"
        },
        {
          "internalType": "bytes32",
          "name": "processedRequestId",
          "type": "bytes32"
        },
        {
          "internalType": "bytes[]",
          "name": "events",
          "type": "bytes[]"
        },
        {
          "internalType": "string[]",
          "name": "eventSubTypes",
          "type": "string[]"
        },
        {
          "components": [
            {
              "internalType": "address payable",
              "name": "receiver",
              "type": "address"
            },
            {
              "internalType": "uint256",
              "name": "amount",
              "type": "uint256"
            }
          ],
          "internalType": "struct Structs.WithdrawalRequest[]",
          "name": "withdrawalRequests",
          "type": "tuple[]"
        },
        {
          "internalType": "uint256",
          "name": "refundAmount",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "applicationFee",
          "type": "uint256"
        },
        {
          "internalType": "bytes",
          "name": "signature",
          "type": "bytes"
        }
      ],
      "name": "checkSignature",
      "outputs": [
        {
          "internalType": "bool",
          "name": "",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "getPubSecp521r1",
      "outputs": [
        {
          "internalType": "bytes",
          "name": "",
          "type": "bytes"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "getTeeSigner",
      "outputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    }
  ],
  "bytecode": "0x",
  "deployedBytecode": "0x",
  "linkReferences": {},
  "deployedLinkReferences": {}
}
