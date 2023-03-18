import "@nomiclabs/hardhat-ethers"
import "@nomicfoundation/hardhat-chai-matchers"
import "@typechain/hardhat"
import "hardhat-gas-reporter"
import "solidity-coverage"
import "hardhat-abi-exporter"
import "@nomiclabs/hardhat-etherscan"
import "ts-node/register"

import { DexWallet__factory } from "./src/types/typechain"

import type { HardhatUserConfig } from "hardhat/types"

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
    solidity: {
        compilers: [
            {
                version: "0.8.17",
                settings: {
                    optimizer: { enabled: true, runs: 1000000 },
                    viaIR: false,
                },
            },
        ],
    },
    networks: {
        hardhat: {
            allowUnlimitedContractSize: false,
            initialBaseFeePerGas: 0,
        },
        local: { url: "http://localhost:8545" },
        anvil: { url: "http://localhost:8545" },
        goerli: {
            url: process.env.NODE_URL ?? "",
        },
        sepolia: {
            url: process.env.NODE_URL ?? "",
        },
        polygon: {
            url: process.env.NODE_URL ?? "",
        },
        mainnet: {
            url: process.env.NODE_URL ?? "",
        },
    },
    abiExporter: {
        path: "./dist/abis",
        clear: true,
        flat: true,
    },
    etherscan: {
        apiKey: process.env.ETHERSCAN_KEY,
    },
    gasReporter: {
        currency: "USD",
        gasPrice: 30,
        remoteContracts: [
            {
                abi: DexWallet__factory.abi,
                address: "0x32352F35E5Be22fC44C8930751F10B8618004F88",
                name: "Maker Wallet",
            },
            {
                abi: DexWallet__factory.abi,
                address: "0xb259c4363AFBBC34fE8EbD2fdf86cC1e22730648",
                name: "Taker Wallet",
            },
        ],
    },
    mocha: {
        timeout: 10000,
    },
    typechain: {
        outDir: "src/types/typechain",
        target: "ethers-v5",
    },
}

export default config
