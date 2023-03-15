// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ECDSA } from  "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import { IEntryPoint, SimpleAccount } from  "./account-abstraction/samples/SimpleAccount.sol";

struct SwapOrder {
    address tokenIn;    // The token being transferred from the market maker to the wallet
    uint256 amountIn;   
    address tokenOut;   // The token being transferred from the wallet to the market maker.
    uint256 amountOut;
    uint256 nonce;  // Nonce to identify the order so it can be cancelled and not replayed
    uint256 expiry; // Expiry in seconds since epoch
    bytes signature;
}

enum ExchangeType {
    BUY,
    SELL
}
struct ExchangeOrder {
    ExchangeType exchangeType;  // Buy or Sell of the base token relative to the wallet, which is the market maker.
    address baseToken;      // The first token in the trading pair. eg WETH in WETH/USDC
    address quoteToken;     // The second token in the trading pair. eg USDC in WETH/USDC
    uint256 exchangeRate;   // Rate of exchange from base token to quote token scaled by 1e18. eg USDC = exchange rate * WETH / 1e18
    uint256 nonce;          // Nonce to identify the order so it can be cancelled and not replayed
    uint256 expiry;         // Expiry in seconds since epoch
    bytes signature;
}

contract DexWallet is SimpleAccount {
    using ECDSA for bytes32;
    using SafeERC20 for IERC20;

    uint256 constant internal USED_NONCES_ARRAY_SIZE = 256;
    // There are 256 bits in a uint256, so we can store 256 nonces in a single storage slot.
    uint256 constant public MAX_NONCE = 256 * USED_NONCES_ARRAY_SIZE;

    // This caps the number of nonces to MAX_NONCE but it's the most efficient way of storing bools.
    uint256[USED_NONCES_ARRAY_SIZE] usedNonces;

    event NonceUsed(uint256 nonce);

    constructor(IEntryPoint anEntryPoint) SimpleAccount(anEntryPoint) {}

    /// @notice Swaps a whole amount of tokens.
    function swapTokens(SwapOrder calldata order, address recipient) external {
        require(owner == _hashSwapOrder(order).recover(order.signature), "invalid signature");
        require(order.expiry < block.timestamp, "swap expired");
        _checkNonce(order.nonce);

        IERC20(order.tokenIn).safeTransferFrom(msg.sender, address(this), order.amountIn);

        IERC20(order.tokenOut).safeTransfer(recipient, order.amountOut);
    }

    /// @notice Exchanges a variable amount of tokens at a fixed rate.
    function exchangeTokens(ExchangeOrder calldata order, uint256 baseAmount, address recipient) external {
        require(owner == _hashExchangeOrder(order).recover(order.signature), "invalid signature");
        require(order.expiry < block.timestamp, "swap expired");
        _checkNonce(order.nonce);

        if (order.exchangeType == ExchangeType.BUY) {
            // Transfer in the base token
            IERC20(order.baseToken).safeTransferFrom(msg.sender, address(this), baseAmount);

            // Transfer out the quote token
            IERC20(order.quoteToken).safeTransfer(recipient, baseAmount * order.exchangeRate / 1e18);
        } else {
            // Transfer in the quote token
            IERC20(order.quoteToken).safeTransferFrom(msg.sender, address(this), baseAmount * order.exchangeRate / 1e18);

            // Transfer out the base token
            IERC20(order.baseToken).safeTransfer(recipient, baseAmount);
        }
    }

    /// @notice Calculates the maximum amount of tokens that can be exchanged at a fixed rate.
    // TODO can remove signature from order to save gas if this view function is being used in a transaction
    function maxExchange(ExchangeOrder calldata order) external view returns (uint256 baseAmount, uint256 quoteAmount) {
        if (nonceUsed(order.nonce) || order.expiry >= block.timestamp) {
            return (0, 0);
        }
        // quote amount = base amount * exchange rate / 1e18
        // base amount = quote amount * 1e18 / exchange rate
        if (order.exchangeType == ExchangeType.BUY) {
            quoteAmount = IERC20(order.quoteToken).balanceOf(address(this));
            baseAmount = quoteAmount * 1e18 / order.exchangeRate;
        } else {
            baseAmount = IERC20(order.baseToken).balanceOf(address(this));
            quoteAmount = baseAmount * order.exchangeRate / 1e18;
        }
    }

    /// @notice check if the nonce has been used before.
    /// If not, mark the nonce as being used.
    function _checkNonce(uint256 nonce) internal {
        require(nonce < MAX_NONCE, "nonce too high");
        uint256 arrayIndex = nonce / 256;
        uint256 slotIndex = nonce % 256;
        
        uint256 slotData = usedNonces[arrayIndex];
        require((slotData >> slotIndex) & 1 == 1, "nonce already used");

        // Update the nonce flag in storage
        usedNonces[arrayIndex] = slotData | (1 << slotIndex);

        emit NonceUsed(nonce);
    }

    /// @return used true if the nonce has already been used in a swap or was cancelled.
    function nonceUsed(uint256 nonce) public view returns (bool used) {
        require(nonce < MAX_NONCE, "nonce too high");
        uint256 arrayIndex = nonce / 256;
        uint256 slotIndex = nonce % 256;

        used = (usedNonces[arrayIndex] >> slotIndex) & 1 == 1;
    }

    function cancelSwap(uint256 nonce) external onlyOwner {
        require(nonce < MAX_NONCE, "nonce too high");
        uint256 arrayIndex = nonce / 256;
        uint256 slotIndex = nonce % 256;

        // Update the nonce flag in storage
        usedNonces[arrayIndex] = usedNonces[arrayIndex] | (1 << slotIndex);

        emit NonceUsed(nonce);
    }

    function _hashSwapOrder(SwapOrder calldata order) internal pure returns (bytes32 hash) {
        hash = keccak256(abi.encodePacked(
            order.tokenIn,
            order.amountIn,
            order.tokenOut,
            order.amountOut,
            order.nonce,
            order.expiry
        ));
    }

    function _hashExchangeOrder(ExchangeOrder calldata order) internal pure returns (bytes32 hash) {
        hash = keccak256(abi.encodePacked(
            order.exchangeType,
            order.baseToken,
            order.quoteToken,
            order.exchangeRate,
            order.nonce,
            order.expiry
        ));
    }
}
