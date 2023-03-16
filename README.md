# Playground for Abstracted Wallets

**WARNING: The contracts in this repository are experimental, not audited and should not be used in production.**

## General

- [ERC-4337 Specification](https://eips.ethereum.org/EIPS/eip-4337)
- Vitalik Blog: [ERC 4337: account abstraction without Ethereum protocol changes](https://medium.com/infinitism/erc-4337-account-abstraction-without-ethereum-protocol-changes-d75c9d94dc4a)
- [ERC-4337: A Complete Guide to Account Abstraction](https://beincrypto.com/learn/erc-4337/)
- Argent [Part 1: WTF is Account Abstraction](https://www.argent.xyz/blog/wtf-is-account-abstraction/)
- Argent [Part 2: WTF is Account Abstraction](https://www.argent.xyz/blog/part-2-wtf-is-account-abstraction/)
- OpenZeppelin [EIP-437 - Ethereum Account Abstraction Incremental Audit](https://blog.openzeppelin.com/eip-4337-ethereum-account-abstraction-incremental-audit/)
- [Stackup](https://www.stackup.sh/) Infrastructure for Smart Contract Wallets [ERC-4337 Overview](https://docs.stackup.sh/docs/introduction/erc-4337-overview)
- [Account Abstraction Resources](https://github.com/PaymagicXYZ/awesome-account-abstraction)
- Diagrams of the [Account Abstraction Contracts](https://github.com/naddison36/sol2uml/tree/master/examples/accountAbstraction#account-abstraction-contracts)

## Installation

Clone and compile this repository:

```
git clone git@github.com:naddison36/abstract-accounts.git
yarn
yarn compile
```

## Hardhat Tasks

[Hardhat Tasks](https://hardhat.org/hardhat-runner/docs/advanced/create-task) are used to execute different transactions.

To see a list of available tasks run:
```
yarn task
```

The URL of the Ethereum node provider is set with the `NODE_URL` environment variable. For example:
```
export NODE_URL=https://eth-goerli.g.alchemy.com/v2/your-project-id
```

If deploying contracts, the `ETHERSCAN_KEY` environment variable is required so the contracts can be verified on [Etherscan](https://etherscan.io/). You need to login to Etherscan and generate an API key at https://etherscan.io/myapikey

```
export ETHERSCAN_KEY=your-api-key
```

To see the log output, export the `DEBUG` environment variable:
```
export DEBUG=aa:*
```

### Signers

In order to send transactions or sign user operations for the abstract wallet, a signer is required. This is an eternally owned account that uses a private key to cryptographically sign data. From this private key, the account address can be derived.

The following signers are supported:
- A private key by setting the `PRIVATE_KEY` environment variable.
- A mnemonic by setting the `MNEMONIC` environment variable.
- Impersonating an account if working against a local [Hardhat](https://hardhat.org/hardhat-runner/docs/getting-started#connecting-a-wallet-or-dapp-to-hardhat-network) or [Anvil](https://github.com/foundry-rs/foundry/tree/master/anvil#anvil) node by setting the `IMPERSONATE` environment variable to the account or contract address.
- Using [Defender Relay](https://docs.openzeppelin.com/defender/relay) from [Open Zeppelin](https://www.openzeppelin.com/) by generating an API key and setting the `DEFENDER_API_KEY` and `DEFENDER_API_SECRET` environment variables.

## SimpleAccount

Uses the [SimpleAccount](https://github.com/eth-infinitism/account-abstraction/blob/develop/contracts/samples/SimpleAccount.sol) contract from the Core Ethereum's [eth-infinitism/account-abstraction](https://github.com/eth-infinitism/account-abstraction) repository. The Core contracts have been copied into this repo as [typechain](https://github.com/dethcrypto/TypeChain#readme) can't import the contracts from the [@account-abstraction/contracts](https://www.npmjs.com/package/@account-abstraction/contracts) package. See typechain issue [#816](https://github.com/dethcrypto/TypeChain/issues/816) for details.

The following Hardhat tasks work with the SimpleAccount contract:
```
AVAILABLE TASKS:
  account-address               Gets the abstract account for the signer
  account-create                Deploys a new SimpleAccount using the factory
  account-factory-deploy        Deploys a SimpleAccountFactory
  account-transfers             Transfers native currency (eg ETH) or tokens from the abstract account to one or more accounts by directly calling the EntryPoint contract
```

To create your own simple abstract wallet, run the following after setting up your [signer](#signers):

```
yarn task account-create --network goerli
```

To deploy a new `SimpleAccountFactory` contract, run the following:

```
yarn task account-factory-deploy --network goerli
```

## DexWallet

Run a Decentralized Exchange (DEX) in your wallet with [DexWallet](./contracts/DexWallet.sol). No fees, approvals, deposits/withdrawals, impairment loss or slippage. Publish a signed order of what you want to exchange and let a market maker trade directly with your wallet.

Currently supports 
- Whole swaps between two tokens.
- Buying or selling tokens at a fixed rate but to the available liquidity in the wallet.
- Buying or selling a batch of NFTs for a fixed token unit price.
- Expiry of orders.
- Canceling orders.
- Cross-chain replay protection.


To deploy a new `DexWalletFactory` contract, run the following:

```
yarn task account-factory-deploy --network goerli --factory DexWalletFactory
```

To verify the newly deployed `DexWallet` implementation contract

```
yarn task account-verify --network goerli --type DexWallet --address 0x7EdC734891a04750B7fc26cE7FdBCf771e96563C
```

To create your own dex wallet, run the following after setting up your [signer](#signers):

```
yarn task account-create --network goerli --type DexWallet
```
