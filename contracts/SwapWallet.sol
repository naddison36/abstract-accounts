// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ECDSA } from  "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import { IEntryPoint, SimpleAccount } from  "./account-abstraction/samples/SimpleAccount.sol";

struct Order {
    address tokenIn;
    uint256 amountIn;
    address tokenOut;
    uint256 amountOut;
    uint256 nonce;
    uint256 expiry;
    bytes signature;
}

contract SwapWallet is SimpleAccount {
    using ECDSA for bytes32;
    using SafeERC20 for IERC20;

    uint256 constant internal USED_NONCES_ARRAY_SIZE = 256;
    // There are 256 bits in a uint256, so we can store 256 nonces in a single storage slot.
    uint256 constant public MAX_NONCE = 256 * USED_NONCES_ARRAY_SIZE;

    // This caps the number of nonces to MAX_NONCE but it's the most efficient way of storing bools.
    uint256[USED_NONCES_ARRAY_SIZE] usedNonces;

    constructor(IEntryPoint anEntryPoint) SimpleAccount(anEntryPoint) {}

    function swapTokens(Order calldata order, address recipient) external {
        require(owner == _hashOrder(order).recover(order.signature), "invalid signature");
        require(order.expiry < block.timestamp, "swap expired");
        _checkNonce(order.nonce);
        // Do we need to waste gas checking this?
        // require(recipient != address(this), "wash trading not allowed");

        IERC20(order.tokenIn).safeTransferFrom(msg.sender, address(this), order.amountIn);

        IERC20(order.tokenOut).safeTransfer(recipient, order.amountOut);
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
    }

    function _hashOrder(Order calldata order) internal pure returns (bytes32 hash) {
        hash = keccak256(abi.encodePacked(
            order.tokenIn,
            order.amountIn,
            order.tokenOut,
            order.amountOut,
            order.nonce,
            order.expiry
        ));
    }
}