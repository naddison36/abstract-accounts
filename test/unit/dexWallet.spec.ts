import { parseUnits } from "ethers/lib/utils"
import hre, { ethers } from "hardhat"

import { DexWallet__factory, DexWalletFactory__factory, EntryPoint__factory, MockERC20__factory } from "../../src/types/typechain"
import { account, getChain, getTimestamp, logger, logTxDetails, signOrder } from "../../src/utils"

import type { Account } from "src/types"
import type { SwapOrderStruct } from "src/types/typechain/contracts/DexWallet"

import type { DexWallet, DexWalletFactory, EntryPoint, IERC20, IERC721 } from "../../src/types/typechain"
import { expect } from "chai"

const log = logger("test:DexWallet")

describe("DexWallet Unit Tests", () => {
    let deployer: Account
    let maker: Account
    let taker: Account
    let entryPoint: EntryPoint
    let dexWalletFactory: DexWalletFactory
    let tokenA: IERC20
    let tokenB: IERC20
    let mockERC721: IERC721

    const setup = async () => {
        const accounts = await ethers.getSigners()
        deployer = await account(accounts[0])
        maker = await account(accounts[1])
        taker = await account(accounts[2])

        // Deploy EntryPoint
        entryPoint = await new EntryPoint__factory(deployer.signer).deploy()

        // Deploy DexWalletFactory
        dexWalletFactory = await new DexWalletFactory__factory(deployer.signer).deploy(entryPoint.address)

        // Deploy a mock ERC20 tokens
        tokenA = await new MockERC20__factory(deployer.signer).deploy("Token A", "TKA", 18, parseUnits("1000001", 18), deployer.address)
        tokenB = await new MockERC20__factory(deployer.signer).deploy("Token B", "TKB", 6, parseUnits("2000002", 6), deployer.address)

        // Deploy a mock ERC721
    }

    describe("Swap Tokens", () => {
        let makerWallet: DexWallet
        let takerWallet: DexWallet
        before(async () => {
            await setup()

            // Create a new abstract account using DexWalletFactory with salt 0
            const salt = 0
            // Maker's wallet
            await dexWalletFactory.connect(maker.signer).createAccount(maker.address, salt)
            makerWallet = DexWallet__factory.connect(await dexWalletFactory.getAddress(maker.address, salt), maker.signer)
            log(`makerWallet: ${makerWallet.address}`)

            // Taker's wallet
            await dexWalletFactory.connect(taker.signer).createAccount(taker.address, salt)
            takerWallet = DexWallet__factory.connect(await dexWalletFactory.getAddress(taker.address, salt), taker.signer)
            log(`takerWallet: ${takerWallet.address}`)

            // Transfer some A tokens to taker's wallet
            await tokenA.transfer(takerWallet.address, parseUnits("1001", 18))
            // Transfer some B tokens to maker's wallet
            await tokenB.transfer(makerWallet.address, parseUnits("1002", 6))
        })

        it("should swap tokens", async () => {
            expect(await makerWallet.orderUsed(0), "maker order has not been used").to.equal(false)
            expect(await takerWallet.orderUsed(0), "taker order has not been used").to.equal(false)

            // Maker signed the order
            const order: SwapOrderStruct = {
                tokenIn: tokenA.address,
                amountIn: parseUnits("11", 18),
                tokenOut: tokenB.address,
                amountOut: parseUnits("12", 6),
                id: 0,
                expiry: (await getTimestamp()).add(60),
                chainId: 31337,
            }
            log("order: ")
            log(order)
            const makerSig = await signOrder(order, maker.signer)

            // Taker signed the order
            const swapTx = await takerWallet.takeSwap(order, makerWallet.address, makerSig)
            await logTxDetails(swapTx, "take swap")
        })
    })
})
