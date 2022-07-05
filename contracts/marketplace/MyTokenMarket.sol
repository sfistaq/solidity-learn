//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "hardhat/console.sol";

contract MyTokenMarket is Ownable, ReentrancyGuard {
    /// @dev event emitted when a offer is made
    /// @param seller the address of the seller
    /// @param token the address of the offered token
    /// @param amount the amount of tokens offered
    /// @param price the price of tokens offered
    /// @param expirationDate the expiration time of the offer
    event CreateOffer(
        uint256 offerID,
        address indexed seller,
        address indexed token,
        uint256 amount,
        uint256 price,
        uint256 expirationDate
    );

    /// @dev event emitted when a purchase is made
    /// @param offerID the ID of the offer
    /// @param buyer the address of the buyer
    /// @param amount the amount of tokens purchased
    /// @param paidAmount the amount of tokens paid for purchase
    event PurchaseTokens(
        uint256 indexed offerID,
        address indexed buyer,
        uint256 amount,
        uint256 paidAmount
    );

    ///@dev event emitted when a toggle offer is made
    ///@param offerID the id of the offer to be toggled
    ///@param caller the address of the caller
    ///@param isActive the boolean value to toggle the offer
    event ToggleOffer(
        uint256 indexed offerID,
        address indexed caller,
        bool isActive
    );

    ///@dev event emitted when a seller change price of token
    ///@param offerID the id of the offer to be toggled
    ///@param caller the address of the caller
    ///@param price the new price of the token
    event ChangeOfferPrice(
        uint256 indexed offerID,
        address indexed caller,
        uint256 price
    );

    ///@dev event emitted when a seller change offer expiration date
    ///@param offerID the id of the offer to be toggled
    ///@param caller the address of the caller
    ///@param expirationDate the new offer expiration date
    event ChangeOfferExpirationDate(
        uint256 indexed offerID,
        address indexed caller,
        uint256 expirationDate
    );

    ///@dev event emitted when a owner change the fee of the marketplace
    ///@param caller the address of the caller
    ///@param feePercentage the new fee percentage
    event ChangeFeePercentage(address indexed caller, uint256 feePercentage);

    struct Offer {
        uint256 offerID;
        address payable seller;
        address token;
        uint256 amount;
        uint256 price;
        uint256 expirationDate;
        bool isActive;
    }

    address payable public feeAccount;
    uint256 public feePercentage;
    uint256 public offersCount = 0;

    /// @dev offerId => Offer
    mapping(uint256 => Offer) public offers;

    /// @dev constructor
    /// @param _feePercent the fee percentage
    constructor(uint256 _feePercent) {
        feeAccount = payable(msg.sender);
        feePercentage = _feePercent;
    }

    /// @dev function to create an offer
    /// @param _token the address of the offered token to be sold
    /// @param _amount the amount of tokens to be sold
    /// @param _price the price of tokens to be sold
    /// @param _expirationDate the expiration time of the offer
    /// notice emits CreateOffer event
    function createOffer(
        address _token,
        uint256 _amount,
        uint256 _price,
        uint256 _expirationDate
    ) external {
        require(
            ERC20(_token).balanceOf(msg.sender) >= _amount,
            "Insufficient balance"
        );
        require(
            ERC20(_token).allowance(msg.sender, address(this)) >= _amount,
            "Insufficient allowance"
        );
        require(
            _expirationDate > block.timestamp,
            "Expiration time must be in the future"
        );

        ERC20(_token).transferFrom(msg.sender, address(this), _amount);
        offersCount++;
        offers[offersCount] = Offer(
            offersCount,
            payable(msg.sender),
            _token,
            _amount,
            _price,
            _expirationDate,
            true
        );

        emit CreateOffer(
            offersCount,
            msg.sender,
            _token,
            _amount,
            _price,
            _expirationDate
        );
    }

    /// @dev function to buy tokens
    /// @param _ID the id of the offer to be bought
    /// modifier nonReentrant prevent reentrancy
    /// notice emit PurchaseTokens event
    function buyTokens(uint256 _ID) external payable nonReentrant {
        require(offers[_ID].offerID > 0, "Offer does not exist");
        Offer storage currentPurchase = offers[_ID];

        uint256 purchaseTokensAmount = uint256(msg.value) /
            uint256(currentPurchase.price);

        uint256 totalPrice = currentPurchase.price * purchaseTokensAmount;
        uint256 purchaseFee = (totalPrice * feePercentage) / 100;

        require(currentPurchase.isActive, "Offer is not active");
        require(
            currentPurchase.expirationDate > block.timestamp,
            "Offer expired"
        );
        require(
            currentPurchase.seller != msg.sender,
            "Offer does belong to you"
        );
        require(
            currentPurchase.amount >= (purchaseTokensAmount * (10**18)),
            "Insufficient sale amount"
        );
        require(
            currentPurchase.price * purchaseTokensAmount >= msg.value,
            "Insufficient value"
        );
        currentPurchase.amount =
            currentPurchase.amount -
            (purchaseTokensAmount * (10**18));

        payable(currentPurchase.seller).transfer(totalPrice - purchaseFee);
        ERC20(currentPurchase.token).transfer(msg.sender, purchaseTokensAmount);
        payable(feeAccount).transfer(purchaseFee);
        offers[_ID] = currentPurchase;

        emit PurchaseTokens(_ID, msg.sender, purchaseTokensAmount, msg.value);
    }

    ///@dev function to toggle offer is active
    ///@param _ID the id of the offer to be toggled
    ///@param _isActive the boolean value to toggle the offer
    ///@notice only the owner or seller can toggle the offer
    ///@notice emit event ToggleOffer
    function toggleOfferIsActive(uint256 _ID, bool _isActive) external {
        require(offers[_ID].offerID > 0, "Offer does not exist");
        Offer storage currentPurchase = offers[_ID];
        require(
            msg.sender == currentPurchase.seller || msg.sender == owner(),
            "Only seller can toggle offer status"
        );
        currentPurchase.isActive = _isActive;
        offers[_ID] = currentPurchase;

        emit ToggleOffer(_ID, msg.sender, _isActive);
    }

    ///@dev function to change offered token price
    ///@param _ID the id of the offer to be toggled
    ///@param _newPrice the new price of the offered token
    ///@notice only the seller can  change offered token price
    ///@notice emit event ChangeOfferPrice
    function changeOfferPrice(uint256 _ID, uint256 _newPrice) external {
        require(offers[_ID].offerID > 0, "Offer does not exist");
        Offer storage currentPurchase = offers[_ID];
        require(
            msg.sender == currentPurchase.seller,
            "Only seller can change price"
        );
        require(_newPrice > 0, "Price must be greater than 0");
        currentPurchase.price = _newPrice;
        offers[_ID] = currentPurchase;

        emit ChangeOfferPrice(_ID, msg.sender, _newPrice);
    }

    ///@dev function to change offered token price
    ///@param _ID the id of the offer to be toggled
    ///@param _newExpirationDate the new expiration date of the offer
    ///@notice only the seller can change expiration date
    ///@notice emit event ChangeOfferPrice
    function changeOfferExpirationDate(uint256 _ID, uint256 _newExpirationDate)
        external
    {
        require(offers[_ID].offerID > 0, "Offer does not exist");
        Offer storage currentPurchase = offers[_ID];
        require(
            msg.sender == currentPurchase.seller,
            "Only seller can change expiration date"
        );
        require(
            _newExpirationDate > block.timestamp,
            "Expiration time must be in the future"
        );
        currentPurchase.price = _newExpirationDate;
        offers[_ID] = currentPurchase;

        emit ChangeOfferExpirationDate(_ID, msg.sender, _newExpirationDate);
    }

    ///@dev function to change fee percentage
    ///@param _newFeePercentage the new fee percentage
    ///@notice only the owner can change fee percentage
    ///@notice emit event ChangeFeePercentage
    function changeFeePercentage(uint256 _newFeePercentage) external onlyOwner {
        require(_newFeePercentage > 0, "Fee percentage must be greater than 0");
        feePercentage = _newFeePercentage;
        emit ChangeFeePercentage(msg.sender, _newFeePercentage);
    }
}
