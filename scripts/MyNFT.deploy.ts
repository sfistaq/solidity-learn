import { ethers } from "hardhat";
import { parseEther } from "../test/utils";

const name = "MyNFT";
const symbol = "MNFT";
const tokenPriceInWei = parseEther(0.1);
const maxSupply = 3;
const limitPerUser = 2;
const isInitEnabled = false;
const baseURI = "https://s3.test.com/snft-test/";

const MyNFTDeploy = async () => {
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);

  const initialBalance = await deployer.getBalance();
  console.log(
    `Deployer balance: ${ethers.utils.formatEther(
      initialBalance.toString()
    )} ETH`
  );

  console.log(`Starting deploy MyNFT, please wait...`);

  const Contract = await ethers.getContractFactory("MyNFT");
  const contract = await Contract.deploy(
    name,
    symbol,
    tokenPriceInWei,
    maxSupply,
    limitPerUser,
    isInitEnabled,
    baseURI
  );

  await contract.deployed();

  const afterDeployBalance = await deployer.getBalance();

  console.log(
    `Deploy contract cost: ${ethers.utils.formatEther(
      initialBalance.sub(afterDeployBalance).toString()
    )} ETH`
  );

  console.log("MyNFT deployed to:", contract.address);
};

(async () => {
  try {
    await MyNFTDeploy();
    process.exit(0);
  } catch (error) {
    console.error(error as Error);
    process.exitCode = 1;
  }
})();
