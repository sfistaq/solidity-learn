import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import type { MyTokenMarket, ERC20MockToken } from "../../typechain";
import {
  deployContract,
  parseEther,
  fromEther,
  calcPurchasedTokens,
  getEthBalanceHelper,
  calcGasCostHelper,
  calcFeeFromTransaction,
  createTimestampInSeconds,
  addWeeks,
  increaseTime,
  duration,
} from "../utils";
import { ethers } from "hardhat";
import { expect } from "chai";

let deployer: SignerWithAddress;
let seller: SignerWithAddress;
let buyer: SignerWithAddress;
let MarketPlace: MyTokenMarket;
let OfferedToken: ERC20MockToken;

const feePercentage = 10;

describe("MyTokenMarket Tests", () => {
  beforeEach(async () => {
    [deployer, seller, buyer] = await ethers.getSigners();

    const params = [feePercentage];

    MarketPlace = (await deployContract(
      "MyTokenMarket",
      params,
      deployer
    )) as MyTokenMarket;

    OfferedToken = (await deployContract(
      "ERC20MockToken",
      [],
      seller
    )) as ERC20MockToken;
  });

  describe("MyTokenMarket Deploy Test", () => {
    it("Should deploy and get correct address", async () => {
      expect(ethers.utils.isAddress(MarketPlace.address)).to.equal(true);
      expect(await MarketPlace.owner()).to.equal(deployer.address);
    });

    it(`Should set initially feeAccount and, fee: ${feePercentage}%`, async () => {
      expect(await MarketPlace.feePercentage()).to.equal(feePercentage);
      expect(await MarketPlace.feeAccount()).to.equal(deployer.address);
    });

    it("Should reverted deploy when the params are incorrect", async () => {
      await expect(deployContract("MyTokenMarket", [], deployer)).to.be
        .reverted;
    });
  });

  describe("OfferedToken Deploy Test", () => {
    it("Should deploy and get correct address", async () => {
      expect(ethers.utils.isAddress(OfferedToken.address)).to.equal(true);
      expect(await OfferedToken.owner()).to.equal(seller.address);
    });

    it(`Should set params properly`, async () => {
      expect(await OfferedToken.name()).to.equal("ERC20 Mock Token");
      expect(await OfferedToken.symbol()).to.equal("MOCK");
      expect(await OfferedToken.decimals()).to.equal(18);
    });
  });

  describe("Transactions Tests", () => {
    const initMintedForSeller = parseEther(1000);
    const expirationDate = createTimestampInSeconds(addWeeks(1)); // one week from now
    const tokensPrice = parseEther(1);

    beforeEach(async () => {
      /// @notice mint tokens to seller and approve to SSMarketPlace
      expect(await OfferedToken.balanceOf(seller.address)).to.equal(0);
      expect(
        await OfferedToken.allowance(seller.address, MarketPlace.address)
      ).to.equal(0);

      await OfferedToken.connect(seller).mint(
        seller.address,
        initMintedForSeller
      );
      expect(await OfferedToken.balanceOf(seller.address)).to.equal(
        initMintedForSeller
      );
      const balance = await OfferedToken.balanceOf(seller.address);

      await OfferedToken.connect(seller).approve(MarketPlace.address, balance);
      expect(
        await OfferedToken.allowance(seller.address, MarketPlace.address)
      ).to.equal(balance);
    });

    describe("Crete Offer Tests", () => {
      it("Should create offer and update seller balance", async () => {
        expect(await MarketPlace.offersCount()).to.equal(0);
        const offeredTokensAmount = parseEther(500);

        await expect(
          MarketPlace.connect(seller).createOffer(
            OfferedToken.address,
            offeredTokensAmount,
            tokensPrice,
            expirationDate
          )
        )
          .to.emit(MarketPlace, "CreateOffer")
          .withArgs(
            1,
            seller.address,
            OfferedToken.address,
            offeredTokensAmount,
            tokensPrice,
            expirationDate
          );

        expect(await MarketPlace.offersCount()).to.equal(1);
        expect(await OfferedToken.balanceOf(seller.address)).to.equal(
          initMintedForSeller.sub(offeredTokensAmount)
        );
      });

      describe("Revert create offer tests", () => {
        it("Should revert create offer when seller balance is insufficient", async () => {
          const offeredTokensAmount = parseEther(1001);
          expect(await OfferedToken.balanceOf(seller.address)).to.equal(
            initMintedForSeller
          );

          await expect(
            MarketPlace.connect(seller).createOffer(
              OfferedToken.address,
              offeredTokensAmount,
              tokensPrice,
              expirationDate
            )
          ).to.be.revertedWith("Insufficient balance");

          expect(await OfferedToken.balanceOf(seller.address)).to.equal(
            initMintedForSeller
          );
        });

        it("Should revert create offer when token allowance is insufficient", async () => {
          const balance = await OfferedToken.balanceOf(seller.address);
          const newAllowance = parseEther(10);
          const exceedAllowanceOfferAmount = parseEther(100);
          expect(
            await OfferedToken.allowance(seller.address, MarketPlace.address)
          ).to.equal(balance);

          await OfferedToken.connect(seller).approve(
            MarketPlace.address,
            newAllowance
          );

          expect(
            await OfferedToken.allowance(seller.address, MarketPlace.address)
          ).to.equal(newAllowance);

          expect(await OfferedToken.balanceOf(seller.address)).to.equal(
            initMintedForSeller
          );

          await expect(
            MarketPlace.connect(seller).createOffer(
              OfferedToken.address,
              exceedAllowanceOfferAmount,
              tokensPrice,
              expirationDate
            )
          ).to.be.revertedWith("Insufficient allowance");

          expect(await OfferedToken.balanceOf(seller.address)).to.equal(
            initMintedForSeller
          );
        });

        it("Should revert create offer when the expiration date is past", async () => {
          const offeredTokensAmount = parseEther(100);
          const wrongExpirationDate = createTimestampInSeconds("2021-07-10");
          expect(await OfferedToken.balanceOf(seller.address)).to.equal(
            initMintedForSeller
          );

          await expect(
            MarketPlace.connect(seller).createOffer(
              OfferedToken.address,
              offeredTokensAmount,
              tokensPrice,
              wrongExpirationDate
            )
          ).to.be.revertedWith("Expiration time must be in the future");

          expect(await OfferedToken.balanceOf(seller.address)).to.equal(
            initMintedForSeller
          );
        });
      });
    });

    describe("Buy Tokens Tests", async () => {
      const offeredTokensAmount = parseEther(1000);
      const paidAmount = parseEther(100);
      const purchasedTokensAmount = calcPurchasedTokens(
        paidAmount,
        18,
        tokensPrice
      );

      it("Should be able to buy amount of tokens from offer", async () => {
        expect(await OfferedToken.balanceOf(buyer.address)).to.equal(0);
        const initSellerBalance = await getEthBalanceHelper(seller.address);
        const initBuyerBalance = await getEthBalanceHelper(buyer.address);
        const initFeeAccountBalance = await getEthBalanceHelper(
          await MarketPlace.feeAccount()
        );

        const createOfferTx = await MarketPlace.connect(seller).createOffer(
          OfferedToken.address,
          offeredTokensAmount,
          tokensPrice,
          expirationDate
        );

        await expect(createOfferTx)
          .to.emit(MarketPlace, "CreateOffer")
          .withArgs(
            1,
            seller.address,
            OfferedToken.address,
            offeredTokensAmount,
            tokensPrice,
            expirationDate
          );

        expect(await MarketPlace.offersCount()).to.equal(1);
        expect((await MarketPlace.offers(1)).amount).to.equal(
          offeredTokensAmount
        );
        const buyTokenTx = await MarketPlace.connect(buyer).buyTokens(1, {
          value: paidAmount,
        });

        await expect(buyTokenTx)
          .to.emit(MarketPlace, "PurchaseTokens")
          .withArgs(1, buyer.address, purchasedTokensAmount, paidAmount);

        expect(await OfferedToken.balanceOf(buyer.address)).to.equal(
          purchasedTokensAmount
        );
        expect((await MarketPlace.offers(1)).amount).to.equal(
          parseEther(fromEther(offeredTokensAmount) - purchasedTokensAmount)
        );

        const gasUsedToCreateOffer = await calcGasCostHelper(createOfferTx);
        const gasUsedToBuyTokens = await calcGasCostHelper(buyTokenTx);

        const transactionFee = calcFeeFromTransaction(
          tokensPrice,
          purchasedTokensAmount,
          feePercentage
        );

        const afterSellerBalance = await getEthBalanceHelper(seller.address);
        const afterBuyerBalance = await getEthBalanceHelper(buyer.address);
        const afterFeeAccountBalance = await getEthBalanceHelper(
          await MarketPlace.feeAccount()
        );

        expect(afterBuyerBalance).to.equal(
          initBuyerBalance.sub(gasUsedToBuyTokens).sub(paidAmount)
        );
        expect(afterSellerBalance).to.equal(
          initSellerBalance
            .add(paidAmount)
            .sub(gasUsedToCreateOffer.add(transactionFee))
        );
        expect(afterFeeAccountBalance).to.equal(
          initFeeAccountBalance.add(transactionFee)
        );
      });

      describe("Buy Tokens Reverted Tests", () => {
        beforeEach(async () => {
          expect(await MarketPlace.offersCount()).to.equal(0);
          expect(
            await MarketPlace.connect(seller).createOffer(
              OfferedToken.address,
              offeredTokensAmount,
              tokensPrice,
              expirationDate
            )
          );
          expect(await MarketPlace.offersCount()).to.equal(1);
        });

        it("Should revert buy tokens when offer is not exist", async () => {
          await expect(
            MarketPlace.connect(buyer).buyTokens(2, {
              value: paidAmount,
            })
          ).to.be.revertedWith("Offer does not exist");
        });

        it("Should revert buy tokens when buyer is seller", async () => {
          await expect(
            MarketPlace.connect(seller).buyTokens(1, {
              value: paidAmount,
            })
          ).to.be.revertedWith("Offer does belong to you");
        });

        it("Should revert buy tokens when buyer send insufficient value", async () => {
          const insufficientPaidAmount = parseEther(0.5);
          await expect(
            MarketPlace.connect(buyer).buyTokens(1, {
              value: insufficientPaidAmount,
            })
          ).to.be.revertedWith("Insufficient value");
        });

        it("Should revert buy tokens when buyer send value exceed sale amount", async () => {
          const exceedPayment = parseEther(1001);
          await expect(
            MarketPlace.connect(buyer).buyTokens(1, {
              value: exceedPayment,
            })
          ).to.be.revertedWith("Insufficient sale amount");
        });

        it("Should revert buy tokens when offer is inactive", async () => {
          expect((await MarketPlace.offers(1)).isActive).to.equal(true);
          await MarketPlace.connect(seller).toggleOfferIsActive(1, false);
          expect((await MarketPlace.offers(1)).isActive).to.equal(false);
          await expect(
            MarketPlace.connect(buyer).buyTokens(1, {
              value: paidAmount,
            })
          ).to.be.revertedWith("Offer is not active");
        });

        it("Should revert buy tokens when offer is expired", async () => {
          await increaseTime(duration.days(8));
          await expect(
            MarketPlace.connect(buyer).buyTokens(1, {
              value: paidAmount,
            })
          ).to.be.revertedWith("Offer expired");
        });
      });
    });

    describe("Admin Tests", () => {
      const adminExpirationDate = createTimestampInSeconds(addWeeks(2));
      beforeEach(async () => {
        const offeredTokensAmount = parseEther(1000);
        expect(await MarketPlace.offersCount()).to.equal(0);
        expect(
          await MarketPlace.connect(seller).createOffer(
            OfferedToken.address,
            offeredTokensAmount,
            tokensPrice,
            adminExpirationDate
          )
        );
        expect(await MarketPlace.offersCount()).to.equal(1);
      });

      it("Should toggle offer is active by owner or seller", async () => {
        expect((await MarketPlace.offers(1)).isActive).to.equal(true);
        await expect(MarketPlace.connect(seller).toggleOfferIsActive(1, false))
          .to.to.be.emit(MarketPlace, "ToggleOffer")
          .withArgs(1, seller.address, false);

        await expect(MarketPlace.connect(deployer).toggleOfferIsActive(1, true))
          .to.to.be.emit(MarketPlace, "ToggleOffer")
          .withArgs(1, deployer.address, true);

        expect((await MarketPlace.offers(1)).isActive).to.equal(true);
      });

      it("Should revert toggle offer when caller is not owner or seller or offer not exist", async () => {
        expect((await MarketPlace.offers(1)).isActive).to.equal(true);

        await expect(
          MarketPlace.connect(buyer).toggleOfferIsActive(1, false)
        ).to.be.revertedWith("Only seller can toggle offer status");

        await expect(
          MarketPlace.connect(buyer).toggleOfferIsActive(3, false)
        ).to.be.revertedWith("Offer does not exist");

        expect((await MarketPlace.offers(1)).isActive).to.equal(true);
      });

      it("Should able to change price by seller", async () => {
        const newPrice = parseEther(0.5);
        expect((await MarketPlace.offers(1)).price).to.equal(tokensPrice);
        await expect(MarketPlace.connect(seller).changeOfferPrice(1, newPrice))
          .to.to.be.emit(MarketPlace, "ChangeOfferPrice")
          .withArgs(1, seller.address, newPrice);

        expect((await MarketPlace.offers(1)).price).to.equal(newPrice);
      });

      it("Should revert change price when caller is not seller or offer is not exist", async () => {
        const newPrice = parseEther(0.5);
        expect((await MarketPlace.offers(1)).price).to.equal(tokensPrice);

        await expect(
          MarketPlace.connect(buyer).changeOfferPrice(1, newPrice)
        ).to.be.revertedWith("Only seller can change price");

        await expect(
          MarketPlace.connect(seller).changeOfferPrice(1, 0)
        ).to.be.revertedWith("Price must be greater than 0");

        await expect(
          MarketPlace.connect(seller).changeOfferPrice(3, newPrice)
        ).to.be.revertedWith("Offer does not exist");

        expect((await MarketPlace.offers(1)).price).to.equal(tokensPrice);
      });

      it("Should able to change expiration date by seller", async () => {
        const newExpirationDate = createTimestampInSeconds(addWeeks(3));
        expect((await MarketPlace.offers(1)).expirationDate).to.equal(
          adminExpirationDate
        );
        await expect(
          MarketPlace.connect(seller).changeOfferExpirationDate(
            1,
            newExpirationDate
          )
        )
          .to.to.be.emit(MarketPlace, "ChangeOfferExpirationDate")
          .withArgs(1, seller.address, newExpirationDate);

        expect((await MarketPlace.offers(1)).price).to.equal(newExpirationDate);
      });

      it("Should revert change expiration date when caller is not seller or offer is not exist", async () => {
        const newExpirationDate = createTimestampInSeconds(addWeeks(3));
        const wrongExpirationDate = createTimestampInSeconds("2021-07-10");
        expect((await MarketPlace.offers(1)).expirationDate).to.equal(
          adminExpirationDate
        );
        await expect(
          MarketPlace.connect(deployer).changeOfferExpirationDate(
            1,
            newExpirationDate
          )
        ).to.be.revertedWith("Only seller can change expiration date");

        await expect(
          MarketPlace.connect(seller).changeOfferExpirationDate(
            3,
            newExpirationDate
          )
        ).to.be.revertedWith("Offer does not exist");

        await expect(
          MarketPlace.connect(seller).changeOfferExpirationDate(
            1,
            wrongExpirationDate
          )
        ).to.be.revertedWith("Expiration time must be in the future");
      });

      it("Should be able to change fee percentage by owner", async () => {
        const newFeePercentage = 5;
        expect(await MarketPlace.feePercentage()).to.equal(feePercentage);

        await expect(
          MarketPlace.connect(deployer).changeFeePercentage(newFeePercentage)
        )
          .to.to.be.emit(MarketPlace, "ChangeFeePercentage")
          .withArgs(deployer.address, newFeePercentage);

        expect(await MarketPlace.feePercentage()).to.equal(newFeePercentage);
      });

      it("Should revert change fee percentage when caller is not owner or percentage is equal 0", async () => {
        expect(await MarketPlace.feePercentage()).to.equal(feePercentage);

        await expect(
          MarketPlace.connect(seller).changeFeePercentage(3)
        ).to.be.revertedWith("Ownable: caller is not the owner");

        await expect(
          MarketPlace.connect(deployer).changeFeePercentage(0)
        ).to.be.revertedWith("Fee percentage must be greater than 0");

        expect(await MarketPlace.feePercentage()).to.equal(feePercentage);
      });
    });
  });
});
