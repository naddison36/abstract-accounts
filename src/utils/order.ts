// import { solidityKeccak256 } from "ethers/lib/utils"

import { utils } from "ethers"
import { solidityKeccak256 } from "ethers/lib/utils"

import { logger } from "./logger"

import type { Signer } from "ethers"
import type {
    ExchangeEthOrderStruct,
    ExchangeOrderStruct,
    NFTUnitTokenOrderStruct,
    SwapTokenOrderStruct,
} from "src/types/typechain/contracts/DexWallet"

const log = logger("order")

export const hashSwapTokenOrder = async (order: SwapTokenOrderStruct): Promise<string> => {
    const hash = solidityKeccak256(
        ["address", "uint256", "address", "uint256", "uint256", "uint256", "uint256"],
        [order.makerTokenIn, order.makerAmountIn, order.makerTokenOut, order.makerAmountOut, order.id, order.expiry, order.chainId]
    )
    log(`token swap order hash: ${hash}`)

    return hash
}

export const signSwapTokenOrder = async (order: SwapTokenOrderStruct, signer: Signer): Promise<string> => {
    const hash = await hashSwapTokenOrder(order)

    // sign the order hash
    const signature = await signer.signMessage(utils.arrayify(hash))
    log(`token swap order signature: ${signature}`)

    return signature
}

export const hashExchangeOrder = async (order: ExchangeOrderStruct): Promise<string> => {
    const hash = solidityKeccak256(
        ["uint8", "address", "address", "uint256", "uint256", "uint256", "uint256"],
        [order.exchangeType, order.baseToken, order.quoteToken, order.exchangeRate, order.id, order.expiry, order.chainId]
    )
    log(`tokens exchange order hash: ${hash}`)

    return hash
}

export const signExchangeOrder = async (order: ExchangeOrderStruct, signer: Signer): Promise<string> => {
    const hash = await hashExchangeOrder(order)

    // sign the order hash
    const signature = await signer.signMessage(utils.arrayify(hash))
    log(`tokens exchange order signature: ${signature}`)

    return signature
}

export const hashExchangeEthOrder = async (order: ExchangeEthOrderStruct): Promise<string> => {
    const hash = solidityKeccak256(
        ["uint8", "address", "uint256", "uint256", "uint256", "uint256"],
        [order.exchangeType, order.token, order.exchangeRate, order.id, order.expiry, order.chainId]
    )
    log(`token to ether exchange order hash: ${hash}`)

    return hash
}

export const signExchangeEthOrder = async (order: ExchangeEthOrderStruct, signer: Signer): Promise<string> => {
    const hash = await hashExchangeEthOrder(order)

    // sign the order hash
    const signature = await signer.signMessage(utils.arrayify(hash))
    log(`token to eth exchange order signature: ${signature}`)

    return signature
}

export const hashNFTOrder = async (order: NFTUnitTokenOrderStruct): Promise<string> => {
    const hash = solidityKeccak256(
        ["uint8", "address", "uint256[]", "address", "uint256", "uint256", "uint256", "uint256"],
        [order.exchangeType, order.nft, order.tokenIds, order.settleToken, order.price, order.id, order.expiry, order.chainId]
    )
    log(`nft order hash: ${hash}`)

    return hash
}

export const signNFTOrder = async (order: NFTUnitTokenOrderStruct, signer: Signer): Promise<string> => {
    const hash = await hashNFTOrder(order)

    // sign the order hash
    const signature = await signer.signMessage(utils.arrayify(hash))
    log(`nft order signature: ${signature}`)

    return signature
}
