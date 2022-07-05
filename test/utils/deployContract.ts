import type { Signer, Contract } from "ethers";
import { ethers } from "hardhat";

export const deployContract = async <T extends Contract>(
  contract: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: Array<any>,
  deployer: Signer
): Promise<T> => {
  const ContractFactory = await ethers.getContractFactory(contract, deployer);

  const Contract = (await ContractFactory.deploy(...params)) as unknown as T;

  await Contract.deployed();
  return Contract;
};
