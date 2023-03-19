// import { solidityKeccak256 } from "ethers/lib/utils"

import { utils } from "ethers"
import { solidityKeccak256 } from "ethers/lib/utils"

import { logger } from "./logger"

import type { Signer } from "ethers"
import type { ExchangeOrderStruct, SwapOrderStruct } from "src/types/typechain/contracts/DexWallet.sol/DexWallet"

const log = logger("order")

export const hashSwapOrder = async (order: SwapOrderStruct): Promise<string> => {
    const hash = solidityKeccak256(
        ["address", "uint256", "address", "uint256", "uint256", "uint256", "uint256"],
        [order.makerTokenIn, order.makerAmountIn, order.makerTokenOut, order.makerAmountOut, order.id, order.expiry, order.chainId]
    )
    log(`swap order hash: ${hash}`)

    return hash
}

export const signSwapOrder = async (order: SwapOrderStruct, signer: Signer): Promise<string> => {
    const hash = await hashSwapOrder(order)

    // sign the order hash
    const signature = await signer.signMessage(utils.arrayify(hash))
    log(`swap order signature: ${signature}`)

    return signature
}

export const hashExchangeOrder = async (order: ExchangeOrderStruct): Promise<string> => {
    const hash = solidityKeccak256(
        ["uint8", "address", "address", "uint256", "uint256", "uint256", "uint256"],
        [order.exchangeType, order.baseToken, order.quoteToken, order.exchangeRate, order.id, order.expiry, order.chainId]
    )
    log(`exchange order hash: ${hash}`)

    return hash
}

export const signExchangeOrder = async (order: ExchangeOrderStruct, signer: Signer): Promise<string> => {
    const hash = await hashExchangeOrder(order)

    // sign the order hash
    const signature = await signer.signMessage(utils.arrayify(hash))
    log(`exchange order signature: ${signature}`)

    return signature
}
