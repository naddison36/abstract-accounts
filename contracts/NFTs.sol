// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { ERC721PresetMinterPauserAutoId } from "@openzeppelin/contracts/token/ERC721/presets/ERC721PresetMinterPauserAutoId.sol";

contract MockNFT is ERC721PresetMinterPauserAutoId {
    constructor(
        string memory name,
        string memory symbol
    ) ERC721PresetMinterPauserAutoId(name, symbol, "") {}
}
