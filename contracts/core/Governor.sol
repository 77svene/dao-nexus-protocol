// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./Timelock.sol";
import "./TreasuryRegistry.sol";

contract Governor is AccessControl, ReentrancyGuard {
    bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");
    bytes32 public constant VOTER_ROLE = keccak256("VOTER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    struct Proposal {
        uint256 id;
        IERC20 token;
        uint256 votesRequired;
        uint256 startBlock;
        uint256 endBlock;
        uint256 forVotes;
        uint256 againstVotes;
        bool executed;
        bytes[] targets;
        uint256[] values;
        string[] signatures;
        bytes[] calldatas;
        uint256 eta;
    }

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    uint256 public proposalCounter;
    uint256 public votingPeriod;
    uint256 public quorum;
    Timelock public timelock;
    TreasuryRegistry public treasuryRegistry;
    IERC20 public votingToken;

    event ProposalCreated(uint256 indexed proposalId, address indexed proposer, uint256 startBlock, uint256 endBlock);
    event VoteCast(uint256 indexed proposalId, address indexed voter, bool support);
    event ProposalExecuted(uint256 indexed proposalId, address indexed executor);

    constructor(
        address _timelock,
        address _treasuryRegistry,
        address _votingToken
    ) {
        _setupRole(ADMIN_ROLE, msg.sender);
        _setupRole(PROPOSER_ROLE, msg.sender);
        _setupRole(VOTER_ROLE, msg.sender);
        timelock = Timelock(_timelock);
        treasuryRegistry = TreasuryRegistry(_treasuryRegistry);
        votingToken = IERC20(_votingToken);
        votingPeriod = 10; // 10 blocks for testing; adjust in production
        quorum = 10; // 10% quorum placeholder
    }

    function propose(
        address[] memory targets,
        uint256[] memory values,
        string[] memory signatures,
        bytes[] memory calldatas,
        uint256 _votesRequired,
        IERC20 _token
    ) public onlyRole(PROPOSER_ROLE) notReentrant returns (uint256) {
        require(targets.length == values.length, "Length mismatch");
        require(targets.length == signatures.length, "Length mismatch");
        require(targets.length == calldatas.length, "Length mismatch");

        uint256 id = proposalCounter++;
        Proposal storage p = proposals[id];
        p.id = id;
        p.token = _token;
        p.votesRequired = _votesRequired;
        p.startBlock = block.number;
        p.endBlock = block.number + votingPeriod;
        p.forVotes = 0;
        p.againstVotes = 0;
        p.executed = false;
        p.targets = targets;
        p.values = values;
        p.signatures = signatures;
        p.calldatas = calldatas;
        p.eta = 0; // To be set during execution via timelock

        emit ProposalCreated(id, msg.sender, p.startBlock, p.endBlock);
        return id;
    }

    function vote(uint256 proposalId, bool support) public role(VOTER_ROLE) {
        Proposal storage p = proposals[proposalId];
        require(block.number >= p.startBlock && block.number <= p.endBlock, "Voting period not active");
        require(!hasVoted[proposalId][msg.sender], "Already voted");
        hasVoted[proposalId][msg.sender] = true;

        uint256 voteWeight = votingToken.balanceOf(msg.sender);
        if (support) {
            p.forVotes += voteWeight;
        } else {
            p.againstVotes += voteWeight;
        }

        emit VoteCast(proposalId, msg.sender, support);
    }

    function execute(uint256 proposalId) public {
        Proposal storage p = proposals[proposalId];
        require(block.number > p.endBlock, "Voting period not over");
        require(!p.executed, "Already executed");
        require(p.forVotes >= p.votesRequired, "Not enough votes");
        require(p.againstVotes < p.forVotes, "Against votes exceed for votes");

        // Interaction with timelock: schedule execution after delay
        uint256 delay = timelock.getMinDelay();
        uint256 eta = block.timestamp + delay;
        bytes32 scheduleId = timelock.schedule(p.targets, p.values, p.signatures, p.calldatas, eta);

        p.eta = eta;
        p.executed = true;

        emit ProposalExecuted(proposalId, msg.sender);
    }

    // Treasury interaction example: fetch vault address for a given chainId
    function getVaultAddress(uint256 chainId) public view returns (address) {
        return treasuryRegistry.getVault(chainId);
    }
}