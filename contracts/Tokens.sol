// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC20PresetMinterPauser } from "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol";
import { ERC20PresetFixedSupply } from "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetFixedSupply.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

contract MockERC20 is ERC20PresetFixedSupply {
    uint8 internal immutable __decimals;

    constructor(
        string memory name,
        string memory symbol,
        uint8 _decimals,
        uint256 initSupply,
        address owner
    ) ERC20PresetFixedSupply(name, symbol, initSupply, owner) {
        __decimals = _decimals;
    }

    function decimals() public view virtual override returns (uint8 decimals_) {
        decimals_ = __decimals;
    }
}
