// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import { IEntryPoint, SimpleAccount } from "./account-abstraction/samples/SimpleAccount.sol";

struct SwapOrder {
    address makerTokenIn; // The token being transferred from the market maker to the wallet
    uint256 makerAmountIn;
    address makerTokenOut; // The token being transferred from the wallet to the market maker.
    uint256 makerAmountOut;
    uint256 id; // Identify the order so it can be cancelled and not replayed
    uint256 expiry; // Expiry in seconds since epoch
    uint256 chainId; // Chain ID of the network the order is to be executed on
}
struct TokensVerify {
    address maker;
    address takerTokenIn;
    address takerTokenOut;
    uint128 takerAmountOut;
    uint128 takerBalanceIn;
}

enum ExchangeType {
    BUY,
    SELL
}
struct ExchangeOrder {
    ExchangeType exchangeType; // Buy or Sell of the base token relative to the wallet, which is the market maker.
    address baseToken; // The first token in the trading pair. eg WETH in WETH/USDC
    address quoteToken; // The second token in the trading pair. eg USDC in WETH/USDC
    uint256 exchangeRate; // Rate of exchange from base token to quote token scaled by 1e18. eg exchange rate = quote * 1e18 / base
    uint256 id; // Identify the order so it can be cancelled and not replayed
    uint256 expiry; // Expiry in seconds since epoch
    uint256 chainId; // Chain ID of the network the order is to be executed on
}

struct NFTOrder {
    ExchangeType exchangeType; // Buy or Sell of the NFTs relative to the wallet, which is the market maker.
    address nft; // The NFT contract address
    uint256[] tokenIds; // The NFT token ids that are being bought or sold.
    address settleToken; // The token the NFTs are being bought or sold for. eg WETH or USDC
    uint256 price; // Unit price of each NFT.
    uint256 id; // Identify the order so it can be cancelled and not replayed
    uint256 expiry; // Expiry in seconds since epoch
    uint256 chainId; // Chain ID of the network the order is to be executed on
}

struct NftVerify {
    address maker;
    address nft;
    address settleToken;
    uint256[] tokenIds;
    // the following fit in one slot
    ExchangeType exchangeType;
    uint120 price;
    uint128 settleAmtBal;
}

interface IDex {
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

contract DexWallet is SimpleAccount {
    using ECDSA for bytes32;
    using SafeERC20 for IERC20;

    // Reserve storage slots for fixed-sized, used order identifier array.
    uint256 internal constant USED_ID_ARRAY_SIZE = 4096;
    /// @notice Any order identifiers equal to or greater than this value are invalid.
    /// @dev There are 256 bits in a uint256, so we can store 256 identifier flags in a single storage slot.
    uint256 public constant MAX_ORDER_ID = 256 * USED_ID_ARRAY_SIZE;
    // This caps the number of orders to MAX_ORDER_ID but it's the most efficient way of storing bools.
    uint256[USED_ID_ARRAY_SIZE] usedOrderIds;

    mapping(bytes32 => TokensVerify) public tokenVerifiers;
    mapping(bytes32 => NftVerify) public nftVerifiers;

    event OrderUsed(uint256 id);

    constructor(IEntryPoint anEntryPoint) SimpleAccount(anEntryPoint) {}

    function initialize(address anOwner) external override initializer {
        _initialize(anOwner);
    }

    function takeSwap(
        SwapOrder calldata order,
        address maker,
        bytes calldata makerSignature
    ) external onlyOwner {
        // Save VerifySwap
        bytes32 verifyHash = _hashVerifier(maker, order.id);
        tokenVerifiers[verifyHash] = TokensVerify({
            maker: maker,
            takerTokenIn: order.makerTokenOut,
            takerTokenOut: order.makerTokenIn,
            takerAmountOut: SafeCast.toUint128(order.makerAmountIn),
            takerBalanceIn: SafeCast.toUint128(
                IERC20(order.makerTokenOut).balanceOf(address(this)) + order.makerAmountOut
            )
        });

        IDex(maker).makeSwap(order, makerSignature);
    }

    /// @notice Swaps a whole amount of tokens.
    function makeSwap(SwapOrder calldata order, bytes calldata makerSignature) external {
        require(owner == hashSwapOrder(order).recover(makerSignature), "invalid signature");
        require(block.timestamp < order.expiry, "swap expired");
        require(order.chainId == block.chainid, "invalid chain");
        _checkOrderId(order.id, true);

        // Transfer tokens from the maker to the taker
        IERC20(order.makerTokenOut).safeTransfer(msg.sender, order.makerAmountOut);

        uint256 tokenInBalance = IERC20(order.makerTokenIn).balanceOf(address(this));

        // Call taker to verify the swap and transfer their tokens
        IDex(msg.sender).verifyTokens(order.id);

        // Verify the taker transferred their tokens
        require(
            IERC20(order.makerTokenIn).balanceOf(address(this)) >=
                tokenInBalance + order.makerAmountIn,
            "taker did not transfer"
        );
    }

    /// @notice Swap taker verifies the maker tansferred the maker's tokens and
    /// sends the take's tokens to the maker.
    function verifyTokens(uint256 orderId) external {
        // get order details
        bytes32 hash = _hashVerifier(msg.sender, orderId);
        TokensVerify memory swap = tokenVerifiers[hash];
        delete tokenVerifiers[hash];

        // verify wallet has received tokens or ETH from the counterparty
        require(msg.sender == swap.maker, "invalid maker");
        require(
            IERC20(swap.takerTokenIn).balanceOf(address(this)) >= swap.takerBalanceIn,
            "maker did not transfer"
        );

        // Hook to do other processing. eg arbitrage
        _verifyTokenHook(swap);

        // transfer
        IERC20(swap.takerTokenOut).safeTransfer(swap.maker, swap.takerAmountOut);
    }

    function _verifyTokenHook(TokensVerify memory swap) internal virtual {}

    /// @notice Checks the following:
    /// - the order signature was signed by the wallet signer
    /// - the order has not expired
    /// - the swap has not already been executed
    /// - the swap has not been cancelled by the wallet owner
    /// - there is enough liquidity in the wallet to execute the swap
    /// @return valid true if the swap order is still valid.
    function isValidSwap(
        SwapOrder calldata order,
        bytes calldata makerSignature
    ) external view returns (bool valid) {
        valid =
            owner == hashSwapOrder(order).recover(makerSignature) &&
            block.timestamp < order.expiry &&
            order.chainId == block.chainid &&
            !orderUsed(order.id) &&
            IERC20(order.makerTokenOut).balanceOf(address(this)) >= order.makerAmountOut;
    }

    function takeTokensExchange(
        ExchangeOrder calldata order,
        uint256 baseAmount,
        address maker,
        bytes calldata makerSignature
    ) external onlyOwner {
        uint256 quoteAmount = (baseAmount * order.exchangeRate) / 1e18;
        // Save VerifySwap
        bytes32 verifyHash = _hashVerifier(maker, order.id);
        if (order.exchangeType == ExchangeType.BUY) {
            tokenVerifiers[verifyHash] = TokensVerify({
                maker: maker,
                takerTokenOut: order.baseToken,
                takerTokenIn: order.quoteToken,
                takerAmountOut: SafeCast.toUint128(baseAmount),
                takerBalanceIn: SafeCast.toUint128(
                    IERC20(order.quoteToken).balanceOf(address(this)) + quoteAmount
                )
            });
        } else {
            tokenVerifiers[verifyHash] = TokensVerify({
                maker: maker,
                takerTokenOut: order.quoteToken,
                takerTokenIn: order.baseToken,
                takerAmountOut: SafeCast.toUint128(quoteAmount),
                takerBalanceIn: SafeCast.toUint128(
                    IERC20(order.baseToken).balanceOf(address(this)) + baseAmount
                )
            });
        }

        IDex(maker).makeTokensExchange(order, baseAmount, makerSignature);
    }

    /// @notice Exchanges a variable amount of tokens at a fixed rate.
    /// @param order The order to execute of type ExchangeOrder.
    /// @param baseAmount The amount of base tokens that are to be bought or sold.
    function makeTokensExchange(
        ExchangeOrder calldata order,
        uint256 baseAmount,
        bytes calldata signature
    ) external {
        require(owner == hashExchangeOrder(order).recover(signature), "invalid signature");
        require(block.timestamp < order.expiry, "swap expired");
        require(order.chainId == block.chainid, "invalid chain");
        _checkOrderId(order.id, false);

        address tokenIn;
        uint256 amountIn;
        uint256 quoteAmount = (baseAmount * order.exchangeRate) / 1e18;
        if (order.exchangeType == ExchangeType.BUY) {
            tokenIn = order.baseToken;
            amountIn = baseAmount;

            // Transfer out the quote token
            IERC20(order.quoteToken).safeTransfer(msg.sender, quoteAmount);
        } else {
            // Transfer out the base token
            IERC20(order.baseToken).safeTransfer(msg.sender, baseAmount);

            tokenIn = order.quoteToken;
            amountIn = quoteAmount;
        }

        uint256 tokenInBalance = IERC20(tokenIn).balanceOf(address(this));

        // Call taker to verify the swap and transfer their tokens
        IDex(msg.sender).verifyTokens(order.id);

        // Verify the taker transferred their tokens
        require(
            IERC20(tokenIn).balanceOf(address(this)) >= tokenInBalance + amountIn,
            "taker did not transfer"
        );
    }

    /// @notice Calculates the maximum amount of tokens that can be exchanged at a fixed rate.
    function maxTokensExchange(
        ExchangeOrder calldata order
    ) external view returns (uint256 baseAmount, uint256 quoteAmount) {
        if (
            block.timestamp >= order.expiry || order.chainId != block.chainid || orderUsed(order.id)
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

    function takeNFTsExchange(
        NFTOrder calldata order,
        uint256[] calldata exchangeIds,
        address maker,
        bytes calldata makerSignature
    ) external {
        // Save NFT Exchange details for later verification
        bytes32 verifyHash = _hashVerifier(maker, order.id);
        if (order.exchangeType == ExchangeType.BUY) {
            nftVerifiers[verifyHash] = NftVerify({
                maker: maker,
                nft: order.nft,
                settleToken: order.settleToken,
                tokenIds: exchangeIds,
                exchangeType: order.exchangeType,
                price: SafeCast.toUint120(order.price),
                settleAmtBal: SafeCast.toUint128(
                    IERC20(order.settleToken).balanceOf(address(this)) +
                        (exchangeIds.length * order.price)
                )
            });
        } else {
            nftVerifiers[verifyHash] = NftVerify({
                maker: maker,
                nft: order.nft,
                settleToken: order.settleToken,
                tokenIds: exchangeIds,
                exchangeType: order.exchangeType,
                price: SafeCast.toUint120(order.price),
                settleAmtBal: SafeCast.toUint128(exchangeIds.length * order.price)
            });
        }

        IDex(maker).makeNFTsExchange(order, exchangeIds, makerSignature);
    }

    /// @notice Exchanges a set of NFTs at a fixed price.
    /// Once all the NFTs have been exchanged, the wallet owner needs to cancel the order if it has not already expired.
    /// If its a buy order and the wallet transfer the NFT, the order can be reexecuted if not expired or cancelled.
    /// @param order The order to execute of type NFTOrder.
    /// @param exchangeIds The token IDs the market taker wants to exchange. This can be a subset of what's in the order.
    function makeNFTsExchange(
        NFTOrder calldata order,
        uint256[] calldata exchangeIds,
        bytes calldata makerSignature
    ) external {
        require(owner == hashNFTOrder(order).recover(makerSignature), "invalid signature");
        require(block.timestamp < order.expiry, "swap expired");
        require(order.chainId == block.chainid, "invalid chain");
        _checkOrderId(order.id, false);

        uint256 nftLen = exchangeIds.length;
        uint256 settleBalance;

        if (order.exchangeType == ExchangeType.BUY) {
            unchecked {
                for (uint256 i; i < nftLen; ++i) {
                    // validate that the tokenId is in the order
                    require(_inSet(order.tokenIds, exchangeIds[i]), "invalid id");
                }
            }

            // Transfer out the settlement tokens
            IERC20(order.settleToken).safeTransfer(msg.sender, nftLen * order.price);
        } else {
            unchecked {
                for (uint256 i; i < nftLen; ++i) {
                    // validate that the tokenId is in the order
                    require(_inSet(order.tokenIds, exchangeIds[i]), "invalid id");

                    // Transfer out the NFT
                    IERC721(order.nft).safeTransferFrom(address(this), msg.sender, exchangeIds[i]);

                    settleBalance = IERC20(order.settleToken).balanceOf(address(this));
                }
            }
        }

        // Call taker to verify the the maker transferred to the taker and
        // the taker to transfer to the maker.
        IDex(msg.sender).verifyNFTs(order.id);

        if (order.exchangeType == ExchangeType.BUY) {
            // Verify the taker transferred the NFTs
            unchecked {
                for (uint256 i; i < nftLen; ++i) {
                    require(
                        IERC721(order.nft).ownerOf(exchangeIds[i]) == address(this),
                        "taker did not transfer"
                    );
                }
            }
        } else {
            // Verify the taker transferred the settlement tokens
            require(
                IERC20(order.settleToken).balanceOf(address(this)) >=
                    settleBalance + (nftLen * order.price),
                "taker did not transfer"
            );
        }
    }

    function verifyNFTs(uint256 orderId) external {
        // get order details
        bytes32 hash = _hashVerifier(msg.sender, orderId);
        NftVerify memory verifyData = nftVerifiers[hash];
        delete nftVerifiers[hash];

        // verify wallet has received tokens, ETH or NFTs from the counterparty
        require(msg.sender == verifyData.maker, "invalid maker");
        if (verifyData.exchangeType == ExchangeType.BUY) {
            // Verify the maker transferred the settlement tokens
            require(
                IERC20(verifyData.settleToken).balanceOf(address(this)) >= verifyData.settleAmtBal,
                "maker did not transfer"
            );

            // Hook to do other processing. eg arbitrage
            _verifyNFTsHook(verifyData);

            // Transfer out each of the exchanged NFTs
            uint256 nftLen = verifyData.tokenIds.length;
            for (uint256 i; i < nftLen; ++i) {
                IERC721(verifyData.nft).safeTransferFrom(
                    address(this),
                    msg.sender,
                    verifyData.tokenIds[i]
                );
            }
        } else {
            // Verify the maker transferred the NFTs
            uint256 exchangeIdLen = verifyData.tokenIds.length;
            unchecked {
                for (uint256 i; i < exchangeIdLen; ++i) {
                    require(
                        IERC721(verifyData.nft).ownerOf(verifyData.tokenIds[i]) == address(this),
                        "maker did not transfer"
                    );
                }
            }

            // Hook to do other processing. eg arbitrage
            _verifyNFTsHook(verifyData);

            // Transfer out the settlement tokens
            IERC20(verifyData.settleToken).safeTransfer(verifyData.maker, verifyData.settleAmtBal);
        }
    }

    function _verifyNFTsHook(NftVerify memory verifyData) internal {}

    function _inSet(uint256[] memory tokenIds, uint256 tokenId) internal pure returns (bool) {
        unchecked {
            for (uint256 i; i < tokenIds.length; ++i) {
                if (tokenIds[i] == tokenId) {
                    return true;
                }
            }
        }
        return false;
    }

    function availableNFTs(
        NFTOrder calldata order
    ) external view returns (uint256[] memory tokenIds) {
        if (
            block.timestamp >= order.expiry || order.chainId == block.chainid || orderUsed(order.id)
        ) {
            return tokenIds;
        }

        unchecked {
            // Loop through each of the NFTs in the order and check if they can still be exchanged
            uint256 nftLen = order.tokenIds.length;
            uint256[] memory allTokenIds = new uint256[](nftLen);
            uint256 available = 0;
            if (order.exchangeType == ExchangeType.BUY) {
                // Check each of the NFTs to see if they are not yet owned by the wallet
                for (uint256 i; i < nftLen; ++i) {
                    if (address(this) != IERC721(order.nft).ownerOf(tokenIds[i])) {
                        allTokenIds[i] = tokenIds[i];
                        ++available;
                    }
                }
            } else {
                // Check each of the NFTs to see if they are still owned by the wallet
                for (uint256 i; i < nftLen; ++i) {
                    if (address(this) == IERC721(order.nft).ownerOf(tokenIds[i])) {
                        allTokenIds[i] = tokenIds[i];
                        ++available;
                    }
                }
            }

            // Copy the available NFTs into the returned tokenIds array
            // This just contains the available NFTs for the order.
            tokenIds = new uint256[](available);
            uint256 j = 0;
            for (uint256 i; i < nftLen; ++i) {
                if (allTokenIds[i] > 0) {
                    tokenIds[j] = allTokenIds[i];
                }
                ++j;
            }
        }
    }

    /// @notice check if the order identifier has been used before or cancelled.
    /// If not, mark the id as being used.
    function _checkOrderId(uint256 id, bool update) internal {
        require(id < MAX_ORDER_ID, "id too high");
        uint256 arrayIndex = id / 256;
        uint256 slotIndex = id % 256;

        uint256 slotData = usedOrderIds[arrayIndex];
        require((slotData >> slotIndex) & 1 == 0, "id already used");

        if (update) {
            // Update the order id flag in storage
            usedOrderIds[arrayIndex] = slotData | (1 << slotIndex);

            emit OrderUsed(id);
        }
    }

    /// @return used true if the order has already been used in a swap or was cancelled.
    function orderUsed(uint256 id) public view returns (bool used) {
        require(id < MAX_ORDER_ID, "id too high");
        uint256 arrayIndex = id / 256;
        uint256 slotIndex = id % 256;

        used = (usedOrderIds[arrayIndex] >> slotIndex) & 1 == 1;
    }

    function cancelSwap(uint256 id) external onlyOwner {
        _checkOrderId(id, true);
    }

    // TODO move to EIP-712 hashes so the signer can see what they are signing rather than just a hash
    function hashSwapOrder(SwapOrder calldata order) public pure returns (bytes32 hash) {
        hash = keccak256(
            abi.encodePacked(
                order.makerTokenIn,
                order.makerAmountIn,
                order.makerTokenOut,
                order.makerAmountOut,
                order.id,
                order.expiry,
                order.chainId
            )
        ).toEthSignedMessageHash();
    }

    // TODO move to EIP-712 hashes so the signer can see what they are signing rather than just a hash
    function hashExchangeOrder(ExchangeOrder calldata order) public pure returns (bytes32 hash) {
        hash = keccak256(
            abi.encodePacked(
                order.exchangeType,
                order.baseToken,
                order.quoteToken,
                order.exchangeRate,
                order.id,
                order.expiry,
                order.chainId
            )
        ).toEthSignedMessageHash();
    }

    function hashNFTOrder(NFTOrder calldata order) public pure returns (bytes32 hash) {
        hash = keccak256(
            abi.encodePacked(
                order.exchangeType,
                order.nft,
                order.tokenIds,
                order.settleToken,
                order.price,
                order.id,
                order.expiry,
                order.chainId
            )
        ).toEthSignedMessageHash();
    }

    function _hashVerifier(address maker, uint256 orderId) internal pure returns (bytes32 hash) {
        hash = keccak256(abi.encode(maker, orderId));
    }
}
