import { DefenderRelayProvider, DefenderRelaySigner } from "defender-relay-client/lib/ethers"
import { Wallet } from "ethers"

import { impersonate } from "./fork"
import { logger } from "./logger"
import { ethereumAddress, privateKey } from "./regex"

import type { Speed } from "defender-relay-client"
import type { Signer } from "ethers"
import type { HardhatRuntimeEnvironment } from "hardhat/types"

import type { Account, HHSigner } from "../types"

const log = logger("signer")

export const getDefenderSigner = async (speed: Speed = "fast"): Promise<HHSigner> => {
    if (!process.env.DEFENDER_API_KEY || !process.env.DEFENDER_API_SECRET) {
        console.error("Defender env vars DEFENDER_API_KEY and/or DEFENDER_API_SECRET have not been set")
        process.exit(1)
    }
    if (!["safeLow", "average", "fast", "fastest"].includes(speed)) {
        console.error(`Defender Relay Speed param must be either 'safeLow', 'average', 'fast' or 'fastest'. Not "${speed}"`)
        process.exit(2)
    }
    const credentials = {
        apiKey: process.env.DEFENDER_API_KEY,
        apiSecret: process.env.DEFENDER_API_SECRET,
    }
    const provider = new DefenderRelayProvider(credentials)
    return new DefenderRelaySigner(credentials, provider, { speed })
}

let signerInstance: Signer

export const getSigner = async (hre: HardhatRuntimeEnvironment, speed: Speed = "fast", useCache = true, key?: string): Promise<Signer> => {
    // If already initiated a signer, just return the singleton instance
    if (useCache && signerInstance) return signerInstance

    const pk = key ?? process.env.PRIVATE_KEY
    if (pk) {
        if (!pk.match(privateKey)) {
            throw Error("Invalid format of private key")
        }
        signerInstance = new Wallet(pk, hre.ethers.provider)
        log(`Using signer ${await signerInstance.getAddress()} from private key`)
        return signerInstance
    }

    if (process.env.MNEMONIC) {
        signerInstance = Wallet.fromMnemonic(process.env.MNEMONIC).connect(hre.ethers.provider)
        log(`Using signer ${await signerInstance.getAddress()} from MNEMONIC env variable`)
        return signerInstance
    }

    // If IMPERSONATE environment variable has been set
    if (process.env.IMPERSONATE) {
        const address = process.env.IMPERSONATE
        if (!address.match(ethereumAddress)) {
            throw Error("Environment variable IMPERSONATE is an invalid Ethereum address")
        }
        log(`Impersonating account ${address} from IMPERSONATE environment variable`)
        signerInstance = await impersonate(address)
        return signerInstance
    }

    // If using Defender Relay and not a forked chain
    // this will work against test networks like Ropsten or Polygon's Mumbai
    if (process.env.DEFENDER_API_KEY && process.env.DEFENDER_API_SECRET) {
        signerInstance = (await getDefenderSigner(speed)) as Signer
        log(`Using Defender Relay signer ${await signerInstance.getAddress()}`)
        return signerInstance
    }

    const accounts = await hre.ethers.getSigners()
    signerInstance = accounts[0]
    log(`Using signer ${await signerInstance.getAddress()} from first account in hardhat config`)
    return signerInstance
}

export const getSignerAccount = async (hre: HardhatRuntimeEnvironment, speed: Speed = "fast"): Promise<Account> => {
    const signer = await getSigner(hre, speed)
    return {
        signer,
        address: await signer.getAddress(),
    }
}

export const account = async (signer: Signer): Promise<Account> => ({
    signer,
    address: await signer.getAddress(),
})
