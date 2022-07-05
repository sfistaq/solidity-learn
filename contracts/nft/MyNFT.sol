//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

// import "hardhat/console.sol";

contract MyNFT is
    ERC721,
    ERC721Enumerable,
    ERC721URIStorage,
    ERC721Burnable,
    Ownable
{
    using Counters for Counters.Counter;

    /// @dev event emitted when admin withdraws ETH funds
    /// @param sender the address of the sender
    /// @param amount the amount of tokens withdrawn
    event WithdrawFunds(address indexed sender, uint256 amount);

    /// @dev event emitted when admin toggles the token sale
    /// @param sender the address of the sender
    /// @param isSaleEnabled enables or disables the token sale
    event ToggleIsSaleEnabled(address indexed sender, bool isSaleEnabled);

    /// @dev event when admin change the max supply
    /// @param sender the address of the sender
    /// @param maxSupply the new max supply
    event ChangeMaxSupply(address indexed sender, uint256 maxSupply);

    /// @dev event when admin change the max supply
    /// @param sender the address of the sender
    /// @param limitPerWallet the new max supply
    event ChangeLimitPerUser(address indexed sender, uint256 limitPerWallet);

    /// @dev event emitted when user mint new NFT
    /// @param sender the address of the sender
    /// @param tokenId the id of the new NFT
    /// @param tokenURI the URI of the new NFT
    event MintToken(address indexed sender, uint256 tokenId, string tokenURI);

    Counters.Counter private _tokenIdCounter;
    uint256 public mintPrice;
    uint256 public maxSupply;
    uint256 public limitPerUser;
    bool public isMintEnabled;
    string public baseURI;

    /// @notice store number of tokens minted by user
    mapping(address => uint256) public mintedWallets;

    /// @dev constructor
    /// @param name the name of the token
    /// @param symbol the symbol of the token
    /// @param _mintPrice the price of the token
    /// @param _maxSupply the max supply of the token
    /// @param _limitPerUser the limit of tokens per user
    /// @param _isMintEnabled initial enables or disables the token minting
    /// @param _baseUri the base URI of the token
    constructor(
        string memory name,
        string memory symbol,
        uint256 _mintPrice,
        uint256 _maxSupply,
        uint256 _limitPerUser,
        bool _isMintEnabled,
        string memory _baseUri
    ) ERC721(name, symbol) {
        mintPrice = _mintPrice;
        maxSupply = _maxSupply;
        limitPerUser = _limitPerUser;
        isMintEnabled = _isMintEnabled;
        baseURI = _baseUri;
    }

    /// @dev function to mint new NFT token to a user
    /// @notice requires the sale is enabled
    /// @notice requires mint amount to be less or equal to the limit per user
    /// @notice requires the pay value to be equal to the mint price
    /// @notice requires the counter to be less or equal to the max supply
    /// @notice emits MintToken event
    function purchaseToken() external payable {
        require(isMintEnabled, "Sales not open");
        require(maxSupply > _tokenIdCounter.current(), "Tokens sold out");
        require(
            mintedWallets[msg.sender] < limitPerUser,
            "Exceeds max tokens per wallet"
        );
        require(msg.value == mintPrice, "Wrong transaction value");

        mintedWallets[msg.sender]++;

        _tokenIdCounter.increment();
        uint256 tokenId = _tokenIdCounter.current();

        _safeMint(msg.sender, tokenId);
        emit MintToken(msg.sender, tokenId, tokenURI(tokenId));
    }

    /// @dev Function to withdraw tokens
    /// @notice Function is only available to the owner
    /// @notice require balance to be greater than 0
    /// @notice emit Withdraw event
    function withdrawFunds() external payable onlyOwner {
        uint256 ethBalance = address(this).balance;
        require(ethBalance > 0, "There are no funds to be withdraw");
        payable(msg.sender).transfer(ethBalance);

        emit WithdrawFunds(msg.sender, ethBalance);
    }

    /// @dev function to  enable or disable minting
    /// @param _toggleIsSaleEnabled boolean enable or disable minting
    /// @notice only admin can enable or disable minting
    /// @notice emits ToggleIsSaleEnabled event
    function toggleIsSaleEnabled(bool _toggleIsSaleEnabled) external onlyOwner {
        isMintEnabled = _toggleIsSaleEnabled;

        emit ToggleIsSaleEnabled(msg.sender, isMintEnabled);
    }

    /// @dev function to change max mint supply
    /// @param _newMaxSupply new max supply
    /// @notice only admin can change max supply
    /// @notice emits ChangeMaxSupply event
    function setMaxSupply(uint256 _newMaxSupply) external onlyOwner {
        maxSupply = _newMaxSupply;

        emit ChangeMaxSupply(msg.sender, maxSupply);
    }

    /// @dev function to  change mint limit per user
    /// @param _newLimitPerUser new max supply
    /// @notice only admin can change max supply
    /// @notice emits ChangeLimitPerUser event
    function setLimitPerUser(uint256 _newLimitPerUser) external onlyOwner {
        limitPerUser = _newLimitPerUser;

        emit ChangeLimitPerUser(msg.sender, limitPerUser);
    }

    /// @dev Change baseURI
    /// @param _newURI New uri to new folder with metadata
    /// @notice It can be called only by owner
    function setBaseURI(string memory _newURI) public onlyOwner {
        baseURI = _newURI;
    }

    /// @dev function to override the base token URI
    function _baseURI() internal view virtual override returns (string memory) {
        return baseURI;
    }

    /// @dev function to read the token URI
    /// @param _tokenId the id of the token to read the URI from
    /// @notice function is override from ERC721URIStorage
    /// @notice returns string the token URI
    function tokenURI(uint256 _tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        require(_exists(_tokenId), "ERC721: nonexistent token");
        return super.tokenURI(_tokenId);
    }

    /// @dev function from ERC721Enumerable  updates the mappings with the IDs of tokens minted by user
    /// @notice function is override from ERC721Enumerable
    /// @param _from address of the sender
    /// @param _to address of the receiver
    /// @param _tokenId the id of the token
    /// @notice call before safeTransferFrom() to update mappings
    function _beforeTokenTransfer(
        address _from,
        address _to,
        uint256 _tokenId
    ) internal override(ERC721, ERC721Enumerable) {
        super._beforeTokenTransfer(_from, _to, _tokenId);
    }

    /// @dev function to check if the token supports the interface
    /// @notice function is override from ERC721Enumerable
    /// @param _interfaceId the interface to check
    /// @notice returns boolean if the token supports the interface
    function supportsInterface(bytes4 _interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(_interfaceId);
    }

    /// @dev function to burn token
    /// @notice function is override from ERC721URIStorage
    /// @param _tokenId the id of the token to burn
    function _burn(uint256 _tokenId)
        internal
        override(ERC721, ERC721URIStorage)
    {
        super._burn(_tokenId);
    }
}
