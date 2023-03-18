// import { solidityKeccak256 } from "ethers/lib/utils"

import { utils } from "ethers"
import { solidityKeccak256 } from "ethers/lib/utils"

import { logger } from "./logger"

import type { Signer } from "ethers"
import type { SwapOrderStruct } from "src/types/typechain/contracts/DexWallet"

const log = logger("order")

export const hashOrder = async (order: SwapOrderStruct): Promise<string> => {
    const orderHash = solidityKeccak256(
        ["address", "uint256", "address", "uint256", "uint256", "uint256", "uint256"],
        [order.tokenIn, order.amountIn, order.tokenOut, order.amountOut, order.id, order.expiry, order.chainId]
    )
    log(`order hash: ${orderHash}`)

    return orderHash
}

export const signOrder = async (order: SwapOrderStruct, signer: Signer): Promise<string> => {
    const hash = await hashOrder(order)

    // sign the order hash
    const signature = await signer.signMessage(utils.arrayify(hash))
    log(`order signature: ${signature}`)

    return signature
}
