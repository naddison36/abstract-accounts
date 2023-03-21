// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DexWallet.sol";

interface IDexWallet {
    function makeTokenSwap(SwapOrder calldata order, bytes calldata makerSignature) external;

    function makeTokensExchange(
        ExchangeOrder calldata order,
        uint256 baseAmount,
        bytes calldata signature
    ) external;

    function makeNFTUnitExchange(
        NFTUnitOrder calldata order,
        uint256[] calldata exchangeIds,
        bytes calldata makerSignature
    ) external;

    function makeNFTBundleExchange(
        NFTBundleOrder calldata order,
        uint256[] calldata exchangeIds,
        bytes calldata makerSignature
    ) external;

    function verifyTokens(uint256 orderId) external;

    function verifyNFTs(uint256 orderId) external;
}
