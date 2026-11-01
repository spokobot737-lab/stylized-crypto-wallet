// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// Kolekcja z niezmiennymi adresami metadanych i limitem podaży.
contract FrameCollection is ERC721URIStorage, Ownable, ReentrancyGuard {
    string public contractURI;
    uint256 public totalMinted;
    uint256 public immutable maxSupply;

    constructor(string memory nazwa, string memory symbol, uint256 limit, string memory metadane, string[] memory adresy)
        ERC721(nazwa, symbol) Ownable(msg.sender) {
        require(limit > 0 && limit <= 10000, "Nieprawidlowy limit");
        require(bytes(metadane).length > 0 && bytes(metadane).length <= 200, "Nieprawidlowy URI");
        contractURI = metadane;
        maxSupply = limit;
        _mintMany(adresy);
    }

    function mintMany(string[] calldata adresy) external onlyOwner nonReentrant {
        _mintMany(adresy);
    }

    function _mintMany(string[] memory adresy) private {
        require(adresy.length <= 20 && totalMinted + adresy.length <= maxSupply, "Limit kolekcji");
        for (uint256 i; i < adresy.length; ++i) {
            require(bytes(adresy[i]).length > 0 && bytes(adresy[i]).length <= 200, "Nieprawidlowy URI");
            uint256 id = ++totalMinted;
            _safeMint(msg.sender, id);
            _setTokenURI(id, adresy[i]);
        }
    }
}
