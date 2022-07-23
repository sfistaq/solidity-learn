import { ethers } from "hardhat";

const baseURI = "https://token-cdn-domain/";

const My1155TokenDeploy = async () => {
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);

  const initialBalance = await deployer.getBalance();
  console.log(
    `Deployer balance: ${ethers.utils.formatEther(
      initialBalance.toString()
    )} ETH`
  );

  console.log(`Starting deploy My1155Token
  , please wait...`);

  const Contract = await ethers.getContractFactory("My1155Token");
  const contract = await Contract.deploy(baseURI);

  await contract.deployed();

  const afterDeployBalance = await deployer.getBalance();

  console.log(
    `Deploy contract cost: ${ethers.utils.formatEther(
      initialBalance.sub(afterDeployBalance).toString()
    )} ETH`
  );

  console.log("My1155Token deployed to:", contract.address);
};

(async () => {
  try {
    await My1155TokenDeploy();
    process.exit(0);
  } catch (error) {
    console.error(error as Error);
    process.exitCode = 1;
  }
})();
