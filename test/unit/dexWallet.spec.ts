import { expect } from "chai"
import { parseUnits } from "ethers/lib/utils"
import { ethers } from "hardhat"

import { ExchangeType } from "../../src/types"
import { DexWallet__factory, DexWalletFactory__factory, EntryPoint__factory, MockERC20__factory } from "../../src/types/typechain"
import { account, getTimestamp, logger, logTxDetails, signExchangeOrder, signSwapOrder } from "../../src/utils"

import type { Account } from "../../src/types"
import type { DexWallet, DexWalletFactory, EntryPoint, IERC20, IERC721 } from "../../src/types/typechain"
import type { ExchangeOrderStruct, SwapOrderStruct } from "../../src/types/typechain/contracts/DexWallet.sol/DexWallet"

const log = logger("test:DexWallet")

const chainId = 31337

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
        beforeEach(async () => {
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
        })

        it("should swap tokens", async () => {
            // Transfer some A tokens to taker's wallet
            await tokenA.transfer(takerWallet.address, parseUnits("1001", 18))
            // Transfer some B tokens to maker's wallet
            await tokenB.transfer(makerWallet.address, parseUnits("1002", 6))

            // Maker signed the order
            const order: SwapOrderStruct = {
                makerTokenIn: tokenA.address,
                makerAmountIn: parseUnits("11", 18),
                makerTokenOut: tokenB.address,
                makerAmountOut: parseUnits("12", 6),
                id: 0,
                expiry: (await getTimestamp()).add(60),
                chainId,
            }
            log("order: ")
            log(order)

            // Sign swap order
            const makerSig = await signSwapOrder(order, maker.signer)

            expect(await makerWallet.orderUsed(0), "maker order has not been used").to.equal(false)
            expect(await takerWallet.orderUsed(0), "taker order has not been used").to.equal(false)
            expect(await makerWallet.isValidSwap(order, makerSig), "maker order is valid").to.equal(true)
            expect(await takerWallet.isValidSwap(order, makerSig), "taker order is invalid").to.equal(false)

            // Taker executes the swap
            const swapTx = await takerWallet.takeSwap(order, makerWallet.address, makerSig)
            await logTxDetails(swapTx, "take swap")

            expect(await makerWallet.orderUsed(0), "maker order has been used").to.equal(true)
            expect(await takerWallet.orderUsed(0), "taker order has not been used").to.equal(false)
            expect(await makerWallet.isValidSwap(order, makerSig), "maker order is invalid").to.equal(false, makerSig)
            expect(await takerWallet.isValidSwap(order, makerSig), "taker order is invalid").to.equal(false, makerSig)
        })

        it("maker should buy tokens", async () => {
            const expectedBaseAmount = parseUnits("11", 18)
            const expectedQuoteAmount = parseUnits("10", 6)

            // Transfer some A tokens to taker's wallet
            await tokenA.transfer(takerWallet.address, parseUnits("1001", 18))
            // Transfer some B tokens to maker's wallet
            await tokenB.transfer(makerWallet.address, parseUnits("1002", 6))

            // exchange rate = quote * 1e18 / base
            const exchangeRate = expectedQuoteAmount.mul(parseUnits("1", 18)).div(expectedBaseAmount)
            // Maker signed the order
            const order: ExchangeOrderStruct = {
                exchangeType: ExchangeType.BUY,
                baseToken: tokenA.address,
                quoteToken: tokenB.address,
                exchangeRate,
                id: 1,
                expiry: (await getTimestamp()).add(60),
                chainId,
            }
            log("order: ")
            log(order)

            // // Sign swap order
            const makerSig = await signExchangeOrder(order, maker.signer)

            expect(await makerWallet.orderUsed(0), "maker order 0 has not been cancelled").to.equal(false)
            expect(await makerWallet.orderUsed(1), "maker order 1 has not been cancelled").to.equal(false)
            expect(await takerWallet.orderUsed(1), "taker order 1 has not been cancelled").to.equal(false)

            const maxQuoteAmount = parseUnits("1002", 6)
            // base amount = quote amount * 1e18 / exchange rate
            const maxBaseAmount = maxQuoteAmount.mul(parseUnits("1", 18)).div(exchangeRate)
            const { baseAmount: baseAmountBefore, quoteAmount: quoteAmountBefore } = await makerWallet.maxTokensExchange(order)
            expect(baseAmountBefore, "max base amount").to.equal(maxBaseAmount)
            expect(quoteAmountBefore, "max quote amount").to.equal(maxQuoteAmount)

            // Taker executes the swap
            const swapTx = await takerWallet.takeTokensExchange(order, expectedBaseAmount, makerWallet.address, makerSig)
            await logTxDetails(swapTx, "take exchange")

            expect(await makerWallet.orderUsed(0), "maker order 0 has not been cancelled").to.equal(false)
            expect(await makerWallet.orderUsed(1), "maker order 1 has not been cancelled").to.equal(false)
            expect(await takerWallet.orderUsed(1), "taker order 1 has not been cancelled").to.equal(false)
            const { baseAmount: baseAmountAfter, quoteAmount: quoteAmountAfter } = await makerWallet.maxTokensExchange(order)
            console.log(`baseAmountBefore  : ${baseAmountBefore.toString()}`)
            console.log(`baseAmountAfter   : ${baseAmountAfter.toString()}`)
            console.log(`expectedBaseAmount: ${expectedBaseAmount}`)
            expect(baseAmountAfter, "max base amount").to.equal(baseAmountBefore.sub(expectedBaseAmount))
            expect(quoteAmountAfter.div(100), "max quote amount").to.equal(quoteAmountBefore.sub(expectedQuoteAmount).div(100))
        })
        it("maker should sell tokens", async () => {
            const expectedBaseAmount = parseUnits("112", 18)
            const expectedQuoteAmount = parseUnits("111", 6)

            // Transfer some A tokens to taker's wallet
            await tokenA.transfer(makerWallet.address, expectedBaseAmount)
            // Transfer some B tokens to maker's wallet
            await tokenB.transfer(takerWallet.address, expectedQuoteAmount)

            // exchange rate = quote * 1e18 / base
            const exchangeRate = expectedQuoteAmount.mul(parseUnits("1", 18)).div(expectedBaseAmount)
            // Maker signed the order
            const order: ExchangeOrderStruct = {
                exchangeType: ExchangeType.SELL,
                baseToken: tokenA.address,
                quoteToken: tokenB.address,
                exchangeRate,
                id: 1,
                expiry: (await getTimestamp()).add(60),
                chainId,
            }
            log("order: ")
            log(order)

            // // Sign swap order
            const makerSig = await signExchangeOrder(order, maker.signer)

            expect(await makerWallet.orderUsed(0), "maker order 0 has not been cancelled").to.equal(false)
            expect(await makerWallet.orderUsed(1), "maker order 1 has not been cancelled").to.equal(false)
            expect(await takerWallet.orderUsed(1), "taker order 1 has not been cancelled").to.equal(false)

            const maxBaseAmount = expectedBaseAmount
            // quote amount = base amount * exchange rate / 1e18
            const maxQuoteAmount = maxBaseAmount.mul(exchangeRate).div(parseUnits("1", 18))
            const { baseAmount: baseAmountBefore, quoteAmount: quoteAmountBefore } = await makerWallet.maxTokensExchange(order)
            expect(baseAmountBefore, "max base amount").to.equal(maxBaseAmount)
            expect(quoteAmountBefore, "max quote amount").to.equal(maxQuoteAmount)

            // Taker executes the swap
            const swapTx = await takerWallet.takeTokensExchange(order, expectedBaseAmount, makerWallet.address, makerSig)
            await logTxDetails(swapTx, "take exchange")

            expect(await makerWallet.orderUsed(0), "maker order 0 has not been cancelled").to.equal(false)
            expect(await makerWallet.orderUsed(1), "maker order 1 has not been cancelled").to.equal(false)
            expect(await takerWallet.orderUsed(1), "taker order 1 has not been cancelled").to.equal(false)
            const { baseAmount: baseAmountAfter, quoteAmount: quoteAmountAfter } = await makerWallet.maxTokensExchange(order)
            console.log(`baseAmountBefore  : ${baseAmountBefore.toString()}`)
            console.log(`baseAmountAfter   : ${baseAmountAfter.toString()}`)
            console.log(`expectedBaseAmount: ${expectedBaseAmount}`)
            expect(baseAmountAfter, "max base amount").to.equal(baseAmountBefore.sub(expectedBaseAmount))
            expect(quoteAmountAfter.div(100), "max quote amount").to.equal(quoteAmountBefore.sub(expectedQuoteAmount).div(100))
        })
    })
})
