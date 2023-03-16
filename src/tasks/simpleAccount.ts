import { SimpleAccountAPI } from "@naddison36/account-abstraction-sdk"
import { utils } from "ethers"
import { hexlify, parseEther, parseUnits } from "ethers/lib/utils"
import { task, types } from "hardhat/config"

import { EntryPoint__factory, IERC20__factory, SimpleAccount__factory, SimpleAccountFactory__factory } from "../types/typechain"
import { verifyEtherscan } from "../utils/etherscan"
import { logger } from "../utils/logger"
import { getChain } from "../utils/network"
import { resolveAddress, resolveToken } from "../utils/resolvers"
import { getSigner, getSignerAccount } from "../utils/signer"
import { deployContract, logTxDetails } from "../utils/transaction"

import type { providers } from "ethers"

import type { SimpleAccountFactory } from "../types/typechain"

const log = logger("task:account")

task("account-factory-deploy", "Deploys a SimpleAccountFactory")
    .addOptionalParam("speed", "Defender Relayer speed param: 'safeLow' | 'average' | 'fast' | 'fastest'", "fast", types.string)
    .setAction(async (taskArgs, hre) => {
        const signer = await getSigner(hre, taskArgs.speed)
        const chain = getChain(hre)

        const constructorArguments = [resolveAddress("EntryPoint", chain)]
        const saf = await deployContract<SimpleAccountFactory>(
            new SimpleAccountFactory__factory(signer),
            "SimpleAccountFactory",
            constructorArguments
        )

        console.log(`New SimpleAccountFactory contract deployed to ${saf.address}`)
    })

task("account-create", "Deploys a new SimpleAccount using the factory")
    .addOptionalParam("salt", "Randomness for abstract wallet creation", 0, types.int)
    .addOptionalParam("speed", "Defender Relayer speed param: 'safeLow' | 'average' | 'fast' | 'fastest'", "fast", types.string)
    .setAction(async (taskArgs, hre) => {
        const owner = await getSignerAccount(hre, taskArgs.speed)
        const chain = getChain(hre)

        const factoryAddress = resolveAddress("SimpleAccountFactory", chain)

        const factory = SimpleAccountFactory__factory.connect(factoryAddress, owner.signer)
        const salt = taskArgs.salt !== undefined ? hexlify(taskArgs.salt) : utils.randomBytes(32)
        const tx = await factory.createAccount(owner.address, salt)
        await logTxDetails(tx, "Create SimpleAccount")

        const accountAddress: string = await factory.getAddress(owner.address, salt)
        const simpleAccount = SimpleAccount__factory.connect(accountAddress, owner.signer)
        console.log(`New SimpleAccount deployed to ${accountAddress}`)

        const initData = simpleAccount.interface.encodeFunctionData("initialize", [owner.address])
        const simpleAccountImplAddress = resolveAddress("SimpleAccount", chain)
        const constructorArguments = [simpleAccountImplAddress, initData]
        await verifyEtherscan(hre, {
            address: accountAddress,
            contract: "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy",
            constructorArguments,
        })
    })

task("account-address", "Gets the abstract account for the signer")
    .addOptionalParam("salt", "Randomness for abstract account wallets", 0, types.int)
    .setAction(async (taskArgs, hre) => {
        const owner = await getSignerAccount(hre)
        const chain = getChain(hre)

        const entryPointAddress = resolveAddress("EntryPoint", chain)

        const factoryAddress = resolveAddress("SimpleAccountFactory", chain)
        const walletAPI = new SimpleAccountAPI({
            provider: owner.signer.provider as providers.JsonRpcProvider,
            entryPointAddress,
            owner: owner.signer,
            factoryAddress,
            index: taskArgs.salt,
        })

        const signerWalletAddress = await walletAPI.getAccountAddress()
        console.log(`Signer abstract wallet address ${signerWalletAddress}`)
    })

task(
    "account-transfers",
    "Transfers native currency (eg ETH) or tokens from the abstract account to one or more accounts by directly calling the EntryPoint contract"
)
    .addParam(
        "tokens",
        'Common-separated list of token addresses or names. Use "ETH" if transferring native currency.',
        undefined,
        types.string,
        false
    )
    .addParam("accounts", "Common-separated list of addresses or names to receive native currency", undefined, types.string, false)
    .addParam("amounts", "Common-separated list of native currency amounts in ETH, not wei", undefined, types.string, false)
    .addOptionalParam("speed", "Defender Relayer speed param: 'safeLow' | 'average' | 'fast' | 'fastest'", "fast", types.string)
    .setAction(async (taskArgs, hre) => {
        const owner = await getSignerAccount(hre, taskArgs.speed)
        const chain = getChain(hre)

        const entryPointAddress = resolveAddress("EntryPoint", chain)

        const factoryAddress = resolveAddress("SimpleAccountFactory", chain)
        const walletAPI = new SimpleAccountAPI({
            provider: owner.signer.provider as providers.JsonRpcProvider,
            entryPointAddress,
            owner: owner.signer,
            factoryAddress,
        })

        const signerWalletAddress = await walletAPI.getAccountAddress()
        log(`Signer's abstract wallet ${signerWalletAddress}`)
        const nonce = await walletAPI.getNonce()
        log(`Signer's abstract wallet starting nonce: ${nonce}`)

        const tokens = taskArgs.tokens.split(",")
        const accounts = taskArgs.accounts.split(",")
        const amounts = taskArgs.amounts.split(",")
        if (tokens.length !== accounts.length || accounts.length !== amounts.length) {
            throw Error(`Number of tokens, accounts and amounts does not match: ${tokens.length}, ${accounts.length}, ${amounts.length}`)
        }
        const ops = []
        for (const [i, account] of accounts.entries()) {
            if (tokens[i] === "ETH") {
                ops.push(
                    await walletAPI.createSignedUserOp({
                        target: resolveAddress(account),
                        value: parseEther(amounts[i]),
                        data: "0x",
                        nonce: nonce.add(i),
                    })
                )
            } else {
                // A token transfer
                const token = resolveToken(tokens[i], chain)
                const tokenContract = IERC20__factory.connect(token.address, owner.signer)
                ops.push(
                    await walletAPI.createSignedUserOp({
                        target: resolveAddress(token.address),
                        data: tokenContract.interface.encodeFunctionData("transfer", [
                            resolveAddress(account),
                            parseUnits(amounts[i], token.decimals),
                        ]),
                        nonce: nonce.add(i),
                    })
                )
            }
        }

        const entryPoint = EntryPoint__factory.connect(entryPointAddress, owner.signer)
        const tx = await entryPoint.handleOps(ops, owner.address)
        await logTxDetails(
            tx,
            `Sent ${accounts.length} transfers to ${taskArgs.accounts} with amounts ${taskArgs.amounts} for tokens ${tokens}`
        )
    })

module.exports = {}
