import "@nomiclabs/hardhat-ethers"
import "@nomicfoundation/hardhat-chai-matchers"
import "@typechain/hardhat"
import "hardhat-gas-reporter"
import "solidity-coverage"
import "hardhat-abi-exporter"
import "@nomiclabs/hardhat-etherscan"
import "ts-node/register"

import type { HardhatUserConfig } from "hardhat/types"

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
    solidity: {
        compilers: [
            {
                version: "0.8.19",
                settings: {
                    optimizer: { enabled: true, runs: 1000000 },
                    viaIR: true,
                },
            },
        ],
    },
    networks: {
        hardhat: {
            allowUnlimitedContractSize: true,
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
