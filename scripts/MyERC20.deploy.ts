import { ethers } from "hardhat";
import { parseEther, deployContract } from "../test/utils";
import type { ERC20MockToken } from "../typechain";

const name = "MyERC20";
const symbol = "MRC";
const initMintAmount = 1000;
const initTokenPrice = parseEther(0.5);
const initERC20TokenPrice = parseEther(0.5);
let PaymentToken: ERC20MockToken;
const initBuyLimit = 10;
const iSWhitelisted = false;

const MyERC20Deploy = async () => {
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);

  const initialBalance = await deployer.getBalance();
  console.log(
    `Deployer balance: ${ethers.utils.formatEther(
      initialBalance.toString()
    )} ETH`
  );
  console.log(`Starting deploy MyERC20, please wait...`);

  PaymentToken = (await deployContract(
    "ERC20MockToken",
    [],
    deployer
  )) as ERC20MockToken;

  const Contract = await ethers.getContractFactory("MyERC20");
  const contract = await Contract.deploy(
    name,
    symbol,
    initMintAmount,
    initTokenPrice,
    initERC20TokenPrice,
    PaymentToken.address,
    initBuyLimit,
    iSWhitelisted
  );

  await contract.deployed();

  const afterDeployBalance = await deployer.getBalance();

  console.log(
    `Deploy contract cost: ${ethers.utils.formatEther(
      initialBalance.sub(afterDeployBalance).toString()
    )} ETH`
  );

  console.log("MyERC20 deployed to:", contract.address);
};

(async () => {
  try {
    await MyERC20Deploy();
    process.exit(0);
  } catch (error) {
    console.error(error as Error);
    process.exitCode = 1;
  }
})();
