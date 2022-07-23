import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { MyNFT } from "../../typechain-types/contracts/nft";
import {
  deployContract,
  parseEther,
  getEthBalanceHelper,
  calcGasCostHelper,
} from "../utils";
import { ethers } from "hardhat";
import { expect } from "chai";

let deployer: SignerWithAddress;
let buyer1: SignerWithAddress;
let buyer2: SignerWithAddress;
let buyer3: SignerWithAddress;
let Token: MyNFT;

const name = "MyNFT";
const symbol = "MNFT";
const tokenPriceInWei = parseEther(0.1);
const maxSupply = 3;
const limitPerUser = 2;
const isInitEnabled = false;
const baseURI = "https://s3.test.com/snft-test/";

describe("MyNFT Token Tests", () => {
  beforeEach(async () => {
    [deployer, buyer1, buyer2, buyer3] = await ethers.getSigners();

    const params = [
      name,
      symbol,
      tokenPriceInWei,
      maxSupply,
      limitPerUser,
      isInitEnabled,
      baseURI,
    ];

    Token = (await deployContract("MyNFT", params, deployer)) as MyNFT;
  });

  describe("Deploy Tests", () => {
    it("Should Token is deploy and get correct address", async () => {
      expect(ethers.utils.isAddress(Token.address)).to.equal(true);
    });

    it(`Should set name: ${name}, symbol: ${symbol}, max supply: ${maxSupply}, limit per wallet: ${limitPerUser} and initial disabled mint`, async () => {
      expect(await Token.name()).to.equal(name);
      expect(await Token.symbol()).to.equal(symbol);
      expect(await Token.maxSupply()).to.equal(maxSupply);
      expect(await Token.isMintEnabled()).to.be.false;
      expect(await Token.limitPerUser()).to.equal(limitPerUser);
      expect(await Token.baseURI()).to.equal(baseURI);
    });

    it("Should support interfaces", async () => {
      // ERC721Enumerable
      expect(await Token.supportsInterface("0x780e9d63")).to.be.true;
      // ERC165
      expect(await Token.supportsInterface("0x01ffc9a7")).to.be.true;
    });
  });

  describe("Transactions Tests", () => {
    beforeEach(async () => {
      expect(await Token.isMintEnabled()).to.be.false;
      await Token.connect(deployer).toggleIsSaleEnabled(true);
      expect(await Token.isMintEnabled()).to.be.true;
    });

    it("Should buy token by user and update balance", async () => {
      const buyer1BalanceBefore = await getEthBalanceHelper(buyer1.address);
      expect(await Token.totalSupply()).to.equal(0);

      const buyTokenTx = await Token.connect(buyer1).purchaseToken({
        value: tokenPriceInWei,
      });
      await expect(buyTokenTx)
        .to.emit(Token, "MintToken")
        .withArgs(buyer1.address, 1, `${baseURI}1`);

      expect(await Token.totalSupply()).to.equal(1);
      expect(await Token.balanceOf(buyer1.address)).to.equal(1);
      expect(await Token.ownerOf(1)).to.equal(buyer1.address);
      expect(await Token.tokenURI(1)).to.equal(`${baseURI}1`);

      const txGasCost = await calcGasCostHelper(buyTokenTx);
      const buyer1BalanceAfter = await getEthBalanceHelper(buyer1.address);
      expect(buyer1BalanceAfter).to.equal(
        buyer1BalanceBefore.sub(tokenPriceInWei).sub(txGasCost)
      );
    });

    it("Should revert buy token when user exceed limit per wallet", async () => {
      expect(await Token.totalSupply()).to.equal(0);

      await expect(
        Token.connect(buyer1).purchaseToken({
          value: tokenPriceInWei,
        })
      )
        .to.emit(Token, "MintToken")
        .withArgs(buyer1.address, 1, `${baseURI}1`);

      expect(await Token.totalSupply()).to.equal(1);

      await expect(
        Token.connect(buyer1).purchaseToken({
          value: tokenPriceInWei,
        })
      )
        .to.emit(Token, "MintToken")
        .withArgs(buyer1.address, 2, `${baseURI}2`);

      expect(await Token.totalSupply()).to.equal(2);

      await expect(
        Token.connect(buyer1).purchaseToken({
          value: tokenPriceInWei,
        })
      ).to.be.revertedWith("Exceeds max tokens per wallet");

      expect(await Token.totalSupply()).to.equal(2);
    });

    it("Should revert buy token when user send wrong ETH value", async () => {
      expect(await Token.totalSupply()).to.equal(0);

      await expect(
        Token.connect(buyer1).purchaseToken({
          value: parseEther(0.01),
        })
      ).to.be.revertedWith("Wrong transaction value");

      expect(await Token.totalSupply()).to.equal(0);
    });

    it("Should revert buy token when tokens sold out", async () => {
      expect(await Token.totalSupply()).to.equal(0);
      await expect(
        Token.connect(buyer1).purchaseToken({
          value: tokenPriceInWei,
        })
      )
        .to.emit(Token, "MintToken")
        .withArgs(buyer1.address, 1, `${baseURI}1`);

      expect(await Token.totalSupply()).to.equal(1);
      await expect(
        Token.connect(buyer2).purchaseToken({
          value: tokenPriceInWei,
        })
      )
        .to.emit(Token, "MintToken")
        .withArgs(buyer2.address, 2, `${baseURI}2`);

      expect(await Token.totalSupply()).to.equal(2);

      await expect(
        Token.connect(buyer2).purchaseToken({
          value: tokenPriceInWei,
        })
      )
        .to.emit(Token, "MintToken")
        .withArgs(buyer2.address, 3, `${baseURI}3`);

      expect(await Token.totalSupply()).to.equal(3);

      await expect(
        Token.connect(buyer3).purchaseToken({
          value: tokenPriceInWei,
        })
      ).to.be.revertedWith("Tokens sold out");

      expect(await Token.totalSupply()).to.equal(3);
    });

    it("Should revert buy token when sale is not open", async () => {
      expect(await Token.isMintEnabled()).to.be.true;
      await Token.connect(deployer).toggleIsSaleEnabled(false);
      expect(await Token.isMintEnabled()).to.be.false;
      expect(await Token.totalSupply()).to.equal(0);

      await expect(
        Token.connect(buyer1).purchaseToken({
          value: tokenPriceInWei,
        })
      ).to.be.revertedWith("Sales not open");

      expect(await Token.totalSupply()).to.equal(0);
    });
  });

  describe("Burn Tokens Tests", () => {
    beforeEach(async () => {
      await Token.connect(deployer).toggleIsSaleEnabled(true);
      expect(await Token.totalSupply()).to.equal(0);

      await expect(
        Token.connect(buyer1).purchaseToken({
          value: tokenPriceInWei,
        })
      )
        .to.emit(Token, "MintToken")
        .withArgs(buyer1.address, 1, `${baseURI}1`);

      expect(await Token.totalSupply()).to.equal(1);
      expect(await Token.balanceOf(buyer1.address)).to.equal(1);
      expect(await Token.ownerOf(1)).to.equal(buyer1.address);
    });

    it("Should burn token by NFT token owner", async () => {
      await Token.connect(buyer1).burn(1);

      expect(await Token.balanceOf(buyer1.address)).to.equal(0);

      await expect(Token.ownerOf(1)).to.be.revertedWith(
        "ERC721: invalid token ID"
      );
    });

    it("Should revert burn token by non-owner", async () => {
      await expect(Token.connect(buyer2).burn(1)).to.be.revertedWith(
        "ERC721: caller is not token owner nor approved"
      );

      expect(await Token.totalSupply()).to.equal(1);
      expect(await Token.balanceOf(buyer1.address)).to.equal(1);
      expect(await Token.ownerOf(1)).to.equal(buyer1.address);
    });
  });

  describe("Enumerable Tests", () => {
    beforeEach(async () => {
      await Token.connect(deployer).toggleIsSaleEnabled(true);
      expect(await Token.totalSupply()).to.equal(0);

      await expect(
        Token.connect(buyer1).purchaseToken({
          value: tokenPriceInWei,
        })
      )
        .to.emit(Token, "MintToken")
        .withArgs(buyer1.address, 1, `${baseURI}1`);

      await expect(
        Token.connect(buyer2).purchaseToken({
          value: tokenPriceInWei,
        })
      )
        .to.emit(Token, "MintToken")
        .withArgs(buyer2.address, 2, `${baseURI}2`);

      await expect(
        Token.connect(buyer2).purchaseToken({
          value: tokenPriceInWei,
        })
      )
        .to.emit(Token, "MintToken")
        .withArgs(buyer2.address, 3, `${baseURI}3`);

      expect(await Token.totalSupply()).to.equal(3);
    });

    it("Should get total tokens owned by user and check ownership", async () => {
      const buyer1BalanceOf = await Token.balanceOf(buyer1.address);
      const buyer2BalanceOf = await Token.balanceOf(buyer2.address);

      const buyer1TotalTokensIds = [];
      const buyer2TotalTokensIds = [];

      for (let i = 0; i < Number(buyer1BalanceOf); i++) {
        buyer1TotalTokensIds.push(
          Number(await Token.tokenOfOwnerByIndex(buyer1.address, i))
        );
      }

      for (let i = 0; i < Number(buyer2BalanceOf); i++) {
        buyer2TotalTokensIds.push(
          Number(await Token.tokenOfOwnerByIndex(buyer2.address, i))
        );
      }
      expect(buyer1TotalTokensIds.length).to.equal(Number(buyer1BalanceOf));
      expect(buyer2TotalTokensIds.length).to.equal(Number(buyer2BalanceOf));

      buyer1TotalTokensIds.forEach(async (tokenId) => {
        expect(await Token.ownerOf(tokenId)).to.equal(buyer1.address);
      });

      buyer2TotalTokensIds.forEach(async (tokenId) => {
        expect(await Token.ownerOf(tokenId)).to.equal(buyer2.address);
      });

      await expect(
        Token.tokenOfOwnerByIndex(
          buyer2.address,
          buyer2TotalTokensIds.length + 1
        )
      ).to.be.revertedWith("ERC721Enumerable: owner index out of bounds");
    });
  });

  describe("Admin Tests", () => {
    it("Should set new URI by the owner", async () => {
      const newURI = "https://new.uri";
      expect(await Token.baseURI()).to.equal(baseURI);

      await expect(Token.connect(deployer).setBaseURI(newURI)).not.to.be
        .reverted;

      expect(await Token.baseURI()).to.equal(newURI);

      await Token.connect(deployer).toggleIsSaleEnabled(true);
      await expect(
        Token.connect(buyer1).purchaseToken({
          value: tokenPriceInWei,
        })
      )
        .to.emit(Token, "MintToken")
        .withArgs(buyer1.address, 1, `${newURI}1`);
    });

    it("Should revert set new URI by non-owner", async () => {
      const newURI = "https://new.uri";
      expect(await Token.baseURI()).to.equal(baseURI);

      await expect(Token.connect(buyer1).setBaseURI(newURI)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );

      expect(await Token.baseURI()).to.equal(baseURI);
    });

    it("Should toggle mint enabled by owner", async () => {
      expect(await Token.isMintEnabled()).to.be.false;

      await expect(Token.connect(deployer).toggleIsSaleEnabled(true))
        .to.emit(Token, "ToggleIsSaleEnabled")
        .withArgs(deployer.address, true);

      expect(await Token.isMintEnabled()).to.be.true;

      await expect(Token.connect(deployer).toggleIsSaleEnabled(false))
        .to.emit(Token, "ToggleIsSaleEnabled")
        .withArgs(deployer.address, false);

      expect(await Token.isMintEnabled()).to.be.false;
    });

    it("Should revert toggle mint enabled by non-owner", async () => {
      expect(await Token.isMintEnabled()).to.be.false;
      await expect(
        Token.connect(buyer1).toggleIsSaleEnabled(true)
      ).to.be.revertedWith("Ownable: caller is not the owner");
      expect(await Token.isMintEnabled()).to.be.false;
    });

    it("Should set max sale supply", async () => {
      expect(await Token.maxSupply()).to.equal(maxSupply);

      await expect(Token.connect(deployer).setMaxSupply(100))
        .to.emit(Token, "ChangeMaxSupply")
        .withArgs(deployer.address, 100);

      expect(await Token.maxSupply()).to.equal(100);
    });

    it("Should revert set max sale supply by non-owner", async () => {
      expect(await Token.maxSupply()).to.equal(maxSupply);
      await expect(Token.connect(buyer1).setMaxSupply(100)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
      expect(await Token.maxSupply()).to.equal(maxSupply);
    });

    it("Should set limit per user", async () => {
      expect(await Token.limitPerUser()).to.equal(limitPerUser);

      await expect(Token.connect(deployer).setLimitPerUser(10))
        .to.emit(Token, "ChangeLimitPerUser")
        .withArgs(deployer.address, 10);

      expect(await Token.limitPerUser()).to.equal(10);
    });

    it("Should revert set limit per wallet by non-owner", async () => {
      expect(await Token.limitPerUser()).to.equal(limitPerUser);
      await expect(Token.connect(buyer1).setMaxSupply(100)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
      expect(await Token.limitPerUser()).to.equal(limitPerUser);
    });

    describe("Withdraw Tests", () => {
      beforeEach(async () => {
        expect(await getEthBalanceHelper(Token.address)).to.equal(0);
        expect(await Token.isMintEnabled()).to.be.false;
        await Token.connect(deployer).toggleIsSaleEnabled(true);
        expect(await Token.isMintEnabled()).to.be.true;
        expect(await Token.totalSupply()).to.equal(0);

        await expect(
          Token.connect(deployer).withdrawFunds()
        ).to.be.revertedWith("There are no funds to be withdraw");

        await expect(
          Token.connect(buyer1).purchaseToken({
            value: tokenPriceInWei,
          })
        )
          .to.emit(Token, "MintToken")
          .withArgs(buyer1.address, 1, `${baseURI}1`);
        expect(await Token.totalSupply()).to.equal(1);

        await expect(
          Token.connect(buyer2).purchaseToken({
            value: tokenPriceInWei,
          })
        )
          .to.emit(Token, "MintToken")
          .withArgs(buyer2.address, 2, `${baseURI}2`);

        expect(await Token.totalSupply()).to.equal(2);
      });

      it("Should withdraw ETH by owner", async () => {
        const tokenBalanceBefore = await getEthBalanceHelper(Token.address);
        const deployerBalanceBefore = await getEthBalanceHelper(
          deployer.address
        );
        expect(tokenBalanceBefore).to.equal(tokenPriceInWei.mul(2));

        const withdrawTx = await Token.connect(deployer).withdrawFunds();
        await expect(withdrawTx)
          .to.emit(Token, "WithdrawFunds")
          .withArgs(deployer.address, tokenPriceInWei.mul(2));

        const txGasCost = await calcGasCostHelper(withdrawTx);

        expect(await getEthBalanceHelper(Token.address)).to.equal(0);
        const deployerBalanceAfter = await getEthBalanceHelper(
          deployer.address
        );
        expect(deployerBalanceAfter).to.equal(
          deployerBalanceBefore.add(tokenPriceInWei.mul(2)).sub(txGasCost)
        );
      });

      it("Should revert withdraw ETH by non-owner", async () => {
        const tokenBalanceBefore = await getEthBalanceHelper(Token.address);
        await expect(Token.connect(buyer1).withdrawFunds()).to.be.revertedWith(
          "Ownable: caller is not the owner"
        );
        const tokenBalanceAfter = await getEthBalanceHelper(Token.address);
        expect(tokenBalanceAfter).to.equal(tokenBalanceBefore);
      });
    });
  });
});
