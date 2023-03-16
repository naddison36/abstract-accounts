import { BigNumber } from "ethers"

import type { Block } from "@ethersproject/abstract-provider"

export const sleep = async (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export const latestBlock = async (): Promise<Block> => {
    const { ethers } = await import("hardhat")
    return ethers.provider.getBlock(await ethers.provider.getBlockNumber())
}

export const getTimestamp = async (): Promise<BigNumber> => BigNumber.from((await latestBlock()).timestamp)
