import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import type { MyERC20, ERC20MockToken } from "../../typechain";
import {
  deployContract,
  parseEther,
  fromEther,
  calcPurchasedTokens,
} from "../utils";
import { ethers } from "hardhat";
import { expect } from "chai";
import { BigNumber } from "ethers";

let deployer: SignerWithAddress;
let user1: SignerWithAddress;
let user2: SignerWithAddress;
let Token: MyERC20;

const name = "MyERC20";
const symbol = "MRC";
const initMintAmount = 1000;
const initTokenPrice = parseEther(0.5);
const initERC20TokenPrice = parseEther(0.5);
let PaymentToken: ERC20MockToken;
const initBuyLimit = 10;
const iSWhitelisted = false;

describe("MyERC20 Tests", () => {
  beforeEach(async () => {
    [deployer, user1, user2] = await ethers.getSigners();

    PaymentToken = (await deployContract(
      "ERC20MockToken",
      [],
      deployer
    )) as ERC20MockToken;

    const params = [
      name,
      symbol,
      initMintAmount,
      initTokenPrice,
      initERC20TokenPrice,
      PaymentToken.address,
      initBuyLimit,
      iSWhitelisted,
    ];

    Token = (await deployContract(name, params, deployer)) as MyERC20;
  });

  describe("Deploy Tests", () => {
    it("Should deploy and get correct address", async () => {
      expect(ethers.utils.isAddress(Token.address)).to.equal(true);
    });

    it(`Should deploy with ${initMintAmount} of supply for the owner of the contract`, async () => {
      expect(await Token.totalSupply()).to.equal(initMintAmount);
      expect(await Token.balanceOf(deployer.address)).to.equal(initMintAmount);
      expect(
        fromEther(await ethers.provider.getBalance(Token.address))
      ).to.equal(0);
    });

    it(`Should set params properly`, async () => {
      expect(await Token.name()).to.equal(name);
      expect(await Token.symbol()).to.equal(symbol);
      expect(await Token.decimals()).to.equal(18);
      expect(await Token.TOKEN_PRICE()).to.equal(initTokenPrice);
      expect(await Token.ERC_20_PAYMENT_TOKEN_PRICE()).to.equal(
        initERC20TokenPrice
      );
      expect(await Token.PAYMENT_TOKEN()).to.equal(PaymentToken.address);
      expect(await Token.BUY_LIMIT()).to.equal(initBuyLimit);
      expect(await Token.isWhitelistedSale()).to.equal(false);
    });

    it("Should reverted deploy when the params are incorrect", async () => {
      const incorrectParams = [name, symbol, 0, initTokenPrice];
      await expect(deployContract(name, incorrectParams, deployer)).to.be
        .reverted;
    });
  });

  describe("Transactions Tests", () => {
    describe("Transfer Tests", () => {
      it(`Should transfer tokens by owner to another address and update balance`, async () => {
        expect(await Token.balanceOf(user1.address)).to.equal(0);
        await Token.connect(deployer).transfer(user1.address, 10);
        expect(await Token.balanceOf(user1.address)).to.equal(10);
        expect(await Token.balanceOf(deployer.address)).to.equal(
          initMintAmount - 10
        );
      });

      it("Should revert transfer when sender doesn`t have enough tokens, and shouldn't change sender balance", async () => {
        const initBalance = await Token.balanceOf(deployer.address);
        const senderInitBalance = await Token.balanceOf(user1.address);
        await expect(Token.transfer(user1.address, 10000)).to.be.revertedWith(
          "ERC20: transfer amount exceeds balance"
        );
        expect(await Token.balanceOf(deployer.address)).to.equal(initBalance);
        expect(await Token.balanceOf(user1.address)).to.equal(
          senderInitBalance
        );
      });

      it("Should give another address the approval to transfer tokens", async () => {
        await Token.transfer(user1.address, 100);
        expect(await Token.balanceOf(user1.address)).to.equal(100);
        await Token.connect(user1).approve(deployer.address, 100);
        expect(await Token.allowance(user1.address, deployer.address)).to.equal(
          100
        );
        await Token.transferFrom(user1.address, user2.address, 100);
        expect(await Token.balanceOf(user2.address)).to.equal(100);
        expect(await Token.balanceOf(user1.address)).to.equal(0);

        expect(await Token.allowance(user1.address, deployer.address)).to.equal(
          0
        );
      });

      it("Should revert transfer when sender doesn`t have approval", async () => {
        await expect(
          Token.transferFrom(user1.address, user2.address, 100)
        ).to.be.revertedWith("ERC20: insufficient allowance");
      });
    });

    describe("Purchase Test", () => {
      let decimals: number;
      let tokenPrice: BigNumber;
      let erc20TokenPrice: BigNumber;
      beforeEach(async () => {
        decimals = await Token.decimals();
        tokenPrice = await Token.TOKEN_PRICE();
        erc20TokenPrice = await Token.ERC_20_PAYMENT_TOKEN_PRICE();
      });

      describe("Public Sale", () => {
        beforeEach(async () => {
          expect(await Token.isWhitelistedSale()).to.equal(false);
        });

        it("Should buy tokens by user and update the balance", async () => {
          expect(await Token.balanceOf(user1.address)).to.equal(0);
          const ethAmount = parseEther(5);

          const purchasedTokensAmount = calcPurchasedTokens(
            ethAmount,
            decimals,
            tokenPrice
          );

          await expect(Token.connect(user1).buyTokens({ value: ethAmount }))
            .to.to.be.emit(Token, "PurchaseTokens")
            .withArgs(user1.address, purchasedTokensAmount, ethAmount);

          const userBalance = await Token.balanceOf(user1.address);
          expect(Number(userBalance)).to.equal(purchasedTokensAmount);
        });

        it("Should revert buy tokens when buyer exceed buy limit", async () => {
          const ethAmount = parseEther(6);

          await expect(
            Token.connect(user1).buyTokens({ value: ethAmount })
          ).to.be.revertedWith("Purchase exceed tokens limit");

          await expect(
            Token.connect(user1).buyTokens({ value: parseEther(0) })
          ).to.be.revertedWith("Value must be greater than 0");
        });

        it("Should allow to buy tokens by ERC20 token and update the balance", async () => {
          const payByERC20Amount = parseEther(2);
          const userERC20InitBalance = parseEther(100);
          expect(Number(await Token.balanceOf(user1.address))).to.equal(0);
          expect(await PaymentToken.balanceOf(Token.address)).to.equal(0);

          expect(await PaymentToken.balanceOf(user1.address)).to.equal(0);
          await PaymentToken.connect(user1).mint(
            user1.address,
            userERC20InitBalance
          );
          expect(await PaymentToken.balanceOf(user1.address)).to.equal(
            userERC20InitBalance
          );

          expect(
            await PaymentToken.allowance(user1.address, Token.address)
          ).to.equal(0);

          await PaymentToken.connect(user1).approve(
            Token.address,
            payByERC20Amount
          );

          expect(
            await PaymentToken.allowance(user1.address, Token.address)
          ).to.equal(payByERC20Amount);

          const purchasedTokensAmount = calcPurchasedTokens(
            payByERC20Amount,
            decimals,
            erc20TokenPrice
          );

          await expect(Token.connect(user1).buyTokenByERC20(payByERC20Amount))
            .to.be.emit(Token, "PurchaseByERC20")
            .withArgs(
              user1.address,
              purchasedTokensAmount,
              payByERC20Amount,
              PaymentToken.address
            );

          expect(Number(await Token.balanceOf(user1.address))).to.equal(
            purchasedTokensAmount
          );

          expect(await PaymentToken.balanceOf(Token.address)).to.equal(
            payByERC20Amount
          );
        });

        it("Should revert buy tokens by ERC20 when buyer exceed buy limit", async () => {
          const payByERC20Amount = parseEther(20);
          const userPaymentTokenAmount = parseEther(100);

          await PaymentToken.connect(user1).mint(
            user1.address,
            userPaymentTokenAmount
          );

          await PaymentToken.connect(user1).approve(
            Token.address,
            payByERC20Amount
          );

          await expect(
            Token.connect(user1).buyTokenByERC20(payByERC20Amount)
          ).to.be.revertedWith("Purchase exceed tokens limit");

          await expect(
            Token.connect(user1).buyTokenByERC20(0)
          ).to.be.revertedWith("Value must be greater than 0");
        });

        it("Should revert buy tokens by ERC20 when buyer insufficient ERC20 balance", async () => {
          const payByERC20Amount = parseEther(2);
          const userPaymentTokenAmount = parseEther(1);

          await PaymentToken.connect(user2).mint(
            user1.address,
            userPaymentTokenAmount
          );

          await PaymentToken.connect(user2).approve(
            Token.address,
            userPaymentTokenAmount
          );

          await expect(
            Token.connect(user2).buyTokenByERC20(payByERC20Amount)
          ).to.be.revertedWith("You don`t have enough tokens");
        });
      });

      describe("Private Sale", () => {
        beforeEach(async () => {
          expect(await Token.isWhitelistedSale()).to.equal(false);
          await Token.connect(deployer).toggleIsWhitelistedSale();
          expect(await Token.isWhitelistedSale()).to.equal(true);
        });

        it("Should buy tokens when user is whitelisted and update the balance", async () => {
          const ethAmount = parseEther(5);

          expect(await Token.balanceOf(user1.address)).to.equal(0);
          expect(await Token.isWhitelisted(user1.address)).to.equal(false);

          await Token.connect(deployer).updateWhitelist([user1.address], true);
          expect(await Token.isWhitelisted(user1.address)).to.equal(true);

          const purchasedTokensAmount = calcPurchasedTokens(
            ethAmount,
            decimals,
            tokenPrice
          );

          await expect(Token.connect(user1).buyTokens({ value: ethAmount }))
            .to.to.to.be.emit(Token, "PurchaseTokens")
            .withArgs(user1.address, purchasedTokensAmount, ethAmount);

          const userBalance = await Token.balanceOf(user1.address);
          expect(Number(userBalance)).to.equal(purchasedTokensAmount);
        });

        it("Should reverted buy tokens when user is not whitelisted", async () => {
          const ethAmount = parseEther(5);

          expect(await Token.balanceOf(user1.address)).to.equal(0);
          expect(await Token.isWhitelisted(user1.address)).to.equal(false);

          await expect(
            Token.connect(user1).buyTokens({ value: ethAmount })
          ).to.be.revertedWith("User is not authorized to purchase");

          expect(await Token.balanceOf(user1.address)).to.equal(0);
        });

        it("Should buy tokens by ERC20 when user is whitelisted and update the balance", async () => {
          const payByERC20Amount = parseEther(1);
          const userPaymentTokenAmount = parseEther(100);
          expect(Number(await Token.balanceOf(user1.address))).to.equal(0);
          expect(await PaymentToken.balanceOf(Token.address)).to.equal(0);

          await PaymentToken.connect(user1).mint(
            user1.address,
            userPaymentTokenAmount
          );

          await PaymentToken.connect(user1).approve(
            Token.address,
            payByERC20Amount
          );

          await Token.connect(deployer).updateWhitelist([user1.address], true);
          expect(await Token.isWhitelisted(user1.address)).to.equal(true);

          const purchasedTokensAmount = calcPurchasedTokens(
            payByERC20Amount,
            decimals,
            erc20TokenPrice
          );

          await expect(Token.connect(user1).buyTokenByERC20(payByERC20Amount))
            .to.be.emit(Token, "PurchaseByERC20")
            .withArgs(
              user1.address,
              purchasedTokensAmount,
              payByERC20Amount,
              PaymentToken.address
            );

          expect(Number(await Token.balanceOf(user1.address))).to.equal(
            purchasedTokensAmount
          );

          expect(await PaymentToken.balanceOf(Token.address)).to.equal(
            payByERC20Amount
          );
        });

        it("Should reverted buy tokens by ERC20 when user is not whitelisted", async () => {
          const payByERC20Amount = parseEther(1);
          const userPaymentTokenAmount = parseEther(100);
          expect(Number(await Token.balanceOf(user1.address))).to.equal(0);
          expect(await PaymentToken.balanceOf(Token.address)).to.equal(0);
          expect(await Token.isWhitelisted(user1.address)).to.equal(false);

          await PaymentToken.connect(user1).mint(
            user1.address,
            userPaymentTokenAmount
          );

          await PaymentToken.connect(user1).approve(
            Token.address,
            payByERC20Amount
          );

          await expect(
            Token.connect(user1).buyTokenByERC20(payByERC20Amount)
          ).to.be.revertedWith("User is not authorized to purchase");

          expect(Number(await Token.balanceOf(user1.address))).to.equal(0);
          expect(await PaymentToken.balanceOf(Token.address)).to.equal(0);
        });
      });
    });

    describe("Mint Tests", () => {
      it("Should mint tokens by the owner", async () => {
        const mintValue = 1234;
        expect(await Token.balanceOf(deployer.address)).to.equal(
          initMintAmount
        );

        await expect(Token.mint(deployer.address, mintValue))
          .to.emit(Token, "Mint")
          .withArgs(deployer.address, mintValue);

        expect(await Token.balanceOf(deployer.address)).to.equal(
          initMintAmount + mintValue
        );
      });

      it("Should revert mint function when caller is not an owner", async () => {
        await expect(
          Token.connect(user1).mint(user1.address, 100)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("Should revert mint function when amount is 0", async () => {
        expect(await Token.balanceOf(deployer.address)).to.equal(
          initMintAmount
        );
        await expect(Token.mint(deployer.address, 0)).to.be.revertedWith(
          "Value must be greater than 0"
        );
        expect(await Token.balanceOf(deployer.address)).to.equal(
          initMintAmount
        );
      });
    });

    describe("Burn Tests", () => {
      it("Should burn tokens", async () => {
        expect(await Token.balanceOf(deployer.address)).to.equal(
          initMintAmount
        );
        await Token.connect(deployer).burn(10);
        expect(await Token.balanceOf(deployer.address)).to.equal(
          initMintAmount - 10
        );
      });

      it("Should revert when burn amount exceeds balance", async () => {
        expect(await Token.balanceOf(user1.address)).to.equal(0);
        await expect(Token.connect(user1).burn(10)).to.be.revertedWith(
          "ERC20: burn amount exceeds balance"
        );
        expect(await Token.balanceOf(user1.address)).to.equal(0);
      });
    });

    describe("Admin Tests", () => {
      describe("Update Price Tests", () => {
        it("Should change token price and buy limit by owner", async () => {
          const newPrice = ethers.utils.parseEther("0.1");
          const newERC20Price = ethers.utils.parseEther("0.1");
          const newLimit = 100;
          expect(await Token.TOKEN_PRICE()).to.equal(initTokenPrice);
          expect(await Token.BUY_LIMIT()).to.equal(initBuyLimit);
          expect(await Token.ERC_20_PAYMENT_TOKEN_PRICE()).to.equal(
            initERC20TokenPrice
          );
          await expect(
            Token.connect(deployer).changeTokenPriceAndLimit(
              newPrice,
              newERC20Price,
              newLimit
            )
          )
            .to.be.emit(Token, "ChangeTokenPriceAndLimit")
            .withArgs(deployer.address, newPrice, newERC20Price, newLimit);

          expect(await Token.TOKEN_PRICE()).to.equal(newPrice);
          expect(await Token.BUY_LIMIT()).to.equal(newLimit);
          expect(await Token.ERC_20_PAYMENT_TOKEN_PRICE()).to.equal(
            newERC20Price
          );
        });

        it("Should revert change token price when caller is not the owner or invalid params", async () => {
          expect(await Token.TOKEN_PRICE()).to.equal(initTokenPrice);
          expect(await Token.BUY_LIMIT()).to.equal(initBuyLimit);

          await expect(
            Token.connect(user1).changeTokenPriceAndLimit(
              parseEther(0.1),
              parseEther(0.1),
              100
            )
          ).to.be.revertedWith("Ownable: caller is not the owner");

          await expect(
            Token.connect(deployer).changeTokenPriceAndLimit(
              parseEther(0),
              parseEther(0.1),
              100
            )
          ).to.be.revertedWith("Price must be greater than 0");

          await expect(
            Token.connect(deployer).changeTokenPriceAndLimit(
              parseEther(0.1),
              parseEther(0.1),
              0
            )
          ).to.be.revertedWith("Limit must be greater than 0");
          expect(await Token.TOKEN_PRICE()).to.equal(initTokenPrice);
          expect(await Token.BUY_LIMIT()).to.equal(initBuyLimit);
        });
      });

      describe("Whitelist Tests", () => {
        it("Should toggle whitelisted sale by the owner", async () => {
          expect(await Token.isWhitelistedSale()).to.equal(false);
          await Token.connect(deployer).toggleIsWhitelistedSale();
          expect(await Token.isWhitelistedSale()).to.equal(true);
          await Token.connect(deployer).toggleIsWhitelistedSale();
          expect(await Token.isWhitelistedSale()).to.equal(false);
        });

        it("Should revert enable whitelisted sale when a caller is not the owner", async () => {
          expect(await Token.isWhitelistedSale()).to.equal(false);
          await expect(
            Token.connect(user1).toggleIsWhitelistedSale()
          ).to.be.revertedWith("Ownable: caller is not the owner");
          expect(await Token.isWhitelistedSale()).to.equal(false);
        });

        it("Should add a users to whitelist by owner", async () => {
          const users = [user1.address, user2.address];
          expect(await Token.isWhitelisted(user1.address)).to.equal(false);
          expect(await Token.isWhitelisted(user2.address)).to.equal(false);
          await Token.connect(deployer).updateWhitelist(users, true);
          expect(await Token.isWhitelisted(user1.address)).to.equal(true);
          expect(await Token.isWhitelisted(user2.address)).to.equal(true);

          await Token.connect(deployer).updateWhitelist([user2.address], false);
          expect(await Token.isWhitelisted(user2.address)).to.equal(false);
        });

        it("Should revert update whitelist when the caller is not the owner", async () => {
          expect(await Token.isWhitelisted(user2.address)).to.equal(false);
          await expect(
            Token.connect(user1).updateWhitelist([user2.address], true)
          ).to.be.revertedWith("Ownable: caller is not the owner");
          expect(await Token.isWhitelisted(user2.address)).to.equal(false);
        });
      });

      describe("Withdraw Tests", () => {
        it("Should withdraw funds by owner", async () => {
          expect(
            fromEther(await ethers.provider.getBalance(Token.address))
          ).to.equal(0);
          const ethAmount = parseEther(5);

          await expect(Token.connect(user1).buyTokens({ value: ethAmount })).to
            .not.be.reverted;

          expect(
            fromEther(await ethers.provider.getBalance(Token.address))
          ).to.equal(fromEther(ethAmount));

          await expect(Token.connect(deployer).withdrawFunds())
            .to.be.emit(Token, "WithdrawTokens")
            .withArgs(deployer.address, ethAmount);

          expect(
            fromEther(await ethers.provider.getBalance(Token.address))
          ).to.equal(0);
        });

        it("Should revert withdraw funds when caller is not owner", async () => {
          expect(
            fromEther(await ethers.provider.getBalance(Token.address))
          ).to.equal(0);
          const ethAmount = parseEther(5);

          await expect(Token.connect(user1).buyTokens({ value: ethAmount })).to
            .not.be.reverted;

          expect(
            fromEther(await ethers.provider.getBalance(Token.address))
          ).to.equal(fromEther(ethAmount));

          await expect(Token.connect(user1).withdrawFunds()).to.be.revertedWith(
            "Ownable: caller is not the owner"
          );

          expect(
            fromEther(await ethers.provider.getBalance(Token.address))
          ).to.equal(fromEther(ethAmount));
        });

        it("Should revert when no funds to be withdraw", async () => {
          await expect(
            Token.connect(deployer).withdrawFunds()
          ).to.be.revertedWith("There are no funds to be withdraw");
        });

        it("Should withdraw ERC20 funds by owner", async () => {
          const payByERC20Amount = parseEther(2);
          const userERC20InitBalance = parseEther(100);
          expect(await PaymentToken.balanceOf(Token.address)).to.equal(0);

          await PaymentToken.connect(user1).mint(
            user1.address,
            userERC20InitBalance
          );

          await PaymentToken.connect(user1).approve(
            Token.address,
            payByERC20Amount
          );

          await expect(Token.connect(user1).buyTokenByERC20(payByERC20Amount))
            .to.be.not.reverted;

          expect(await PaymentToken.balanceOf(Token.address)).to.equal(
            payByERC20Amount
          );

          await expect(
            Token.connect(user1).withdrawERC20Funds()
          ).to.be.revertedWith("Ownable: caller is not the owner");

          await expect(Token.connect(deployer).withdrawERC20Funds())
            .to.be.emit(Token, "WithdrawERC20")
            .withArgs(deployer.address, payByERC20Amount, PaymentToken.address);

          expect(await PaymentToken.balanceOf(Token.address)).to.equal(0);
          expect(await PaymentToken.balanceOf(deployer.address)).to.equal(
            payByERC20Amount
          );
        });

        it("Should revert withdraw ERC20 funds when no funds to be withdraw or caller is not owner", async () => {
          await expect(
            Token.connect(deployer).withdrawERC20Funds()
          ).to.be.revertedWith("There are no funds to be withdraw");

          await expect(
            Token.connect(user1).withdrawERC20Funds()
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });
      });
    });
  });
});
