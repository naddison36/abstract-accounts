import { isAddress } from "ethers/lib/utils"

import { IERC20Metadata__factory } from "../types/typechain/"
import { logger } from "./logger"
import { resolveNamedAddress } from "./namedAddress"
import { Chain } from "./network"
import { ethereumAddress } from "./regex"
import { tokens } from "./tokens"

import type { Signer } from "ethers"

import type { Token } from "../types"
import type { ContractNames } from "./namedAddress"

// Singleton instances of different contract names and token symbols
const resolvedAddressesInstances: { [contractNameSymbol: string]: string } = {}

const log = logger("resolvers")

// Resolves a contract name or token symbol to an ethereum address
export const resolveAddress = (addressContractNameSymbol: string, chain = Chain.mainnet): string => {
    let address: string | undefined = addressContractNameSymbol
    // If not an Ethereum address
    if (!addressContractNameSymbol.match(ethereumAddress)) {
        // If previously resolved then return from singleton instances
        if (resolvedAddressesInstances[addressContractNameSymbol]) return resolvedAddressesInstances[addressContractNameSymbol]

        // If a named contract
        address = resolveNamedAddress(addressContractNameSymbol as ContractNames, chain)

        if (!address) {
            // If a token Symbol
            const token = tokens.find((t) => t.symbol === addressContractNameSymbol && t.chain === chain)
            if (!token) throw Error(`Invalid address, token symbol or contract name "${addressContractNameSymbol}" for chain ${chain}`)
            if (!token.address) throw Error(`Can not find address for token "${addressContractNameSymbol}" on chain ${chain}`)

            address = token.address
            log(`Resolved asset with symbol "${addressContractNameSymbol}" to address ${address}`)

            // Update the singleton instance so we don't need to resolve this next time
            resolvedAddressesInstances[addressContractNameSymbol] = address
            return address
        }

        log(`Resolved contract name "${addressContractNameSymbol}" to address ${address}`)

        // Update the singleton instance so we don't need to resolve this next time
        resolvedAddressesInstances[addressContractNameSymbol] = address

        return address
    }
    return address
}

// Singleton instances of different contract names and token symbols
const resolvedTokenInstances: { [address: string]: Token } = {}

export const resolveToken = (symbol: string, chain = Chain.mainnet): Token => {
    // If previously resolved then return from singleton instances
    if (resolvedTokenInstances[symbol]) return resolvedTokenInstances[symbol]

    // If a token Symbol
    const token = tokens.find((t) => t.symbol === symbol && t.chain === chain)
    if (!token) throw Error(`Can not find token symbol ${symbol} on chain ${chain}`)
    if (!token.address) throw Error(`Can not find token for ${symbol} on chain ${chain}`)

    log(`Resolved token symbol ${symbol} to address ${token.address}`)

    resolvedTokenInstances[symbol] = token

    return token
}

/**
 * Resolves a vault by symbol or by its address if it is provided.
 *
 * @param {Signer} signer
 * @param {Chain} chain
 * @param {string} symbol
 * @param {AssetAddressTypes} tokenType
 * @param {string} [address]
 * @return {*}  {Promise<Token>}
 */
export const resolveVaultToken = async (signer: Signer, chain: Chain, addressContractNameSymbol: string): Promise<Token> => {
    let token: Token

    // If a contract address
    if (isAddress(addressContractNameSymbol)) {
        const tkn = IERC20Metadata__factory.connect(addressContractNameSymbol, signer)
        token = {
            symbol: await tkn.symbol(),
            address: addressContractNameSymbol,
            chain,
            decimals: await tkn.decimals(),
        }
    } else {
        token = await resolveToken(addressContractNameSymbol, chain)
    }

    return token
}
/**
 * Resolves a token by symbol, name or address.
 *
 * @param {Signer} signer
 * @param {Chain} chain
 * @param {string} addressContractNameSymbol Contract address, name identifier or symbol
 * @return {*}  {Promise<Token>}
 */
export const resolveAssetToken = async (signer: Signer, chain: Chain, addressContractNameSymbol: string): Promise<Token> => {
    let token: Token

    // If a contract address
    if (isAddress(addressContractNameSymbol)) {
        const tkn = IERC20Metadata__factory.connect(addressContractNameSymbol, signer)
        token = {
            symbol: await tkn.symbol(),
            address: addressContractNameSymbol,
            chain,
            decimals: await tkn.decimals(),
        }
    } else {
        // If a token symbol
        token = resolveToken(addressContractNameSymbol, chain)
    }
    return token
}
