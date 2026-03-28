const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Governor", function () {
  let votingToken, timelock, treasuryRegistry, governor;
  let usdc; // mock USDC for treasury
  let proposer, voter, admin, recipient;
  let votingPeriod, quorum;

  beforeEach(async function () {
    [proposer, voter, admin, recipient] = await ethers.getSigners();

    // Deploy mock USDC (ERC20 with 6 decimals)
    const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
    usdc = await ERC20Mock.deploy("USD Coin", "USDC", 6);
    await usdc.deployed();

    // Deploy voting token (DAOtoken) - ERC20 with votes
    const DAOtoken = await ethers.getContractFactory("DAOtoken");
    votingToken = await DAOtoken.deploy();
    await votingToken.deployed();

    // Deploy Timelock (1 second delay for testing)
    const Timelock = await ethers.getContractFactory("Timelock");
    timelock = await Timelock.deploy(proposer.address, 1);
    await timelock.deployed();

    // Deploy TreasuryRegistry
    const TreasuryRegistry = await ethers.getContractFactory("TreasuryRegistry");
    treasuryRegistry = await TreasuryRegistry.deploy();
    await treasuryRegistry.deployed();

    // Fund treasuryRegistry with USDC
    await usdc.mint(treasuryRegistry.address, ethers.utils.parseUnits("100000", 6)); // 100,000 USDC

    // Deploy Governor    const Governor = await ethers.getContractFactory("Governor");
    governor = await Governor.deploy(
      votingToken.address,
      timelock.address,
      treasuryRegistry.address
    );
    await governor.deployed();

    // Set up roles in Governor
    await governor.grantRole(await governor.PROPOSER_ROLE(), proposer.address);
    await governor.grantRole(await governor.VOTER_ROLE(), voter.address);
    await governor.grantRole(await governor.ADMIN_ROLE(), admin.address);

    // Mint voting tokens to proposer and voter
    await votingToken.mint(proposer.address, ethers.utils.parseUnits("1000", 18));
    await votingToken.mint(voter.address, ethers.utils.parseUnits("1000", 18));
    // Delegate voting power (required for ERC20Votes)
    await votingToken.connect(proposer).delegate(proposer.address);
    await votingToken.connect(voter).delegate(voter.address);

    // Get voting period and quorum from governor
    votingPeriod = await governor.votingPeriod();
    quorum = await governor.quorum();
  });

  it("should allow proposer to create a treasury transfer proposal", async function () {
    // Propose to transfer 100 USDC from treasuryRegistry to recipient
    const targets = [treasuryRegistry.address];
    const values = [0];
    const signatures = ["transferOut(address,address,uint256)"];
    // Assuming treasuryRegistry.transferOut(address token, address to, uint256 amount)
    const calldatas = [
      ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "uint256"],
        [usdc.address, recipient.address, ethers.utils.parseUnits("100", 6)]
      )
    ];
    const description = "Transfer 100 USDC to recipient";

    await expect(
      governor.connect(proposer).propose(targets, values, signatures, calldatas, description)
    )
      .to.emit(governor, "ProposalCreated")
      .withArgs(
        1,
        proposer.address,
        await ethers.provider.getBlockNumber(),
        await ethers.provider.getBlockNumber() + votingPeriod
      );

    // Check proposal state
    const proposal = await governor.proposals(1);
    expect(proposal.id).to.equal(1);
    expect(proposal.token).to.equal(usdc.address);
    expect(proposal.votesRequired).to.equal(quorum);
    expect(proposal.forVotes).to.equal(0);
    expect(proposal.againstVotes).to.equal(0);
    expect(proposal.executed).to.be.false;
  });

  it("should allow voter to vote on proposal", async function () {
    // First, create a proposal
    const targets = [treasuryRegistry.address];
    const values = [0];
    const signatures = ["transferOut(address,address,uint256)"];
    const calldatas = [
      ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "uint256"],
        [usdc.address, recipient.address, ethers.utils.parseUnits("100", 6)]
      )
    ];
    const description = "Transfer 100 USDC to recipient";

    await governor.connect(proposer).propose(targets, values, signatures, calldatas, description);

    // Vote for the proposal
    await expect(governor.connect(voter).castVote(1, true)) // true = support
      .to.emit(governor, "VoteCast")
      .withArgs(1, voter.address, 1, ethers.utils.parseUnits("1000", 18)); // voter has 1000 tokens delegated

    // Check vote was recorded
    const hasVoted = await governor.hasVoted(1, voter.address);
    expect(hasVoted).to.be.true;

    // Check proposal vote count
    const proposal = await governor.proposals(1);
    expect(proposal.forVotes).to.equal(ethers.utils.parseUnits("1000", 18));
    expect(proposal.againstVotes).to.equal(0);
  });

  it("should execute proposal after voting period if successful", async function () {
    // Create a proposal
    const targets = [treasuryRegistry.address];
    const values = [0];
    const signatures = ["transferOut(address,address,uint256)"];
    const calldatas = [
      ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "uint256"],
        [usdc.address, recipient.address, ethers.utils.parseUnits("100", 6)]
      )
    ];
    const description = "Transfer 100 USDC to recipient";

    await governor.connect(proposer).propose(targets, values, signatures, calldatas, description);

    // Vote for the proposal
    await governor.connect(voter).castVote(1, true);

    // Increase time to pass voting period
    await ethers.provider.send("evm_increaseTime", [votingPeriod + 1]);
    // Mine enough blocks to pass voting period (in blocks)
    const currentBlock = await ethers.provider.getBlockNumber();
    for (let i = 0; i < votingPeriod; i++) {
      await ethers.provider.send("evm_mine", []);
    }

    // Execute the proposal
    const tx = await governor.execute(1);
    const receipt = await tx.wait();

    // Check that the proposal was executed
    const proposal = await governor.proposals(1);
    expect(proposal.executed).to.be.true;

    // Check that USDC was transferred from treasuryRegistry to recipient
    const treasuryUsdcBalance = await usdc.balanceOf(treasuryRegistry.address);
    const recipientUsdcBalance = await usdc.balanceOf(recipient.address);
    expect(recipientUsdcBalance).to.equal(ethers.utils.parseUnits("100", 6));
    expect(treasuryUsdcBalance).to.equal(ethers.utils.parseUnits("99900", 6)); // 100,000 - 100
  });

  it("should revert if non-proposer tries to propose", async function () {
    const targets = [treasuryRegistry.address];
    const values = [0];
    const signatures = ["transferOut(address,address,uint256)"];
    const calldatas = [
      ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "uint256"],
        [usdc.address, recipient.address, ethers.utils.parseUnits("100", 6)]
      )
    ];
    const description = "Transfer 100 USDC to recipient";

    await expect(
      governor.connect(voter).propose(targets, values, signatures, calldatas, description)
    ).to.be.revertedWith("AccessControl: account " + voter.address.toLowerCase() + " is missing role " + await governor.PROPOSER_ROLE());
  });

  it("should revert if non-voter tries to vote",