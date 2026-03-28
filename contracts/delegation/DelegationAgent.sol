// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @dev Interface for ERC-8004 Autonomous Agent Standard.
 */
interface IERC8004 {
    function execute(address target, uint256 value, bytes calldata) external payable returns (bool success, bytes memory returnData);
    function executeBatch(address[] calldata targets, uint256[] calldata values, bytes[] calldata calldatas) external payable returns (bool[] memory success, bytes[] memory returnData);
}

/**
 * @title DelegationAgent
 * @notice ERC-8004 compliant autonomous agent that can execute calls on behalf of a delegator.
 *         Ownership is restricted to the delegator who created the agent.
 */
contract DelegationAgent is IERC8004, ReentrancyGuard, Ownable {
    uint256 public constant MAX_BATCH_SIZE = 10;

    event Execute(address indexed target, uint256 value, bool success, bytes returnData);
    event ExecuteBatch(address[] targets, uint256[] values, bytes[] calldatas, bool[] success, bytes[] returnData);

    /**
     * @dev Constructor sets the deployer as the owner (delegator).
     */
    constructor() {
        // Owner is set by Ownable constructor to msg.sender (the delegator who deploys the agent)
    }

    /**
     * @dev Executes a single call on behalf of the delegator.
     * @param target Address of the contract to call.
     * @param value  Amount of ETH to send with the call.
     * @param callData Calldata for the call.
     * @return success Boolean indicating if the call succeeded.
     * @return returnData Data returned from the call.
     */
    function execute(address target, uint256 value, bytes calldata callData)
        external        payable
        override
        nonReentrant
        returns (bool success, bytes memory returnData)
    {
        require(target != address(0), "DelegationAgent: zero address target");
        (success, returnData) = target.call{value: value}(callData);
        emit Execute(target, value, success, returnData);
    }

    /**
     * @dev Executes a batch of calls on behalf of the delegator.
     * @param targets Array of target contracts to call.
     * @param values  Array of ETH values to send with each call.
     * @param calldatas Array of calldata for each call.
     * @return success Array of booleans indicating if each call succeeded.
     * @return returnData Array of data returned from each call.
     */
    function executeBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata calldatas
    )
        external
        payable
        override
        nonReentrant
        returns (bool[] memory success, bytes[] memory returnData)
    {
        require(targets.length == values.length, "DelegationAgent: array length mismatch");
        require(targets.length == calldatas.length, "DelegationAgent: array length mismatch");
        require(targets.length > 0, "DelegationAgent: empty batch");
        require(targets.length <= MAX_BATCH_SIZE, "DelegationAgent: batch too large");

        success = new bool[](targets.length);
        returnData = new bytes[](targets.length);

        for (uint256 i = 0; i < targets.length; i++) {
            require(targets[i] != address(0), "DelegationAgent: zero address target in batch");
            (success[i], returnData[i]) = targets[i].call{value: values[i]}(calldatas[i]);
        }

        emit ExecuteBatch(targets, values, calldatas, success, returnData);
    }

    /**
     * @dev Allows the owner to transfer ownership to a new delegator.
     * @param newOwner Address of the new delegator.
     */
    function transferOwnership(address newOwner) public override onlyOwner {
        require(newOwner != address(0), "DelegationAgent: zero address transfer");
        Ownable.transferOwnership(newOwner);
    }
}