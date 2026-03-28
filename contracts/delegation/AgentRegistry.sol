// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title AgentRegistry
 * @notice Registry for tracking ERC-8004 autonomous agents, their strategy hashes, and bonded amounts.
 */
contract AgentRegistry is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    struct AgentInfo {
        bytes32 strategyHash;
        uint256 bonding;
    }

    mapping(address => AgentInfo) public agents;

    event AgentRegistered(address indexed agent, bytes32 strategyHash, uint256 bonding);
    event StrategyUpdated(address indexed agent, bytes32 newStrategyHash);
    event BondingUpdated(address indexed agent, uint256 newBonding);
    event BondingSlashed(address indexed agent, uint256 amount);

    /**
     * @dev Constructor sets the deployer as an admin.
     */
    constructor() {
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    /**
     * @dev Registers a new agent with initial strategy hash and bonding.
     * @param agent Address of the agent contract.
     * @param strategyHash Hash of the agent's strategy.
     * @param bonding Initial bonding amount.
     */
    function registerAgent(address agent, bytes32 strategyHash, uint256 bonding) external onlyRole(ADMIN_ROLE) {
        require(agent != address(0), "AgentRegistry: agent cannot be zero");
        require(agents[agent].bonding == 0, "AgentRegistry: agent already registered");
        require(agent.code.length > 0, "AgentRegistry: agent must be a contract");

        agents[agent] = AgentInfo(strategyHash, bonding);
        emit AgentRegistered(agent, strategyHash, bonding);
    }

    /**
     * @dev Updates the strategy hash for an existing agent.
     * @param agent Address of the agent.
     * @param newStrategyHash New strategy hash.
     */
    function updateStrategy(address agent, bytes32 newStrategyHash) external onlyRole(ADMIN_ROLE) {
        require(agents[agent].bonding > 0, "AgentRegistry: agent not registered");
        agents[agent].strategyHash = newStrategyHash;
        emit StrategyUpdated(agent, newStrategyHash);
    }

    /**
     * @dev Updates the bonding amount for an existing agent.
     * @param agent Address of the agent.
     * @param newBonding New bonding amount.
     */
    function updateBonding(address agent, uint256 newBonding) external onlyRole(ADMIN_ROLE) {
        require(agents[agent].bonding > 0, "AgentRegistry: agent not registered");
        agents[agent].bonding = newBonding;
        emit BondingUpdated(agent, newBonding);
    }

    /**
     * @dev Slashes a portion of the agent's bonding.
     * @param agent Address of the agent.
     * @param amount Amount of bonding to slash.
     */
    function slashBonding(address agent, uint256 amount) external onlyRole(ADMIN_ROLE) {
        require(agents[agent].bonding > 0, "AgentRegistry: agent not registered");
        require(amount <= agents[agent].bonding, "AgentRegistry: slash amount exceeds bonding");
        uint256 newBonding = agents[agent].bonding - amount;
        agents[agent].bonding = newBonding;
        emit BondingSlashed(agent, amount);
    }

    /**
     * @dev Returns true if the agent is registered and has non-zero bonding.
     * @param agent Address of the agent.
     * @return bool True if agent is active.
     */
    function isActiveAgent(address agent) public view returns (bool) {
        return agents[agent].bonding > 0;
    }
}