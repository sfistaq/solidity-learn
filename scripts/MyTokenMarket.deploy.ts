import { ethers } from "hardhat";

const feePercentage = 10;

const MyTokenMarketDeploy = async () => {
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);

  const initialBalance = await deployer.getBalance();
  console.log(
    `Deployer balance: ${ethers.utils.formatEther(
      initialBalance.toString()
    )} ETH`
  );

  console.log(`Starting deploy MyTokenMarket, please wait...`);

  const Contract = await ethers.getContractFactory("MyTokenMarket");
  const contract = await Contract.deploy(feePercentage);

  await contract.deployed();

  const afterDeployBalance = await deployer.getBalance();

  console.log(
    `Deploy contract cost: ${ethers.utils.formatEther(
      initialBalance.sub(afterDeployBalance).toString()
    )} ETH`
  );

  console.log("MyTokenMarket deployed to:", contract.address);
};

(async () => {
  try {
    await MyTokenMarketDeploy();
    process.exit(0);
  } catch (error) {
    console.error(error as Error);
    process.exitCode = 1;
  }
})();
