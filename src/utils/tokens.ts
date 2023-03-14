import { Chain } from "./network"
import { ethereumAddress } from "./regex"

import type { Token } from "../types/index"

export function isToken(asset: unknown): asset is Token {
    const token = asset as Token
    return !!("symbol" in token && token.address.match(ethereumAddress) && "chain" in token && "decimals" in token)
}

export const WETH: Token = {
    symbol: "WETH",
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    chain: Chain.mainnet,
    decimals: 18,
} as const

export const gWETH: Token = {
    ...WETH,
    address: "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6",
    chain: Chain.goerli,
} as const

export const aWETH: Token = {
    ...WETH,
    address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    chain: Chain.arbitrum,
} as const

export const oWETH: Token = {
    ...WETH,
    address: "0x4200000000000000000000000000000000000006",
    chain: Chain.optimism,
} as const

export const pWETH: Token = {
    ...WETH,
    address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    chain: Chain.polygon,
} as const

export const tokens = [WETH, gWETH, aWETH, oWETH, pWETH]
