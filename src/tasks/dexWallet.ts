import { utils } from "ethers"
import { parseUnits, solidityKeccak256, verifyMessage } from "ethers/lib/utils"
import { task, types } from "hardhat/config"

import { DexWallet__factory } from "../types/typechain"
import { logger } from "../utils/logger"
import { getChain } from "../utils/network"
import { resolveAddress, resolveToken } from "../utils/resolvers"
import { getSigner } from "../utils/signer"
import { getTimestamp } from "../utils/time"
import { logTxDetails } from "../utils/transaction"

import type { SwapOrderStruct } from "../types/typechain/contracts/DexWallet"

const log = logger("task:dex-wallet")

task("dex-sign-swap", "Sign a token swap order")
    .addParam("wallet", "Address or name of the dex wallet", undefined, types.string, false)
    .addParam("tokenIn", "Address or name of the token to be transferred to the abstract wallet", undefined, types.string, false)
    .addParam("amountIn", "Amount of tokens to be transferred to the abstract wallet with decimals", undefined, types.float, false)
    .addParam("tokenOut", "Address or name of the token to be transferred from the abstract wallet", undefined, types.string, false)
    .addParam("amountOut", "Amount of tokens to be transferred from the abstract wallet with decimals", undefined, types.float, false)
    .setAction(async (taskArgs, hre) => {
        const signer = await getSigner(hre, taskArgs.speed)
        const chain = getChain(hre)

        log(`Using wallet ${taskArgs.wallet}`)
        const dex = DexWallet__factory.connect(resolveAddress(taskArgs.wallet, chain), signer)

        const tokenIn = resolveToken(taskArgs.tokenIn, chain)
        const amountIn = parseUnits(taskArgs.amountIn.toString(), tokenIn.decimals)
        const tokenOut = resolveToken(taskArgs.tokenOut, chain)
        const amountOut = parseUnits(taskArgs.amountOut.toString(), tokenOut.decimals)
        const id = 0
        const expiry = await (await getTimestamp()).add(120) // Expiry in seconds since epoch

        const order: SwapOrderStruct = {
            tokenIn: tokenIn.address,
            amountIn,
            tokenOut: tokenOut.address,
            amountOut,
            id,
            expiry,
            chainId: chain,
        }
        console.log(order)

        // hash the swap order
        const orderHash = solidityKeccak256(
            ["address", "uint256", "address", "uint256", "uint256", "uint256", "uint256"],
            [tokenIn.address, amountIn, tokenOut.address, amountOut, id, expiry, chain]
        )
        log(`order hash ${orderHash}`)
        // TODO this can be removed once debugging has finished
        const contractHash = await dex.hashSwapOrder(order)
        log(`contract order hash ${contractHash}`)

        // sign the order hash
        const signature = await signer.signMessage(utils.arrayify(orderHash))
        log(`order signature ${signature}`)
        log(`recovered signer address ${verifyMessage(utils.arrayify(orderHash), signature)}`)

        const signerAddress = await signer.getAddress()
        log(`signer address ${signerAddress}`)
        const tx = await dex.swapTokens(order, signerAddress, signature)
        await logTxDetails(tx, `Swap tokens`)
    })

module.exports = {}
