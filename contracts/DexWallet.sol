// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import { IEntryPoint, SimpleAccount } from "./account-abstraction/samples/SimpleAccount.sol";

struct SwapOrder {
    address tokenIn; // The token being transferred from the market maker to the wallet
    uint256 amountIn;
    address tokenOut; // The token being transferred from the wallet to the market maker.
    uint256 amountOut;
    uint256 nonce; // Nonce to identify the order so it can be cancelled and not replayed
    uint256 expiry; // Expiry in seconds since epoch
    uint256 chainid; // Chain ID of the network the order is to be executed on
    bytes signature;
}

enum ExchangeType {
    BUY,
    SELL
}
struct ExchangeOrder {
    ExchangeType exchangeType; // Buy or Sell of the base token relative to the wallet, which is the market maker.
    address baseToken; // The first token in the trading pair. eg WETH in WETH/USDC
    address quoteToken; // The second token in the trading pair. eg USDC in WETH/USDC
    uint256 exchangeRate; // Rate of exchange from base token to quote token scaled by 1e18. eg USDC = exchange rate * WETH / 1e18
    uint256 nonce; // Nonce to identify the order so it can be cancelled and not replayed
    uint256 expiry; // Expiry in seconds since epoch
    uint256 chainid; // Chain ID of the network the order is to be executed on
    bytes signature;
}

struct NFTOrder {
    ExchangeType exchangeType; // Buy or Sell of the NFTs relative to the wallet, which is the market maker.
    address nft; // The NFT contract address
    uint256[] tokenIds; // The NFT token ids that are being bought or sold.
    address settleToken; // The token the NFTs are being bought or sold for. eg WETH or USDC
    uint256 price; // Unit price of each NFT.
    uint256 nonce; // Nonce to identify the order so it can be cancelled and not replayed
    uint256 expiry; // Expiry in seconds since epoch
    uint256 chainid; // Chain ID of the network the order is to be executed on
    bytes signature;
}

contract DexWallet is SimpleAccount {
    using ECDSA for bytes32;
    using SafeERC20 for IERC20;

    // Reserve storage slots for fixed-sized, used nonces array.
    uint256 internal constant USED_NONCES_ARRAY_SIZE = 256;
    /// @notice Any order nonces equal to or greater than this value are invalid.
    /// @dev There are 256 bits in a uint256, so we can store 256 nonces in a single storage slot.
    uint256 public constant MAX_NONCE = 256 * USED_NONCES_ARRAY_SIZE;
    // This caps the number of nonces to MAX_NONCE but it's the most efficient way of storing bools.
    uint256[USED_NONCES_ARRAY_SIZE] usedNonces;

    event NonceUsed(uint256 nonce);

    constructor(IEntryPoint anEntryPoint) SimpleAccount(anEntryPoint) {}

    /// @notice Swaps a whole amount of tokens.
    function swapTokens(SwapOrder calldata order, address recipient) external {
        require(owner == _hashSwapOrder(order).recover(order.signature), "invalid signature");
        require(order.expiry < block.timestamp, "swap expired");
        require(order.chainid == block.chainid, "invalid chain");
        _checkNonce(order.nonce);

        IERC20(order.tokenIn).safeTransferFrom(msg.sender, address(this), order.amountIn);

        IERC20(order.tokenOut).safeTransfer(recipient, order.amountOut);
    }

    /// @notice Checks the following:
    /// - the order signature was signed by the wallet signer
    /// - the order has not expired
    /// - the swap has not already been executed
    /// - the swap has not been cancelled by the wallet owner
    /// - there is enough liquidity in the wallet to execute the swap
    /// @return valid true if the swap order is still valid.
    function isValidSwap(SwapOrder calldata order) external view returns (bool valid) {
        valid =
            owner == _hashSwapOrder(order).recover(order.signature) &&
            order.expiry < block.timestamp &&
            order.chainid == block.chainid &&
            !nonceUsed(order.nonce) &&
            IERC20(order.tokenOut).balanceOf(address(this)) >= order.amountOut;
    }

    /// @notice Exchanges a variable amount of tokens at a fixed rate.
    /// @param order The order to execute of type ExchangeOrder.
    /// @param baseAmount The amount of base tokens that are to be bought or sold.
    /// @param recipient The address to send the exchanged tokens to.
    function exchangeTokens(
        ExchangeOrder calldata order,
        uint256 baseAmount,
        address recipient
    ) external {
        require(owner == _hashExchangeOrder(order).recover(order.signature), "invalid signature");
        require(order.expiry < block.timestamp, "swap expired");
        require(order.chainid == block.chainid, "invalid chain");
        _checkNonce(order.nonce);

        if (order.exchangeType == ExchangeType.BUY) {
            // Transfer in the base token
            IERC20(order.baseToken).safeTransferFrom(msg.sender, address(this), baseAmount);

            // Transfer out the quote token
            IERC20(order.quoteToken).safeTransfer(
                recipient,
                (baseAmount * order.exchangeRate) / 1e18
            );
        } else {
            // Transfer in the quote token
            IERC20(order.quoteToken).safeTransferFrom(
                msg.sender,
                address(this),
                (baseAmount * order.exchangeRate) / 1e18
            );

            // Transfer out the base token
            IERC20(order.baseToken).safeTransfer(recipient, baseAmount);
        }
    }

    /// @notice Calculates the maximum amount of tokens that can be exchanged at a fixed rate.
    function maxExchange(
        ExchangeOrder calldata order
    ) external view returns (uint256 baseAmount, uint256 quoteAmount) {
        if (
            owner != _hashExchangeOrder(order).recover(order.signature) ||
            order.expiry >= block.timestamp ||
            order.chainid == block.chainid ||
            nonceUsed(order.nonce)
        ) {
            return (0, 0);
        }
        // quote amount = base amount * exchange rate / 1e18
        // base amount = quote amount * 1e18 / exchange rate
        if (order.exchangeType == ExchangeType.BUY) {
            quoteAmount = IERC20(order.quoteToken).balanceOf(address(this));
            baseAmount = (quoteAmount * 1e18) / order.exchangeRate;
        } else {
            baseAmount = IERC20(order.baseToken).balanceOf(address(this));
            quoteAmount = (baseAmount * order.exchangeRate) / 1e18;
        }
    }

    /// @notice Exchanges a set of NFTs at a fixed price.
    /// Once all the NFTs have been exchanged, the wallet owner needs to cancel the order if it has not already expired.
    /// If its a buy order and the wallet transfer the NFT, the order can be reexecuted if not expired or cancelled.
    /// @param order The order to execute of type NFTOrder.
    /// @param exchangeIds The token IDs the market taker wants to exchange. This can be a subset of what's in the order.
    /// @param recipient The address to send the settlement tokens if a Buy order, or NFTs if a Sell order.
    function exchangeNFTs(
        NFTOrder calldata order,
        uint256[] calldata exchangeIds,
        address recipient
    ) external {
        require(owner == _hashNFTOrder(order).recover(order.signature), "invalid signature");
        require(order.expiry < block.timestamp, "swap expired");
        require(order.chainid == block.chainid, "invalid chain");
        _checkNonce(order.nonce);

        uint256 nftLen = exchangeIds.length;

        if (order.exchangeType == ExchangeType.BUY) {
            for (uint256 i; i < nftLen; ) {
                // validate that the tokenId is in the order
                require(_inSet(order.tokenIds, exchangeIds[i]), "invalid id");

                // Transfer in the NFT
                IERC721(order.nft).safeTransferFrom(msg.sender, address(this), exchangeIds[i]);
                unchecked {
                    ++i;
                }
            }
        } else {
            for (uint256 i; i < nftLen; ) {
                // validate that the tokenId is in the order
                require(_inSet(order.tokenIds, exchangeIds[i]), "invalid id");

                // Transfer out the NFT
                IERC721(order.nft).safeTransferFrom(address(this), recipient, exchangeIds[i]);
                unchecked {
                    ++i;
                }
            }
        }

        uint256 settleAmount = nftLen * order.price;
        if (order.exchangeType == ExchangeType.BUY) {
            // Transfer out the settlement tokens
            IERC20(order.settleToken).safeTransfer(recipient, settleAmount);
        } else {
            // Transfer in the settlement tokens
            IERC20(order.settleToken).safeTransferFrom(msg.sender, address(this), settleAmount);
        }
    }

    function _inSet(uint256[] memory tokenIds, uint256 tokenId) internal pure returns (bool) {
        for (uint256 i; i < tokenIds.length; ) {
            if (tokenIds[i] == tokenId) {
                return true;
            }
            unchecked {
                ++i;
            }
        }
        return false;
    }

    function availableNfts(
        NFTOrder calldata order
    ) external view returns (uint256[] memory tokenIds) {
        if (
            owner != _hashNFTOrder(order).recover(order.signature) ||
            order.expiry >= block.timestamp ||
            order.chainid == block.chainid ||
            nonceUsed(order.nonce)
        ) {
            return tokenIds;
        }

        // Loop through each of the NFTs in the order and check if they can still be exchanged
        uint256 nftLen = order.tokenIds.length;
        uint256[] memory allTokenIds = new uint256[](nftLen);
        uint256 available = 0;
        if (order.exchangeType == ExchangeType.BUY) {
            // Check each of the NFTs to see if they are not yet owned by the wallet
            for (uint256 i; i < nftLen; ) {
                if (address(this) != IERC721(order.nft).ownerOf(tokenIds[i])) {
                    allTokenIds[i] = tokenIds[i];
                    unchecked {
                        ++available;
                    }
                }
                unchecked {
                    ++i;
                }
            }
        } else {
            // Check each of the NFTs to see if they are still owned by the wallet
            for (uint256 i; i < nftLen; ) {
                if (address(this) == IERC721(order.nft).ownerOf(tokenIds[i])) {
                    allTokenIds[i] = tokenIds[i];
                    unchecked {
                        ++available;
                    }
                }
                unchecked {
                    ++i;
                }
            }
        }

        // Copy the available NFTs into the returned tokenIds array
        // This just contains the available NFTs for the order.
        tokenIds = new uint256[](available);
        uint256 j = 0;
        for (uint256 i; i < nftLen; ) {
            if (allTokenIds[i] > 0) {
                tokenIds[j] = allTokenIds[i];
            }
            unchecked {
                ++i;
                ++j;
            }
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

    // TODO move to EIP-712 hashes so the signer can see what they are signing rather than just a hash
    function _hashSwapOrder(SwapOrder calldata order) internal pure returns (bytes32 hash) {
        hash = keccak256(
            abi.encodePacked(
                order.tokenIn,
                order.amountIn,
                order.tokenOut,
                order.amountOut,
                order.nonce,
                order.expiry,
                order.chainid
            )
        );
    }

    // TODO move to EIP-712 hashes so the signer can see what they are signing rather than just a hash
    function _hashExchangeOrder(ExchangeOrder calldata order) internal pure returns (bytes32 hash) {
        hash = keccak256(
            abi.encodePacked(
                order.exchangeType,
                order.baseToken,
                order.quoteToken,
                order.exchangeRate,
                order.nonce,
                order.expiry,
                order.chainid
            )
        );
    }

    function _hashNFTOrder(NFTOrder calldata order) internal pure returns (bytes32 hash) {
        hash = keccak256(
            abi.encodePacked(
                order.exchangeType,
                order.nft,
                order.tokenIds,
                order.settleToken,
                order.price,
                order.nonce,
                order.expiry,
                order.chainid
            )
        );
    }
}
