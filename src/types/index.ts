import type { DefenderRelaySigner } from "defender-relay-client/lib/ethers"
import type { Signer } from "ethers"

import type { Chain } from "../utils/network"

export type HHSigner = Signer | DefenderRelaySigner

export interface Account {
    signer: Signer
    address: string
}

export interface Token {
    name?: string
    symbol: string
    address: string
    chain: Chain
    decimals: number
}

export interface VerifyEtherscan {
    address: string
    contract?: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
    constructorArguments?: any[]
    libraries?: {
        [libraryName: string]: string
    }
}

export enum ExchangeType {
    BUY,
    SELL,
}
