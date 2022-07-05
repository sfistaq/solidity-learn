//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// import "hardhat/console.sol";

contract MyERC20 is ERC20, ERC20Burnable, Ownable {
    /// @dev event emitted when a purchase is made
    /// @param buyer the address of the buyer
    /// @param amount the amount of tokens purchased
    /// @param paidAmount the amount of tokens paid for purchase
    event PurchaseTokens(
        address indexed buyer,
        uint256 amount,
        uint256 paidAmount
    );

    /// @dev event emitted when a purchase by ERC20 is made
    /// @param buyer the address of the buyer
    /// @param amount the amount of tokens purchased
    /// @param paidAmount the amount of tokens paid for purchase
    /// @param paymentToken the address of the payment token used
    event PurchaseByERC20(
        address indexed buyer,
        uint256 amount,
        uint256 paidAmount,
        address paymentToken
    );

    /// @dev event emitted when admin withdraws tokens
    /// @param sender the address of the sender
    /// @param amount the amount of tokens withdrawn
    event WithdrawTokens(address indexed sender, uint256 amount);

    /// @dev event emitted when admin withdraws ERC20 tokens
    /// @param sender the address of the sender
    /// @param amount the amount of tokens withdrawn
    /// @param paymentToken the address of the payment token used
    event WithdrawERC20(
        address indexed sender,
        uint256 amount,
        address paymentToken
    );

    /// @dev event emitted when admin changes the price of tokens and buy limit
    /// @param sender the address of the sender
    /// @param newTokenPrice the new price of tokens
    /// @param newERC20Price the new price to buy by ERC20 tokens
    /// @param newBuyLimit the new buy limit
    event ChangeTokenPriceAndLimit(
        address indexed sender,
        uint256 newTokenPrice,
        uint256 newERC20Price,
        uint256 newBuyLimit
    );

    /// @dev event emitted when admin mints tokens
    /// @param to the address of the recipient
    /// @param amount the amount of tokens minted
    event Mint(address indexed to, uint256 amount);

    bool public isWhitelistedSale;
    mapping(address => bool) private whitelistedWallets;
    uint256 public TOKEN_PRICE;
    uint256 public ERC_20_PAYMENT_TOKEN_PRICE;
    uint256 public BUY_LIMIT;
    ERC20 public PAYMENT_TOKEN;

    modifier whitelisted(address _address) {
        if (isWhitelistedSale) {
            require(
                isWhitelisted(_address),
                "User is not authorized to purchase"
            );
        }
        _;
    }

    modifier valueGreaterThan0(uint256 _amount) {
        require(_amount > 0, "Value must be greater than 0");
        _;
    }

    /// @dev Constructor
    /// @param _name the name of the token
    /// @param _symbol the symbol of the token
    /// @param _mintAmount the amount of initial tokens minted to deployer
    /// @param _tokenPrice the price of token
    /// @param _erc20TokenPrice the price to buy by ERC20 tokens
    /// @param _paymentToken the address of the payment ERC20 token used
    /// @param _buyLimit the buy limit
    /// @param _isWhitelistedSale whether the sale is initial whitelisted
    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _mintAmount,
        uint256 _tokenPrice,
        uint256 _erc20TokenPrice,
        ERC20 _paymentToken,
        uint256 _buyLimit,
        bool _isWhitelistedSale
    ) ERC20(_name, _symbol) valueGreaterThan0(_mintAmount) {
        _mint(msg.sender, _mintAmount);
        TOKEN_PRICE = _tokenPrice;
        ERC_20_PAYMENT_TOKEN_PRICE = _erc20TokenPrice;
        PAYMENT_TOKEN = ERC20(_paymentToken);
        BUY_LIMIT = _buyLimit;
        isWhitelistedSale = _isWhitelistedSale;
    }

    /// @dev Function to mint new tokens
    /// @param _to Address of recipient
    /// @param _amount Amount of tokens to mint
    /// @param _amount must be greater than 0
    /// @notice Function is only available to the owner
    /// @notice emit Mint event
    function mint(address _to, uint256 _amount)
        external
        onlyOwner
        valueGreaterThan0(_amount)
    {
        _mint(_to, _amount);
        emit Mint(_to, _amount);
    }

    /// @dev Function to transfer tokens
    /// @param _recipient Address of recipient
    /// @param _amount Amount of tokens to transfer
    /// @return Function returns true if transfer was successful
    function transfer(address _recipient, uint256 _amount)
        public
        override
        returns (bool)
    {
        _transfer(msg.sender, _recipient, _amount);
        return true;
    }

    /// @dev Function to buy tokens
    /// @notice msg.sender must be whitelisted when isWhitelistedSale is true
    /// @notice msg.value must be greater than 0
    /// @notice amount of tokens purchased is equal or less than BUY_LIMIT
    /// @notice emit PurchaseTokens event
    function buyTokens()
        external
        payable
        whitelisted(msg.sender)
        valueGreaterThan0(msg.value)
    {
        uint256 amount = (msg.value * (10**decimals())) /
            (TOKEN_PRICE * (10**decimals()));
        require(amount <= BUY_LIMIT, "Purchase exceed tokens limit");
        _mint(msg.sender, amount);

        emit PurchaseTokens(msg.sender, amount, msg.value);
    }

    /// @dev Function to buy tokens by ERC20 token
    /// @notice msg.sender must be whitelisted when isWhitelistedSale is true
    /// @notice msg.value must be greater than 0
    /// @notice amount of tokens purchased is equal or less than BUY_LIMIT
    /// @notice msg.sender must have enough tokens to pay for the purchase
    /// @notice msg.sender must have already approved the payment token for the purchase
    /// @notice emit PurchaseByERC20 event
    function buyTokenByERC20(uint256 _erc20Amount)
        public
        whitelisted(msg.sender)
        valueGreaterThan0(_erc20Amount)
    {
        uint256 amount = (_erc20Amount * (10**decimals())) /
            (ERC_20_PAYMENT_TOKEN_PRICE * (10**decimals()));

        require(amount <= BUY_LIMIT, "Purchase exceed tokens limit");
        require(
            PAYMENT_TOKEN.balanceOf(msg.sender) >= _erc20Amount,
            "You don`t have enough tokens"
        );
        require(
            PAYMENT_TOKEN.allowance(msg.sender, address(this)) >= _erc20Amount,
            "ERC20: insufficient allowance"
        );
        PAYMENT_TOKEN.transferFrom(msg.sender, address(this), _erc20Amount);
        _mint(msg.sender, amount);

        emit PurchaseByERC20(
            msg.sender,
            amount,
            _erc20Amount,
            address(PAYMENT_TOKEN)
        );
    }

    /// @dev Function to update whitelisted addresses
    /// @param _wallets List of addresses array
    /// @param _toogleIsWhitelisted toggle whitelisted address
    /// @notice Function is only available to the owner
    function updateWhitelist(
        address[] memory _wallets,
        bool _toogleIsWhitelisted
    ) public onlyOwner {
        for (uint256 i = 0; i < _wallets.length; i++) {
            whitelistedWallets[_wallets[i]] = _toogleIsWhitelisted;
        }
    }

    /// dev Function to check if address is whitelisted
    /// @param _wallet Address of wallet
    /// @return bool isWhitelisted
    function isWhitelisted(address _wallet) public view returns (bool) {
        return whitelistedWallets[_wallet];
    }

    /// dev Function to toggle whitelisted sale
    /// @notice Function is only available to the owner
    function toggleIsWhitelistedSale() public onlyOwner {
        isWhitelistedSale = !isWhitelistedSale;
    }

    /// @dev Function to update token price
    /// @param _newPrice New token price
    /// @param _newERC20Price New erc20 token price
    /// @param _newLimit New buy limit
    /// @notice Function is only available to the owner
    /// @notice emit UpdateTokenPrice event
    function changeTokenPriceAndLimit(
        uint256 _newPrice,
        uint256 _newERC20Price,
        uint256 _newLimit
    ) public onlyOwner {
        require(_newPrice > 0, "Price must be greater than 0");
        require(_newLimit > 0, "Limit must be greater than 0");

        TOKEN_PRICE = _newPrice;
        ERC_20_PAYMENT_TOKEN_PRICE = _newERC20Price;
        BUY_LIMIT = _newLimit;

        emit ChangeTokenPriceAndLimit(
            msg.sender,
            _newPrice,
            _newERC20Price,
            _newLimit
        );
    }

    /// @dev Function to withdraw tokens
    /// @notice Function is only available to the owner
    /// @notice require balance to be greater than 0
    /// @notice emit Withdraw event
    function withdrawFunds() external payable onlyOwner {
        uint256 ethBalance = address(this).balance;
        require(ethBalance > 0, "There are no funds to be withdraw");
        payable(msg.sender).transfer(ethBalance);

        emit WithdrawTokens(msg.sender, ethBalance);
    }

    /// @dev Function to withdraw ERC20 token
    /// @notice Function is only available to the owner
    /// @notice require balance to be greater than 0
    /// @notice emit WithdrawByERC20 event
    function withdrawERC20Funds() external onlyOwner {
        uint256 paymentTokenBalance = PAYMENT_TOKEN.balanceOf(address(this));
        require(paymentTokenBalance > 0, "There are no funds to be withdraw");
        PAYMENT_TOKEN.transfer(msg.sender, paymentTokenBalance);

        emit WithdrawERC20(
            msg.sender,
            paymentTokenBalance,
            address(PAYMENT_TOKEN)
        );
    }
}
