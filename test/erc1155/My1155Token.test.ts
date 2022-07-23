import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import type { My1155Token } from "../../typechain-types/contracts/erc1155";
import {
  deployContract,
  parseEther,
  fromEther,
  getEthBalanceHelper,
} from "../utils";
import { ethers } from "hardhat";
import { expect } from "chai";

let deployer: SignerWithAddress;
let buyer1: SignerWithAddress;
let Token: My1155Token;

const baseURI = "https://token-cdn-domain/";
const tokenPriceInWei = parseEther(0.1);

// for minting
const tokenData = "0x00";

// for batch minting
const tokensData = [
  {
    id: 1,
    amount: 100,
    price: parseEther(0.1),
  },
  {
    id: 2,
    amount: 150,
    price: parseEther(0.2),
  },
  {
    id: 3,
    amount: 50,
    price: parseEther(0.5),
  },
];

const tokenIds = tokensData.map((token) => token.id);
const tokenAmounts = tokensData.map((token) => token.amount);
const tokenPrices = tokensData.map((token) => token.price);

describe("My1155Token Tests", () => {
  beforeEach(async () => {
    [deployer, buyer1] = await ethers.getSigners();

    const params = [baseURI];

    Token = (await deployContract(
      "My1155Token",
      params,
      deployer
    )) as My1155Token;
  });

  describe("Deploy Tests", () => {
    it("Should Token is deploy and get correct address", async () => {
      expect(ethers.utils.isAddress(Token.address)).to.equal(true);
    });

    it("Should get correct params", async () => {
      expect(await Token.owner()).to.equal(deployer.address);
      expect(await Token.baseURI()).to.equal(baseURI);
    });
  });

  describe("Create Tokens Tests", () => {
    const tokenID = 1;
    const mintAmount = 100;

    it("Should create tokens by owner", async () => {
      expect(await Token.exists(tokenID)).to.equal(false);
      expect(await Token.totalSupply(tokenID)).to.equal(0);

      await expect(
        Token.connect(deployer).mint(
          tokenID,
          mintAmount,
          tokenPriceInWei,
          tokenData
        )
      )
        .to.emit(Token, "MintToken")
        .withArgs(
          deployer.address,
          tokenID,
          mintAmount,
          tokenPriceInWei,
          `${baseURI}${tokenID}.json`,
          tokenData
        );

      expect(await Token.exists(tokenID)).to.equal(true);
      expect(await Token.totalSupply(tokenID)).to.equal(mintAmount);
      expect(await Token.balanceOf(deployer.address, tokenID)).to.equal(
        mintAmount
      );
      expect(await Token.tokenPrice(tokenID)).to.equal(tokenPriceInWei);
      expect(await Token.uri(tokenID)).to.equal(`${baseURI}${tokenID}.json`);

      await expect(Token.uri(3)).to.be.revertedWith("Token does not exist");
    });

    it("Should revert create tokens when caller is not owner", async () => {
      expect(await Token.exists(tokenID)).to.equal(false);
      expect(await Token.totalSupply(tokenID)).to.equal(0);

      await expect(
        Token.connect(buyer1).mint(
          tokenID,
          mintAmount,
          tokenPriceInWei,
          tokenData
        )
      ).to.be.revertedWith("Ownable: caller is not the owner");

      expect(await Token.exists(tokenID)).to.equal(false);
      expect(await Token.totalSupply(tokenID)).to.equal(0);
    });

    it("Should batch create tokens by owner", async () => {
      tokenIds.forEach(async (id) => {
        expect(await Token.exists(id)).to.equal(false);
        expect(await Token.totalSupply(id)).to.equal(0);
      });

      await expect(
        Token.connect(deployer).mintBatch(
          tokenIds,
          tokenAmounts,
          tokenPrices,
          tokenData
        )
      )
        .to.emit(Token, "BatchMintToken")
        .withArgs(
          deployer.address,
          tokenIds,
          tokenAmounts,
          tokenPrices,
          tokenIds.map((id) => `${baseURI}${id}.json`),
          tokenData
        );

      tokenIds.forEach(async (id, i) => {
        expect(await Token.exists(id)).to.equal(true);
        expect(await Token.totalSupply(id)).to.equal(tokenAmounts[i]);
        expect(await Token.balanceOf(deployer.address, id)).to.equal(
          tokenAmounts[i]
        );
        expect(await Token.tokenPrice(id)).to.equal(tokenPrices[i]);
        expect(await Token.uri(tokenIds[i])).to.equal(
          `${baseURI}${tokenIds[i]}.json`
        );
      });
    });

    it("Should revert batch create tokens when caller is not owner", async () => {
      const tokensIds = [1, 2];
      const tokensAmounts = [100, 200];
      const tokensPrices = [parseEther(0.1), parseEther(0.2)];

      tokensIds.forEach(async (id) => {
        expect(await Token.exists(id)).to.equal(false);
        expect(await Token.totalSupply(id)).to.equal(0);
      });

      await expect(
        Token.connect(buyer1).mintBatch(
          tokensIds,
          tokensAmounts,
          tokensPrices,
          tokenData
        )
      ).to.be.revertedWith("Ownable: caller is not the owner");

      tokensIds.forEach(async (id) => {
        expect(await Token.exists(id)).to.equal(false);
        expect(await Token.totalSupply(id)).to.equal(0);
        expect(await Token.balanceOf(deployer.address, id)).to.equal(0);
      });
    });
  });

  it("Should revert batch create tokens ids and amounts not match", async () => {
    const tokensIds = [1, 2];
    const tokensAmounts = [100];
    const tokensPrices = [parseEther(0.1), parseEther(0.2)];

    tokensIds.forEach(async (id) => {
      expect(await Token.exists(id)).to.equal(false);
      expect(await Token.totalSupply(id)).to.equal(0);
    });

    await expect(
      Token.mintBatch(tokensIds, tokensAmounts, tokensPrices, tokenData)
    ).to.be.revertedWith("ERC1155: ids and amounts length mismatch");

    tokensIds.forEach(async (id) => {
      expect(await Token.exists(id)).to.equal(false);
      expect(await Token.totalSupply(id)).to.equal(0);
      expect(await Token.balanceOf(deployer.address, id)).to.equal(0);
    });
  });

  describe("Buy Tokens Tests", () => {
    beforeEach(async () => {
      tokenIds.forEach(async (id) => {
        expect(await Token.exists(id)).to.equal(false);
      });

      await Token.connect(deployer).mintBatch(
        tokenIds,
        tokenAmounts,
        tokenPrices,
        tokenData
      );

      tokenIds.forEach(async (id) => {
        expect(await Token.exists(id)).to.equal(true);
      });
      expect(
        await Token.isApprovedForAll(deployer.address, buyer1.address)
      ).to.equal(false);
      await Token.setApprovalForAll(buyer1.address, true);

      expect(
        await Token.isApprovedForAll(deployer.address, buyer1.address)
      ).to.equal(true);
    });

    it("Should be able to buy tokens and update balances", async () => {
      const buyAmount = 5;
      const payValue = fromEther(tokenPrices[0].mul(buyAmount));

      const ownerBalanceBefore = await Token.balanceOf(
        deployer.address,
        tokenIds[0]
      );
      const buyerBalanceBefore = await Token.balanceOf(
        buyer1.address,
        tokenIds[0]
      );

      const tokenBalanceBefore = await getEthBalanceHelper(Token.address);
      expect(ownerBalanceBefore).to.equal(tokenAmounts[0]);
      expect(buyerBalanceBefore).to.equal(0);
      expect(tokenBalanceBefore).to.equal(0);

      await expect(
        Token.connect(buyer1).buyToken(tokenIds[0], buyAmount, {
          value: parseEther(payValue),
        })
      )
        .to.emit(Token, "BuyTokens")
        .withArgs(
          buyer1.address,
          tokenIds[0],
          buyAmount,
          parseEther(payValue),
          `${baseURI}${tokenIds[0]}.json`
        );

      const ownerBalanceAfter = await Token.balanceOf(
        deployer.address,
        tokenIds[0]
      );
      const buyerBalanceAfter = await Token.balanceOf(
        buyer1.address,
        tokenIds[0]
      );
      const tokenBalanceAfter = await getEthBalanceHelper(Token.address);

      expect(ownerBalanceAfter).to.equal(tokenAmounts[0] - buyAmount);
      expect(buyerBalanceAfter).to.equal(buyAmount);
      expect(tokenBalanceAfter).to.equal(parseEther(payValue));
    });

    it("Should revert buy token when values is invalid", async () => {
      const buyAmount = 5;
      const payValue = fromEther(tokenPrices[0].mul(buyAmount));

      await expect(
        Token.connect(buyer1).buyToken(5, buyAmount, {
          value: parseEther(payValue),
        })
      ).to.be.revertedWith("Token does not exist");

      await expect(
        Token.connect(buyer1).buyToken(tokenIds[0], tokenAmounts[0] + 1, {
          value: parseEther(payValue),
        })
      ).to.be.revertedWith("Not enough tokens");

      await expect(
        Token.connect(buyer1).buyToken(tokenIds[0], tokenAmounts[0], {
          value: parseEther(0.001),
        })
      ).to.be.revertedWith("Wrong transaction value");
    });
  });

  describe("Admin Tests", () => {
    const newURI = "https://new.uri/";

    it("Should set new URI by the owner", async () => {
      const tokenID = 1;
      const mintAmount = 100;
      const tokenData = "0x00";

      await Token.connect(deployer).mint(
        tokenID,
        mintAmount,
        tokenPriceInWei,
        tokenData
      );

      expect(await Token.uri(tokenID)).to.equal(`${baseURI}${tokenID}.json`);

      await expect(Token.setURI(newURI))
        .to.emit(Token, "SetNewUri")
        .withArgs(deployer.address, newURI);

      expect(await Token.uri(tokenID)).to.equal(`${newURI}${tokenID}.json`);
    });

    it("Should revert set new URI when caller is not owner", async () => {
      expect(await Token.baseURI()).to.equal(baseURI);
      await expect(Token.connect(buyer1).setURI(newURI)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
      expect(await Token.baseURI()).to.equal(baseURI);
    });

    it("Should withdraw funds by owner", async () => {
      expect(
        fromEther(await ethers.provider.getBalance(Token.address))
      ).to.equal(0);

      await Token.connect(deployer).mintBatch(
        tokenIds,
        tokenAmounts,
        tokenPrices,
        tokenData
      );

      await Token.setApprovalForAll(buyer1.address, true);

      const buyAmount = 5;
      const payValue = fromEther(tokenPrices[0].mul(buyAmount));

      await Token.connect(buyer1).buyToken(tokenIds[0], buyAmount, {
        value: parseEther(payValue),
      });

      expect(
        fromEther(await ethers.provider.getBalance(Token.address))
      ).to.equal(payValue);

      await expect(Token.connect(deployer).withdrawFunds())
        .to.emit(Token, "WithdrawFunds")
        .withArgs(deployer.address, parseEther(payValue));

      expect(
        fromEther(await ethers.provider.getBalance(Token.address))
      ).to.equal(0);

      await expect(Token.connect(deployer).withdrawFunds()).to.be.revertedWith(
        "There are no funds to be withdraw"
      );

      await expect(Token.connect(buyer1).withdrawFunds()).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });
  });
});
