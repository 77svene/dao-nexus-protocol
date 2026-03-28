const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BaseVault", function () {
  let vault, underlying, yieldDistributorMock;
  let owner, user1, user2;

  const erc20MockSource = `
    // SPDX-License-Identifier: MIT
    pragma solidity ^0.8.24;
    contract ERC20Mock {
      string public name;
      string public symbol;
      uint8 public decimals;
      mapping(address => uint256) public balanceOf;
      mapping(address => mapping(address => uint256)) public allowance;

      event Transfer(address indexed from, address indexed to, uint256 value);
      event Approval(address indexed owner, address indexed spender, uint256 value);

      constructor(string memory _name, string memory _symbol, uint8 _decimals) {
          name = _name;
          symbol = _symbol;
          decimals = _decimals;
      }

      function mint(address to, uint256 amount) public {
          balanceOf[to] += amount;
          emit Transfer(address(0), to, amount);
      }

      function transfer(address to, uint256 amount) public returns (bool) {
          if (balanceOf[msg.sender] < amount) return false;
          balanceOf[msg.sender] -= amount;
          balanceOf[to] += amount;
          emit Transfer(msg.sender, to, amount);
          return true;
      }

      function approve(address spender, uint256 amount) public returns (bool) {
          allowance[msg.sender][spender] = amount;
          emit Approval(msg.sender, spender, amount);
          return true;
      }

      function transferFrom(address from, address to, uint256 amount) public returns (bool) {
          if (balanceOf[from] < amount) return false;
          if (allowance[from][msg.sender] < amount) return false;
          balanceOf[from] -= amount;
          balanceOf[to] += amount;
          allowance[from][msg.sender] -= amount;
          emit Transfer(from, to, amount);
          return true;
      }
    }
  `;

  const yieldDistributorMockSource = `
    // SPDX-License-Identifier: MIT
    pragma solidity ^0.8.24;
    contract YieldDistributorMock {
      uint256 public lastDepositAmount;
      uint256 public lastWithdrawAmount;
      mapping(address => uint256) public deposits;

      event Deposited(address indexed user, uint256 amount);
      event Withdrawn(address indexed user, uint256 amount);

      function deposit(uint256 amount) external {
          lastDepositAmount = amount;
          deposits[msg.sender] += amount;
          emit Deposited(msg.sender, amount);
      }

      function withdraw(uint256 amount) external {
          require(deposits[msg.sender] >= amount, "Insufficient deposit");
          lastWithdrawAmount = amount;
          deposits[msg.sender] -= amount;
          emit Withdrawn(msg.sender, amount);
      }

      function getDeposit(address user) external view returns (uint256) {
          return deposits[user];
      }
    }
  `;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy underlying asset mock (ERC20)
    const MockERC20 = await ethers.getContractFactory(erc20MockSource);
    underlying = await MockERC20.deploy("Mock USDC", "mUSDC", 6);
    await underlying.deployed();

    // Deploy mock YieldDistributor
    const YieldDistributorMock = await ethers.getContractFactory(yieldDistributorMockSource);
    yieldDistributorMock = await YieldDistributorMock.deploy();
    await yieldDistributorMock.deployed();

    // Deploy BaseVault
    const BaseVault = await ethers.getContractFactory("contracts/v