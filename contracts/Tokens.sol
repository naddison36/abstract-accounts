// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { ERC20PresetFixedSupply } from "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetFixedSupply.sol";

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
