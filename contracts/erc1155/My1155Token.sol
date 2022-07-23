// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

import "hardhat/console.sol";

contract My1155Token is ERC1155, Ownable, ERC1155Burnable, ERC1155Supply {
    /// @dev event emitted when admin withdraws ETH funds
    /// @param sender the address of the sender
    /// @param amount the amount of tokens withdrawn
    event WithdrawFunds(address indexed sender, uint256 amount);

    /// @dev event emitted whet admin mints new tokens
    /// @param sender the address of the sender
    /// @param tokenId the id of the new token
    /// @param amount the amount of tokens minted
    /// @param tokenURI the URI of the new token
    /// @param price the price of the new token
    /// @param data the data of the new token
    event MintToken(
        address indexed sender,
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        string tokenURI,
        bytes data
    );

    /// @dev event emitted whet admin mints new tokens
    /// @param sender the address of the sender
    /// @param tokenIds the id of the new token
    /// @param amounts the amount of tokens minted
    /// @param tokenURIs the URI of the new token
    /// @param prices the price of the new token
    /// @param data the data of the new token
    event BatchMintToken(
        address indexed sender,
        uint256[] tokenIds,
        uint256[] amounts,
        uint256[] prices,
        string[] tokenURIs,
        bytes data
    );

    /// @dev event emitted when buyer buys tokens
    /// @param sender the address of the buyer
    /// @param tokenId the id of the purchased  token
    /// @param amount the amount of the purchased token
    /// @param value total sender paid for the amount of tokens
    /// @param tokenURI the URI of the purchased token
    event BuyTokens(
        address indexed sender,
        uint256 tokenId,
        uint256 amount,
        uint256 value,
        string tokenURI
    );

    /// @dev event emitted when admin update the base URI
    /// @param sender the address of the sender
    /// @param tokenURI the new base URI
    event SetNewUri(address indexed sender, string tokenURI);

    /// @notice store base URI of the token
    string public baseURI;

    /// @notice store price of tokens
    mapping(uint256 => uint256) public tokenPrice;

    /// @dev constructor
    /// @param _baseUri the base URI of the token
    constructor(string memory _baseUri) ERC1155(_baseUri) {
        baseURI = _baseUri;
    }

    /// @dev function to update the base URI
    /// @param newuri the new base URI
    /// @notice emits the SetNewUri event
    function setURI(string memory newuri) public onlyOwner {
        baseURI = newuri;

        emit SetNewUri(msg.sender, newuri);
    }

    /// @dev function to view the specified token's URI
    /// @param _tokenid the id of the token
    /// @notice token ID must exists in the token registry
    /// @notice returns the URI of the token
    function uri(uint256 _tokenid)
        public
        view
        override
        returns (string memory)
    {
        require(exists(_tokenid), "Token does not exist");
        return
            string(
                abi.encodePacked(baseURI, Strings.toString(_tokenid), ".json")
            );
    }

    /// @dev function to create a new token
    /// @param id the id of the token
    /// @param amount the amount of tokens to mint
    /// @param price the price of the token
    /// @param data the data of the token
    /// @notice only owner can mint new tokens
    /// notice event MintToken emitted when owner mints new tokens
    function mint(
        uint256 id,
        uint256 amount,
        uint256 price,
        bytes memory data
    ) public onlyOwner {
        tokenPrice[id] = price;
        _mint(msg.sender, id, amount, data);

        emit MintToken(msg.sender, id, amount, price, uri(id), data);
    }

    /// @dev function to create multiple tokens
    /// @param ids the ids of the tokens
    /// @param amounts the amount of tokens to mint
    /// @param prices the price of the tokens
    /// @param data the data of the tokens
    /// @notice only owner can mint new tokens
    /// notice event BatchMintToken emitted when owner mints new tokens
    function mintBatch(
        uint256[] memory ids,
        uint256[] memory amounts,
        uint256[] memory prices,
        bytes memory data
    ) public onlyOwner {
        string[] memory uris = new string[](ids.length);

        _mintBatch(msg.sender, ids, amounts, data);

        for (uint256 i = 0; i < ids.length; i++) {
            tokenPrice[ids[i]] = prices[i];
            uris[i] = uri(ids[i]);
        }

        emit BatchMintToken(msg.sender, ids, amounts, prices, uris, data);
    }

    /// @dev function to buy tokens
    /// @param _tokenid the id of the token
    /// @param _amount the amount of tokens to buy
    /// @notice token ID must exists in the token registry
    /// @notice amount must be less or equal to the balance of owner
    function buyToken(uint256 _tokenid, uint256 _amount) public payable {
        uint256 totalPrice = (tokenPrice[_tokenid] * _amount);

        require(exists(_tokenid), "Token does not exist");
        require(balanceOf(owner(), _tokenid) >= _amount, "Not enough tokens");
        require(totalPrice == msg.value, "Wrong transaction value");

        safeTransferFrom(owner(), msg.sender, _tokenid, _amount, "");

        emit BuyTokens(
            msg.sender,
            _tokenid,
            _amount,
            totalPrice,
            uri(_tokenid)
        );
    }

    /// @dev Function to withdraw tokens
    /// @notice Function is only available to the owner
    /// @notice require balance to be greater than 0
    /// @notice emit Withdraw event
    function withdrawFunds() public payable onlyOwner {
        uint256 ethBalance = address(this).balance;
        require(ethBalance > 0, "There are no funds to be withdraw");
        payable(msg.sender).transfer(ethBalance);

        emit WithdrawFunds(msg.sender, ethBalance);
    }

    // The following functions are overrides required by Solidity.
    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal override(ERC1155, ERC1155Supply) {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);
    }
}
