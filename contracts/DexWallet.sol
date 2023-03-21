// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import { IEntryPoint, SimpleAccount } from "./account-abstraction/samples/SimpleAccount.sol";
import { IDexWallet } from "./IDexWallet.sol";

enum ExchangeType {
    BUY,
    SELL
}

/**
 * @notice Swaps a whole amount of tokens for another whole amoutn of token.
 * Is from the perspective of the market maker, so tokens `in` are from the taker to the maker, `out` is from the maker to the taker.
 * This is what the market maker hashes and signs to authorise the execution of the token swap.
 * @param makerTokenIn The token being transferred from the market taker to the marker maker's wallet.
 * @param makerAmountIn The amount of tokens being transferred from the market taker to the market maker's wallet.
 * @param makerTokenOut The token being transferred from the market maker's wallet to the market taker.
 * @param makerAmountOut The amount of tokens being transferred from the market maker's wallet to the market maker.
 * @param id Identify the order so it can be cancelled and not replayed.
 * @param expiry Expiry in seconds since epoch.
 * @param chainId Chain ID of the network the order is to be executed on.
 */
struct SwapOrder {
    address makerTokenIn;
    uint256 makerAmountIn;
    address makerTokenOut;
    uint256 makerAmountOut;
    uint256 id;
    uint256 expiry;
    uint256 chainId;
}
/**
 * @notice What the market taker stores between calling the market maker and waiting to be called back to verify the token swap or exchange.
 * This is from the perspective of the market taker, so tokens `in` are from the maker to the taker, `out` is from the taker to the maker.
 * @param maker The address of the market maker's wallet.
 * @param takerTokenIn The token being transferred from the market taker to the marker taker's wallet.
 * @param takerTokenOut The token being transferred from the market taker's wallet to the market maker.
 * @param takerAmountOut The amount of tokens being transferred from the market taker's wallet to the market maker.
 * @param takerBalanceIn The expected balance of the `takerTokenIn` tokens in the market taker's wallet after the swap.
 * takerBalanceIn = before balance of `makerTokenOut` + `makerAmountOut`
 */
struct TokensVerify {
    address maker;
    address takerTokenIn;
    address takerTokenOut;
    uint128 takerAmountOut;
    uint128 takerBalanceIn;
}

/**
 * @notice Swaps a specified amount of base tokens at a fixed exchange rate to a number of quote tokens.
 * This is from the perspective of the market maker, so buy means the market maker is buying the base tokens from the taker,
 * sell means the market maker is selling the base tokens to the taker.
 * This is what the market maker hashes and signs to authorise the execution of the token exchange.
 * @param exchangeType Buy or Sell of the base token relative to the market maker's wallet.
 * @param baseToken The first token in the trading pair. eg WETH in WETH/USDC.
 * @param quoteToken The second token in the trading pair. eg USDC in WETH/USDC.
 * @param exchangeRate Rate of exchange from base token to quote token scaled by 1e18. eg exchange rate = quote tokens * 1e18 / base tokens.
 * @param id Identify the order so it can be cancelled and not replayed.
 * @param expiry Expiry in seconds since epoch.
 * @param chainId Chain ID of the network the order is to be executed on.
 */
struct ExchangeOrder {
    ExchangeType exchangeType;
    address baseToken;
    address quoteToken;
    uint256 exchangeRate;
    uint256 id;
    uint256 expiry;
    uint256 chainId;
}

/**
 * @notice Buy or sell all or a subset of NFTs for tokens from the perspective of the market maker.
 * @param exchangeType Buy or Sell of the NFTs relative to the market maker's wallet.
 * @param nft The address of the NFT contract.
 * @param tokenIds The NFT token IDs that are being bought or sold.
 * @param settleToken The token the NFTs are being bought or sold for. eg WETH or USDC
 * @param price Unit price of each NFT. So if selling 3 NFTs for 100 USDC each,
 * the price would be 100e6 as USDC has 6 decimal places.
 * @param id Identify the order so it can be cancelled and not replayed
 * @param expiry Expiry in seconds since epoch
 * @param chainId Chain ID of the network the order is to be executed on
 */
struct NFTUnitOrder {
    ExchangeType exchangeType;
    address nft;
    uint256[] tokenIds;
    address settleToken;
    uint256 price;
    uint256 id;
    uint256 expiry;
    uint256 chainId;
}

/**
 * @notice Buy or sell all NFTs in exchange for tokens from the perspective of the market maker.
 * @param exchangeType Buy or Sell of the NFTs relative to the market maker's wallet.
 * @param nft The address of the NFT contract.
 * @param tokenIds The NFT token IDs that are being bought or sold.
 * @param settleToken The token the NFTs are being bought or sold for. eg WETH or USDC
 * @param settleAmount The amount of settlement tokens for all NFTs being bought or sold.
 * @param id Identify the order so it can be cancelled and not replayed
 * @param expiry Expiry in seconds since epoch
 * @param chainId Chain ID of the network the order is to be executed on
 */
struct NFTBundleOrder {
    ExchangeType exchangeType;
    address nft;
    uint256[] tokenIds;
    address settleToken;
    uint256 settleAmount;
    uint256 id;
    uint256 expiry;
    uint256 chainId;
}

/**
 * @param maker The address of the market maker's wallet.
 * @param nft The address of the NFT contract.
 * @param settleToken The token the NFTs are being bought or sold for. eg WETH or USDC
 * @param tokenIds The NFT token IDs that are being bought or sold.
 * @param exchangeType Buy or Sell of the NFTs relative to the market maker's wallet.
 * @param settleAmtBal For Buy orders, `settleAmtBal` is the amount of settlement tokens to be transferred to the market maker's wallet.
 * For Sell orders, `settleAmtBal` is the maker taker's expected balance of settlement tokens after the exchange which is
 * `settleAmtBal` = before balance of `settleToken` + (length of `tokenIds` * `price`)
 */
struct NftVerify {
    address maker;
    address nft;
    address settleToken;
    uint256[] tokenIds;
    // the following fit in one slot
    ExchangeType exchangeType;
    uint128 settleAmtBal;
}

/**
 * @notice A ERC-4337 Abstract Account that can swap tokens and NFTs.
 * @author Nick Addison
 */
contract DexWallet is SimpleAccount {
    using ECDSA for bytes32;
    using SafeERC20 for IERC20;

    address public constant ETH_TOKEN = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    // Reserve storage slots for fixed-sized, used order identifier array.
    uint256 internal constant USED_ID_ARRAY_SIZE = 4096;
    /// @notice Any order identifiers equal to or greater than this value are invalid.
    /// @dev There are 256 bits in a uint256, so we can store 256 identifier flags in a single storage slot.
    uint256 public constant MAX_ORDER_ID = 256 * USED_ID_ARRAY_SIZE;
    /// @notice Flags if an order has already been executed or cancelled.
    /// @dev The number of orders to capped to MAX_ORDER_ID but it's the most efficient way of storing bools.
    /// Every bit is mapped to an order number. So order 0 is the first bit in the first array position.
    /// Order 31 is the last bit in the first array position.
    /// Order 32 is the first bit in the second array position.
    /// Order 34 is the third bit in the second array position.
    uint256[USED_ID_ARRAY_SIZE] public usedOrderIds;

    /// @notice used by the market taker to store token swap data between calling the market maker's wallet and
    // the maker maker's wallet calling the this contact back again.
    mapping(bytes32 => TokensVerify) public tokensVerifiers;

    /// @notice used by the market taker to store NFT swap data between calling the market maker's wallet and
    // the maker maker's wallet calling the this contact back again.
    mapping(bytes32 => NftVerify) public nftVerifiers;

    /// @notice Emitted when an order has been cancelled or a token swap has been executed.
    /// This is not emitted for token or NFT exchanges.
    event OrderUsed(uint256 id);

    constructor(IEntryPoint anEntryPoint) SimpleAccount(anEntryPoint) {}

    /// @param aaOwner The address of the wallet owner.
    function initialize(address aaOwner) external override initializer {
        _initialize(aaOwner);
    }

    function takeTokenSwap(
        SwapOrder calldata order,
        address maker,
        bytes calldata makerSignature
    ) external onlyOwner {
        // Save VerifySwap
        bytes32 verifyHash = _hashVerifier(maker, order.id);
        tokensVerifiers[verifyHash] = TokensVerify({
            maker: maker,
            takerTokenIn: order.makerTokenOut,
            takerTokenOut: order.makerTokenIn,
            takerAmountOut: SafeCast.toUint128(order.makerAmountIn),
            takerBalanceIn: order.makerTokenOut == ETH_TOKEN
                ? SafeCast.toUint128(address(this).balance)
                : SafeCast.toUint128(
                    IERC20(order.makerTokenOut).balanceOf(address(this)) + order.makerAmountOut
                )
        });

        IDexWallet(maker).makeTokenSwap(order, makerSignature);
    }

    /// @notice Swaps a whole amount of tokens.
    function makeTokenSwap(SwapOrder calldata order, bytes calldata makerSignature) external {
        require(owner == hashSwapOrder(order).recover(makerSignature), "invalid signature");
        require(block.timestamp < order.expiry, "swap expired");
        require(order.chainId == block.chainid, "invalid chain");
        _checkOrderId(order.id, true);

        // Transfer ether or tokens from the maker to the taker
        _transfer(order.makerTokenOut, msg.sender, order.makerAmountOut);

        // Balance before taker transfers their ether or tokens
        uint256 balanceIn = _balance(order.makerTokenIn);

        // Call taker to verify the swap and transfer their tokens
        IDexWallet(msg.sender).verifyTokens(order.id);

        // Verify the taker transferred their tokens or ether
        require(
            _verifyTransfer(order.makerTokenIn, balanceIn + order.makerAmountIn),
            "taker did not transfer"
        );
    }

    /// @notice Swap taker verifies the maker tansferred the maker's tokens and
    /// sends the take's tokens to the maker.
    function verifyTokens(uint256 orderId) external {
        // get order details
        bytes32 hash = _hashVerifier(msg.sender, orderId);
        TokensVerify memory swap = tokensVerifiers[hash];
        delete tokensVerifiers[hash];

        // verify wallet has received tokens or ether from the market maker
        require(msg.sender == swap.maker, "invalid maker");
        require(_verifyTransfer(swap.takerTokenIn, swap.takerBalanceIn), "maker did not transfer");

        // Hook to do other processing. eg arbitrage
        _verifyTokensHook(swap);

        // transfer ether or tokens to the taker
        _transfer(swap.takerTokenOut, swap.maker, swap.takerAmountOut);
    }

    function _verifyTokensHook(TokensVerify memory swap) internal virtual {}

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
            _balance(order.makerTokenOut) >= order.makerAmountOut;
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
            tokensVerifiers[verifyHash] = TokensVerify({
                maker: maker,
                takerTokenOut: order.baseToken,
                takerTokenIn: order.quoteToken,
                takerAmountOut: SafeCast.toUint128(baseAmount),
                takerBalanceIn: SafeCast.toUint128(_balance(order.quoteToken) + quoteAmount)
            });
        } else {
            tokensVerifiers[verifyHash] = TokensVerify({
                maker: maker,
                takerTokenOut: order.quoteToken,
                takerTokenIn: order.baseToken,
                takerAmountOut: SafeCast.toUint128(quoteAmount),
                takerBalanceIn: SafeCast.toUint128(_balance(order.baseToken) + baseAmount)
            });
        }

        IDexWallet(maker).makeTokensExchange(order, baseAmount, makerSignature);
    }

    /// @notice Exchanges a variable amount of base tokens at a fixed rate to quote tokens.
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

        uint256 tokenInBalance;
        address tokenIn;
        uint256 amountIn;
        uint256 quoteAmount = (baseAmount * order.exchangeRate) / 1e18;
        if (order.exchangeType == ExchangeType.BUY) {
            tokenIn = order.baseToken;
            amountIn = baseAmount;

            // Transfer out the ether or quote token
            _transfer(order.quoteToken, msg.sender, quoteAmount);
        } else {
            tokenIn = order.quoteToken;
            amountIn = quoteAmount;

            // Transfer out the ether or base token
            _transfer(order.baseToken, msg.sender, baseAmount);
            tokenInBalance = _balance(order.quoteToken);
        }

        // Call taker to verify the swap and transfer their tokens
        IDexWallet(msg.sender).verifyTokens(order.id);

        // Verify the taker transferred their ether or tokens
        require(_verifyTransfer(tokenIn, tokenInBalance + amountIn), "taker did not transfer");
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
            quoteAmount = _balance(order.quoteToken);
            baseAmount = (quoteAmount * 1e18) / order.exchangeRate;
        } else {
            baseAmount = _balance(order.baseToken);
            quoteAmount = (baseAmount * order.exchangeRate) / 1e18;
        }
    }

    function takeNFTUnitExchange(
        NFTUnitOrder calldata order,
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
                settleAmtBal: SafeCast.toUint128(
                    _balance(order.settleToken) + (exchangeIds.length * order.price)
                )
            });
        } else {
            nftVerifiers[verifyHash] = NftVerify({
                maker: maker,
                nft: order.nft,
                settleToken: order.settleToken,
                tokenIds: exchangeIds,
                exchangeType: order.exchangeType,
                settleAmtBal: SafeCast.toUint128(exchangeIds.length * order.price)
            });
        }

        IDexWallet(maker).makeNFTUnitExchange(order, exchangeIds, makerSignature);
    }

    /// @notice Exchanges a set of NFTs at a fixed price.
    /// Once all the NFTs have been exchanged, the wallet owner needs to cancel the order if it has not already expired.
    /// If its a buy order and the wallet transfer the NFT, the order can be reexecuted if not expired or cancelled.
    /// @param order The order to execute of type NFTOrder.
    /// @param exchangeIds The token IDs the market taker wants to exchange. This can be a subset of what's in the order.
    function makeNFTUnitExchange(
        NFTUnitOrder calldata order,
        uint256[] calldata exchangeIds,
        bytes calldata makerSignature
    ) external {
        require(owner == hashNFTUnitOrder(order).recover(makerSignature), "invalid signature");
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

            // Transfer out the settlement ether or tokens
            _transfer(order.settleToken, msg.sender, nftLen * order.price);
        } else {
            unchecked {
                for (uint256 i; i < nftLen; ++i) {
                    // validate that the tokenId is in the order
                    require(_inSet(order.tokenIds, exchangeIds[i]), "invalid id");

                    // Transfer out the NFT
                    IERC721(order.nft).transferFrom(address(this), msg.sender, exchangeIds[i]);
                }
            }
            settleBalance = _balance(order.settleToken);
        }

        // Call taker to verify the the maker transferred to the taker and
        // the taker to transfer to the maker.
        IDexWallet(msg.sender).verifyNFTs(order.id);

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
            // Verify the taker transferred the settlement ether or tokens
            if (order.settleToken == ETH_TOKEN) {
                require(
                    address(this).balance >= settleBalance + (nftLen * order.price),
                    "taker did not transfer ether"
                );
            } else {
                require(
                    IERC20(order.settleToken).balanceOf(address(this)) >=
                        settleBalance + (nftLen * order.price),
                    "taker did not transfer tokens"
                );
            }
        }
    }

    /// @notice Exchanges all NFTs at a fixed amount.
    /// @param order The order to execute of type NFTOrder.
    function makeNFTBundleExchange(
        NFTBundleOrder calldata order,
        bytes calldata makerSignature
    ) external {
        require(owner == hashNFTBundleOrder(order).recover(makerSignature), "invalid signature");
        require(block.timestamp < order.expiry, "swap expired");
        require(order.chainId == block.chainid, "invalid chain");
        _checkOrderId(order.id, false);

        uint256 nftLen = order.tokenIds.length;
        uint256 settleBalance;

        if (order.exchangeType == ExchangeType.BUY) {
            // Transfer out the settlement ether or tokens
            _transfer(order.settleToken, msg.sender, order.settleAmount);
        } else {
            // Transfer out the NFTs to the taker
            _transferNFTs(order.nft, msg.sender, order.tokenIds);
            settleBalance = _balance(order.settleToken);
        }

        // Call taker to verify the the maker transferred to the taker and
        // the taker to transfer to the maker.
        IDexWallet(msg.sender).verifyNFTs(order.id);

        if (order.exchangeType == ExchangeType.BUY) {
            // Verify the taker transferred the NFTs
            unchecked {
                for (uint256 i; i < nftLen; ++i) {
                    require(
                        IERC721(order.nft).ownerOf(order.tokenIds[i]) == address(this),
                        "taker did not transfer"
                    );
                }
            }
        } else {
            // Verify the taker transferred the settlement ether or tokens
            if (order.settleToken == ETH_TOKEN) {
                require(
                    address(this).balance >= settleBalance + order.settleAmount,
                    "taker did not transfer ether"
                );
            } else {
                require(
                    IERC20(order.settleToken).balanceOf(address(this)) >=
                        settleBalance + order.settleAmount,
                    "taker did not transfer tokens"
                );
            }
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
            if (verifyData.settleToken == ETH_TOKEN) {
                require(
                    address(this).balance >= verifyData.settleAmtBal,
                    "maker did not transfer ether"
                );
            } else {
                require(
                    IERC20(verifyData.settleToken).balanceOf(address(this)) >=
                        verifyData.settleAmtBal,
                    "maker did not transfer tokens"
                );
            }

            // Hook to do other processing. eg arbitrage
            _verifyNFTsHook(verifyData);

            // Transfer out each of the exchanged NFTs
            _transferNFTs(verifyData.nft, msg.sender, verifyData.tokenIds);
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
            _transfer(verifyData.settleToken, msg.sender, verifyData.settleAmtBal);
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
        NFTUnitOrder calldata order
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

    // required to receive ERC721 tokens when `safeTransferFrom` is used.
    function onERC721Received() external pure returns (bytes4 selector) {
        selector = this.onERC721Received.selector;
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

    function _transfer(address token, address recipient, uint256 amount) internal {
        if (token == ETH_TOKEN) {
            (bool success,) = recipient.call{value : amount}("");
            require(success, "failed ether transfer");
        } else {
            IERC20(token).safeTransfer(recipient, amount);
        }
    }

    function _transferNFTs(address nft, address recipient, uint256[] memory tokenIds) internal {
        uint256 nftLen = tokenIds.length;
        unchecked {
            for (uint256 i; i < nftLen; ++i) {
                // Transfer out the NFT
                IERC721(nft).transferFrom(address(this), recipient, tokenIds[i]);
            }
        }
    }

    function _balance(address token) internal view returns (uint256) {
        if (token == ETH_TOKEN) {
            return address(this).balance;
        } else {
            return IERC20(token).balanceOf(address(this));
        }
    }

    function _verifyTransfer(
        address token,
        uint256 expectedBalance
    ) internal view returns (bool transferred) {
        transferred = token == ETH_TOKEN
            ? address(this).balance >= expectedBalance
            : IERC20(token).balanceOf(address(this)) >= expectedBalance;
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

    function hashNFTUnitOrder(NFTUnitOrder calldata order) public pure returns (bytes32 hash) {
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

    function hashNFTBundleOrder(NFTBundleOrder calldata order) public pure returns (bytes32 hash) {
        hash = keccak256(
            abi.encodePacked(
                order.exchangeType,
                order.nft,
                order.tokenIds,
                order.settleToken,
                order.settleAmount,
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
