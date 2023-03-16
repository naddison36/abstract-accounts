import { utils } from "ethers"
import { hexlify } from "ethers/lib/utils"
import { task, types } from "hardhat/config"

import { DexWallet__factory, DexWalletFactory__factory } from "../types/typechain"
import { verifyEtherscan } from "../utils/etherscan"
import { logger } from "../utils/logger"
import { getChain } from "../utils/network"
import { resolveAddress } from "../utils/resolvers"
import { getSigner, getSignerAccount } from "../utils/signer"
import { deployContract, logTxDetails } from "../utils/transaction"

import type { DexWalletFactory } from "../types/typechain"

const log = logger("task:dex-wallet")

task("dex-wallet-factory-deploy", "Deploys a DexWalletFactory")
    .addOptionalParam("speed", "Defender Relayer speed param: 'safeLow' | 'average' | 'fast' | 'fastest'", "fast", types.string)
    .setAction(async (taskArgs, hre) => {
        const signer = await getSigner(hre, taskArgs.speed)
        const chain = getChain(hre)

        const constructorArguments = [resolveAddress("EntryPoint", chain)]
        const dwf = await deployContract<DexWalletFactory>(new DexWalletFactory__factory(signer), "DexWalletFactory", constructorArguments)

        console.log(`New DexWalletFactory deployed to ${dwf.address}`)

        await verifyEtherscan(hre, {
            address: dwf.address,
            contract: "contracts/DexWalletFactory.sol:DexWalletFactory",
            constructorArguments,
        })
    })

task("dex-wallet-verify", "Verified on Etherscan the DexWallet contract deployed by the DexWalletFactory")
    .addParam(
        "address",
        "Address of the DexWallet contract created when the DexWalletFactory contract was deployed",
        undefined,
        types.string,
        false
    )
    .setAction(async (taskArgs, hre) => {
        const chain = getChain(hre)

        const constructorArguments = [resolveAddress("EntryPoint", chain)]

        await verifyEtherscan(hre, {
            address: taskArgs.address,
            contract: "contracts/DexWallet.sol:DexWallet",
            constructorArguments,
        })
    })

task("dex-wallet-create", "Deploys a new DexWallet using the factory")
    .addOptionalParam("salt", "Randomness for abstract wallet creation", 0, types.int)
    .addOptionalParam("speed", "Defender Relayer speed param: 'safeLow' | 'average' | 'fast' | 'fastest'", "fast", types.string)
    .setAction(async (taskArgs, hre) => {
        const owner = await getSignerAccount(hre, taskArgs.speed)
        const chain = getChain(hre)

        const factoryAddress = resolveAddress("DexWalletFactory", chain)

        const factory = DexWalletFactory__factory.connect(factoryAddress, owner.signer)
        const salt = taskArgs.salt !== undefined ? hexlify(taskArgs.salt) : utils.randomBytes(32)
        const tx = await factory.createAccount(owner.address, salt)
        await logTxDetails(tx, "Create DexWallet")

        const accountAddress: string = await factory.getAddress(owner.address, salt)
        const DexWallet = DexWallet__factory.connect(accountAddress, owner.signer)
        console.log(`New DexWallet deployed to ${accountAddress}`)

        const initData = DexWallet.interface.encodeFunctionData("initialize", [owner.address])
        const DexWalletImplAddress = resolveAddress("DexWallet", chain)
        const constructorArguments = [DexWalletImplAddress, initData]
        await verifyEtherscan(hre, {
            address: accountAddress,
            contract: "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy",
            constructorArguments,
        })
    })

module.exports = {}
