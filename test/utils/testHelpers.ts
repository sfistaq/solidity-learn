import { ethers } from "hardhat";
import { BigNumber, ContractTransaction } from "ethers";

export const parseEther = (value: number): BigNumber =>
  ethers.utils.parseEther(value.toString());

export const fromEther = (value: BigNumber): number =>
  Number(ethers.utils.formatEther(value));

//function to calculate amount of purchased tokens according to paid ETH amount
export const calcPurchasedTokens = (
  ethAmount: BigNumber,
  decimals: number,
  tokenPrice: BigNumber
): number => {
  const purchasedTokensAmount = ethAmount
    .mul(BigNumber.from("10").pow(decimals))
    .div(tokenPrice);

  return Number(ethers.utils.formatEther(purchasedTokensAmount));
};

//function to get address balance
export const getEthBalanceHelper = async (
  address: string
): Promise<BigNumber> => {
  return await ethers.provider.getBalance(address);
};

//function to get the transaction gas cost
export const calcGasCostHelper = async (
  transaction: ContractTransaction
): Promise<BigNumber> => {
  const receipt = await transaction.wait();
  return receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice);
};

//function to get fee amount of a transaction
export const calcFeeFromTransaction = (
  tokenPrice: BigNumber,
  purchasedTokensAmount: number,
  feePercentage: number
): BigNumber => {
  const totalPrice = tokenPrice.mul(purchasedTokensAmount);
  return totalPrice.mul(feePercentage).div(100);
};

// function to get timestamp in seconds
export const createTimestampInSeconds = (date: string) => {
  return Math.floor(new Date(date).getTime() / 1000);
};

//unction to add weeks to date
export const addWeeks = (weeks: number, date = new Date()) => {
  date.setDate(date.getDate() + weeks * 7);
  return date.toLocaleDateString().split(".").reverse().join("-");
};
