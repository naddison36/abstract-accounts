import "@nomiclabs/hardhat-ethers"
import "@typechain/hardhat"
import "ts-node/register"

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
                    viaIR: true,
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
    mocha: {
        timeout: 10000,
    },
    typechain: {
        outDir: "src/types/typechain",
        target: "ethers-v5",
    },
}

export default config
