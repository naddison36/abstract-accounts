import { Chain } from "./network"

export const contractNames = [
    "EntryPoint",
    "StackupPaymaster",
    "StackupBundler",
    "DexWallet",
    "DexWalletFactory",
    "SimpleAccountFactory",
    "SimpleAccount",
    "AbstractAccount",
] as const
export type ContractNames = (typeof contractNames)[number]

export const resolveNamedAddress = (contractName: ContractNames, chain: Chain): string | undefined => {
    // Common addresses across all chains
    switch (contractName) {
        case "EntryPoint":
            return "0x0576a174D229E3cFA37253523E645A78A0C91B57"
        default:
    }

    // Chain specific addresses
    if (chain === Chain.mainnet) {
        switch (contractName) {
            case "StackupPaymaster":
                return "0x6087C019C9495139AD9ED230173e8681DEe3FFF2"
            case "StackupBundler":
                return "0x9C98B1528C26Cf36E78527308c1b21d89baED700"
            default:
        }
    } else if (chain === Chain.polygon) {
        switch (contractName) {
            case "StackupPaymaster":
                return "0x474Ea64BEdDE53aaD1084210BD60eeF2989bF80f"
            case "StackupBundler":
                return "0x9C98B1528C26Cf36E78527308c1b21d89baED700"
            default:
        }
    } else if (chain === Chain.goerli) {
        switch (contractName) {
            case "StackupPaymaster":
                return "0x7122EDe4e3823387a69F42193baD1409BfD97AC8"
            case "StackupBundler":
                return "0xd6E857a2683e8dC995a4689AEB008Cf246220031"
            case "SimpleAccountFactory":
                return "0xb3fC33E6d541c65357157B95d31D215B8313f24B"
            case "SimpleAccount":
                return "0xe0625be84aA68B64bA4A97704111F66Aa4AaC358" // implementation
            case "DexWalletFactory":
                return "0xCe3e2dD6168a9D67c23E5DC8eAD65BaecE268102"
            case "DexWallet":
                return "0xC98aCf21bd12Ab1718d79B3A6caC481941c1E089" // implementation
            case "AbstractAccount":
                return "0xE89d184a63E0b78FDe1e372121fBb9C485Cd4C2d" // Proxied SimpleAccount
            default:
        }
    }
}
