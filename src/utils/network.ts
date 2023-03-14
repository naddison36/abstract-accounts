import type { HardhatRuntimeEnvironment } from 'hardhat/types'

export enum Chain {
  mainnet = 1,
  goerli = 5,
  sepolia = 11155111,
  polygon = 137,
  mumbai = 80001,
  arbitrum = 42161,
  optimism = 10,
  bsc = 56,
  avalance = 43114,
  fantom = 250,
  gnosis = 100
}

export const getChain = (hre: HardhatRuntimeEnvironment): Chain => {
  if (hre?.network.name === 'mainnet' || hre?.hardhatArguments?.config === 'tasks-fork.config.ts') {
    return Chain.mainnet
  }
  if (hre?.network.name === 'polygon_mainnet' || hre?.hardhatArguments?.config === 'tasks-fork-polygon.config.ts') {
    return Chain.polygon
  }
  if (hre?.network.name === 'polygon_testnet') {
    return Chain.mumbai
  }
  if (hre?.network.name === 'goerli') {
    return Chain.goerli
  }
  if (hre?.network.name === 'sepolia') {
    return Chain.sepolia
  }
  return Chain.mainnet
}
