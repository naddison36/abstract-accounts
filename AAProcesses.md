# Abstract Account Processes

[ERC-4337 Specification](https://eips.ethereum.org/EIPS/eip-4337) is a hard read. The following process diagrams will hopefully help explain visually what's happening with different Account Abstraction processes.

## Execute of a batch of UserOperations

This is a simple version as it doesn't use a signature aggregator or paymaster.

![handleOps with no paymaster or aggregate signer](./docs/handleOpsNoPaymaster.png)
