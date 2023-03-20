import { expect } from "chai"
import { parseUnits } from "ethers/lib/utils"
import { ethers } from "hardhat"

import { ExchangeType } from "../../src/types"
import {
    DexWallet__factory,
    DexWalletFactory__factory,
    EntryPoint__factory,
    MockERC20__factory,
    MockNFT__factory,
} from "../../src/types/typechain"
import { account, Chain, getTimestamp, logger, logTxDetails, signExchangeOrder, signNFTOrder, signSwapTokenOrder } from "../../src/utils"

import type { Account, Token } from "../../src/types"
import type { DexWallet, DexWalletFactory, EntryPoint, IERC20, MockNFT } from "../../src/types/typechain"
import type { ExchangeOrderStruct, NFTUnitTokenOrderStruct, SwapTokenOrderStruct } from "../../src/types/typechain/contracts/DexWallet"

const log = logger("test:DexWallet")

const chainId = Chain.hardhat
const TokenA: Token = {
    name: "Token A",
    symbol: "TKA",
    decimals: 18,
    chain: Chain.hardhat,
    address: "",
}
const TokenB: Token = {
    name: "Token B",
    symbol: "TKB",
    decimals: 6,
    chain: Chain.hardhat,
    address: "",
}

describe("DexWallet Unit Tests", () => {
    let deployer: Account
    let maker: Account
    let taker: Account
    let entryPoint: EntryPoint
    let dexWalletFactory: DexWalletFactory
    let tokenA: IERC20
    let tokenB: IERC20

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
        tokenA = await new MockERC20__factory(deployer.signer).deploy(
            TokenA.name,
            TokenA.symbol,
            TokenA.decimals,
            parseUnits("1000001", TokenA.decimals),
            deployer.address
        )
        tokenB = await new MockERC20__factory(deployer.signer).deploy(
            TokenB.name,
            TokenB.symbol,
            TokenB.decimals,
            parseUnits("2000002", TokenB.decimals),
            deployer.address
        )
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
            await tokenA.transfer(takerWallet.address, parseUnits("1001", TokenA.decimals))
            // Transfer some B tokens to maker's wallet
            await tokenB.transfer(makerWallet.address, parseUnits("1002", TokenB.decimals))

            // Maker signed the order
            const order: SwapTokenOrderStruct = {
                makerTokenIn: tokenA.address,
                makerAmountIn: parseUnits("11", TokenA.decimals),
                makerTokenOut: tokenB.address,
                makerAmountOut: parseUnits("12", TokenB.decimals),
                id: 0,
                expiry: (await getTimestamp()).add(60),
                chainId,
            }
            log("order: ")
            log(order)

            // Sign swap order
            const makerSig = await signSwapTokenOrder(order, maker.signer)

            expect(await makerWallet.orderUsed(0), "maker order has not been used").to.equal(false)
            expect(await takerWallet.orderUsed(0), "taker order has not been used").to.equal(false)
            expect(await makerWallet.isValidSwap(order, makerSig), "maker order is valid").to.equal(true)
            expect(await takerWallet.isValidSwap(order, makerSig), "taker order is invalid").to.equal(false)

            // Taker executes the swap
            const swapTx = await takerWallet.takeTokenSwap(order, makerWallet.address, makerSig)
            await logTxDetails(swapTx, "take swap")

            expect(await makerWallet.orderUsed(0), "maker order has been used").to.equal(true)
            expect(await takerWallet.orderUsed(0), "taker order has not been used").to.equal(false)
            expect(await makerWallet.isValidSwap(order, makerSig), "maker order is invalid").to.equal(false, makerSig)
            expect(await takerWallet.isValidSwap(order, makerSig), "taker order is invalid").to.equal(false, makerSig)
        })

        it("maker should buy tokens", async () => {
            const expectedBaseAmount = parseUnits("11", TokenA.decimals)
            const expectedQuoteAmount = parseUnits("10", TokenB.decimals)

            // Transfer some A tokens to taker's wallet
            await tokenA.transfer(takerWallet.address, parseUnits("1001", TokenA.decimals))
            // Transfer some B tokens to maker's wallet
            await tokenB.transfer(makerWallet.address, parseUnits("1002", TokenB.decimals))

            // exchange rate = quote * 1e18 / base
            const exchangeRate = expectedQuoteAmount.mul(parseUnits("1", TokenA.decimals)).div(expectedBaseAmount)
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

            const maxQuoteAmount = parseUnits("1002", TokenB.decimals)
            // base amount = quote amount * 1e18 / exchange rate
            const maxBaseAmount = maxQuoteAmount.mul(parseUnits("1", TokenA.decimals)).div(exchangeRate)
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
            const expectedBaseAmount = parseUnits("112", TokenA.decimals)
            const expectedQuoteAmount = parseUnits("111", TokenB.decimals)

            // Transfer some A tokens to taker's wallet
            await tokenA.transfer(makerWallet.address, expectedBaseAmount)
            // Transfer some B tokens to maker's wallet
            await tokenB.transfer(takerWallet.address, expectedQuoteAmount)

            // exchange rate = quote * 1e18 / base
            const exchangeRate = expectedQuoteAmount.mul(parseUnits("1", TokenA.decimals)).div(expectedBaseAmount)
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
            const maxQuoteAmount = maxBaseAmount.mul(exchangeRate).div(parseUnits("1", TokenA.decimals))
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
    describe("Exchange NFTs", () => {
        let makerWallet: DexWallet
        let takerWallet: DexWallet
        let mockNFT: MockNFT
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

            mockNFT = await new MockNFT__factory(deployer.signer).deploy("Mock NFT", "NFT")
            await mockNFT.mint(makerWallet.address)
            expect(await mockNFT.ownerOf(0), "maker owns NFT 0").to.eq(makerWallet.address)
            await mockNFT.mint(makerWallet.address)
            await mockNFT.mint(makerWallet.address)

            await mockNFT.mint(takerWallet.address)
            expect(await mockNFT.ownerOf(3), "taker owns NFT 3").to.eq(takerWallet.address)
            await mockNFT.mint(takerWallet.address)
            await mockNFT.mint(takerWallet.address)
        })
        it("maker should sell single NFT", async () => {
            // Transfer some A tokens to taker's wallet
            await tokenA.transfer(takerWallet.address, parseUnits("5", TokenA.decimals))

            expect(await mockNFT.ownerOf(1), "maker's wallet owns NFT 1 before").to.eq(makerWallet.address)
            expect(await mockNFT.balanceOf(makerWallet.address), "maker's wallet NFTs before").to.eq(3)
            expect(await mockNFT.balanceOf(takerWallet.address), "taker's wallet NFTs after").to.eq(3)

            // Maker signs NFT exchange
            const order: NFTUnitTokenOrderStruct = {
                exchangeType: ExchangeType.SELL,
                nft: mockNFT.address,
                tokenIds: [1],
                settleToken: tokenA.address,
                price: parseUnits("5", TokenA.decimals),
                id: 1,
                expiry: (await getTimestamp()).add(60),
                chainId,
            }
            const makerSig = await signNFTOrder(order, maker.signer)

            const tx = await takerWallet.takeNFTUnitTokenExchange(order, [1], makerWallet.address, makerSig)
            await logTxDetails(tx, "take sell NFT exchange")

            expect(await mockNFT.ownerOf(1), "taker owns NFT 1 after").to.eq(takerWallet.address)
            expect(await mockNFT.balanceOf(makerWallet.address), "maker's wallet NFTs after").to.eq(2)
            expect(await mockNFT.balanceOf(takerWallet.address), "taker's wallet NFTs after").to.eq(4)
        })

        it("maker should sell all 3 NFTs", async () => {
            // Transfer some A tokens to taker's wallet
            await tokenA.transfer(takerWallet.address, parseUnits("15.003", TokenA.decimals))

            expect(await mockNFT.ownerOf(0), "maker's wallet owns NFT 0 before").to.eq(makerWallet.address)
            expect(await mockNFT.ownerOf(1), "maker's wallet owns NFT 1 before").to.eq(makerWallet.address)
            expect(await mockNFT.ownerOf(2), "maker's wallet owns NFT 2 before").to.eq(makerWallet.address)
            expect(await mockNFT.balanceOf(makerWallet.address), "maker's wallet NFTs before").to.eq(3)
            expect(await mockNFT.balanceOf(takerWallet.address), "taker's wallet NFTs after").to.eq(3)

            // Maker signs NFT exchange
            const order: NFTUnitTokenOrderStruct = {
                exchangeType: ExchangeType.SELL,
                nft: mockNFT.address,
                tokenIds: [0, 1, 2],
                settleToken: tokenA.address,
                price: parseUnits("5.001", TokenA.decimals),
                id: 1,
                expiry: (await getTimestamp()).add(60),
                chainId,
            }
            const makerSig = await signNFTOrder(order, maker.signer)

            const tx = await takerWallet.takeNFTUnitTokenExchange(order, [0, 1, 2], makerWallet.address, makerSig)
            await logTxDetails(tx, "take sell 3 NFTs exchange")

            expect(await mockNFT.ownerOf(0), "taker owns NFT 0 after").to.eq(takerWallet.address)
            expect(await mockNFT.ownerOf(1), "taker owns NFT 1 after").to.eq(takerWallet.address)
            expect(await mockNFT.ownerOf(2), "taker owns NFT 2 after").to.eq(takerWallet.address)
            expect(await mockNFT.balanceOf(makerWallet.address), "maker's wallet NFTs after").to.eq(0)
            expect(await mockNFT.balanceOf(takerWallet.address), "taker's wallet NFTs after").to.eq(6)
        })

        it("maker should buy two NFTs", async () => {
            // Transfer some A tokens to taker's wallet
            await tokenA.transfer(makerWallet.address, parseUnits("10", TokenA.decimals))

            expect(await mockNFT.ownerOf(3), "taker's wallet owns NFT 3 before").to.eq(takerWallet.address)
            expect(await mockNFT.ownerOf(4), "taker's wallet owns NFT 4 before").to.eq(takerWallet.address)
            expect(await mockNFT.balanceOf(makerWallet.address), "maker's wallet NFTs before").to.eq(3)
            expect(await mockNFT.balanceOf(takerWallet.address), "taker's wallet NFTs after").to.eq(3)
            log(`makerWallet: ${makerWallet.address}`)
            log(`takerWallet: ${takerWallet.address}`)
            log(`deployer: ${deployer.address}`)
            log(`mockNFT: ${mockNFT.address}`)

            // Maker signs NFT exchange
            const order: NFTUnitTokenOrderStruct = {
                exchangeType: ExchangeType.BUY,
                nft: mockNFT.address,
                tokenIds: [3, 4, 5],
                settleToken: tokenA.address,
                price: parseUnits("5", TokenA.decimals),
                id: 1,
                expiry: (await getTimestamp()).add(60),
                chainId,
            }
            const makerSig = await signNFTOrder(order, maker.signer)

            const tx = await takerWallet.takeNFTUnitTokenExchange(order, [3, 4], makerWallet.address, makerSig)
            await logTxDetails(tx, "take buy 2 NFTs exchange")

            expect(await mockNFT.ownerOf(3), "maker owns NFT 1 after").to.eq(makerWallet.address)
            expect(await mockNFT.balanceOf(makerWallet.address), "maker's wallet NFTs after").to.eq(5)
            expect(await mockNFT.balanceOf(takerWallet.address), "taker's wallet NFTs after").to.eq(1)
        })
    })
})
