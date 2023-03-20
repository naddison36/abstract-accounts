// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DexWallet.sol";

interface IDexWallet {
    function makeSwap(SwapOrder calldata order, bytes calldata makerSignature) external;

    function makeTokensExchange(
        ExchangeOrder calldata order,
        uint256 baseAmount,
        bytes calldata signature
    ) external;

    function makeNFTsExchange(
        NFTOrder calldata order,
        uint256[] calldata exchangeIds,
        bytes calldata makerSignature
    ) external;

    function verifyTokens(uint256 orderId) external;

    function verifyNFTs(uint256 orderId) external;
}
