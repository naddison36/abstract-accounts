import { ERC4337EthersProvider, HttpRpcClient, SimpleAccountAPI } from "@naddison36/account-abstraction-sdk"
import { utils } from "ethers"
import { hexlify } from "ethers/lib/utils"
import { task, types } from "hardhat/config"

import { EntryPoint__factory, IERC20__factory, SimpleAccount__factory, SimpleAccountFactory__factory } from "../types/typechain"
import { verifyEtherscan } from "../utils/etherscan"
import { getChain } from "../utils/network"
import { resolveAddress } from "../utils/resolvers"
import { getSigner, getSignerAccount } from "../utils/signer"
import { gWETH } from "../utils/tokens"
import { deployContract, logTxDetails } from "../utils/transaction"

import type { BigNumber, providers } from "ethers"

import type { SimpleAccountFactory } from "../types/typechain"

task("account-factory-deploy", "Deploys a SimpleAccountFactory")
    .addOptionalParam("speed", "Defender Relayer speed param: 'safeLow' | 'average' | 'fast' | 'fastest'", "fast", types.string)
    .setAction(async (taskArgs, hre) => {
        const signer = await getSigner(hre, taskArgs.speed)
        const chain = getChain(hre)

        const constructorArguments = [resolveAddress("EntryPoint", chain)]
        await deployContract<SimpleAccountFactory>(new SimpleAccountFactory__factory(signer), "SimpleAccountFactory", constructorArguments)
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

task("ops-transfer-eth", "Transfers native currency by directly calling the EntryPoint contract")
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
        console.log(`Signer's abstract wallet ${signerWalletAddress}`)

        const op1 = await walletAPI.createSignedUserOp({
            target: owner.address,
            value: utils.parseEther("0.1"),
            data: "0x",
        })
        const op2 = await walletAPI.createSignedUserOp({
            target: "0xf7749B41db006860cEc0650D18b8013d69C44Eeb",
            value: utils.parseEther("0.2"),
            data: "0x",
        })
        const nonce1 = (await op1.nonce) as BigNumber
        console.log(`op1 nonce ${nonce1.toString()}`)
        const nonce2 = (await op1.nonce) as BigNumber
        console.log(`op2 nonce ${nonce2.toString()}`)

        const entryPoint = EntryPoint__factory.connect(entryPointAddress, owner.signer)
        const tx = await entryPoint.handleOps([op1, op2], owner.address)
        await logTxDetails(tx, "Bundled two ETH transfers")
    })

task("bundle-transfer-eth", "Transfers from native currency from abstract account to signer")
    .addOptionalParam("speed", "Defender Relayer speed param: 'safeLow' | 'average' | 'fast' | 'fastest'", "fast", types.string)
    .setAction(async (taskArgs, hre) => {
        const owner = await getSignerAccount(hre, taskArgs.speed)
        const chain = getChain(hre)
        console.log(`Signer address ${owner.address}`)

        const walletAddress = "0xD8887E0CE3939364787Add726F2609584AD8048D"
        const factoryAddress = resolveAddress("SimpleAccountFactory", chain)
        const entryPointAddress = resolveAddress("EntryPoint", chain)
        const entryPoint = EntryPoint__factory.connect(entryPointAddress, owner.signer)

        const config = {
            chainId: chain,
            entryPointAddress,
            bundlerUrl: "https://node.stackup.sh/v1/rpc/8aee25fd560c79fd5992571112a004b54e901f1b8d58be8405bcac0cef681c0e",
            walletAddress,
        }

        const httpRpcClient = new HttpRpcClient(config.bundlerUrl, config.entryPointAddress, chain)
        // const simpleAccount = SimpleAccountFactory__factory.connect(walletAddress, owner.signer)

        const smartAccountAPI = new SimpleAccountAPI({
            provider: owner.signer.provider as providers.JsonRpcProvider,
            entryPointAddress: entryPointAddress,
            owner: owner.signer,
            factoryAddress,
        })

        const aaProvider = new ERC4337EthersProvider(
            chain,
            config,
            owner.signer,
            owner.signer.provider as providers.JsonRpcProvider,
            httpRpcClient,
            entryPoint,
            smartAccountAPI
        )
        await aaProvider.init()
        // const aaSigner = new ERC4337EthersSigner(config, owner.signer, aaProvider, httpRpcClient, smartAccountAPI)

        console.log(`aa wallet ${await smartAccountAPI.getAccountAddress()}`)
        // const aaProvider = await wrapProvider(owner.signer.provider as providers.JsonRpcProvider, config, owner.signer)

        const signerWalletAddress = await aaProvider.getSigner().getAddress()
        console.log(`aa wallet ${signerWalletAddress}`)

        const weth = IERC20__factory.connect(gWETH.address, aaProvider.getSigner())
        await weth.transfer(owner.address, utils.parseEther("0.1"))

        // await aaProvider.sendTransaction({ to: owner.address, value: utils.parseEther('0.1'), data: '0x' })
    })

module.exports = {}
