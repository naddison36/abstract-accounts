// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DexWallet.sol";

interface IDexWallet {
    function makeTokenSwap(SwapTokenOrder calldata order, bytes calldata makerSignature) external;

    function makeTokensExchange(
        ExchangeOrder calldata order,
        uint256 baseAmount,
        bytes calldata signature
    ) external;

    function makeTokenExchange(
        ExchangeEthOrder calldata order,
        uint256 tokenAmount,
        bytes calldata signature
    ) external;

    function makeNFTUnitTokenExchange(
        NFTUnitTokenOrder calldata order,
        uint256[] calldata exchangeIds,
        bytes calldata makerSignature
    ) external;

    function makeNFTBundleTokenExchange(
        NFTBundleTokenOrder calldata order,
        uint256[] calldata exchangeIds,
        bytes calldata makerSignature
    ) external;

    function makeNFTUnitETHExchange(
        NFTUnitETHOrder calldata order,
        uint256[] calldata exchangeIds,
        bytes calldata makerSignature
    ) external;

    function makeNFTBundleETHExchange(
        NFTBundleETHOrder calldata order,
        uint256[] calldata exchangeIds,
        bytes calldata makerSignature
    ) external;

    function verifyTokens(uint256 orderId) external;

    function verifyNFTs(uint256 orderId) external;
}
