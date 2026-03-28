// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title MerkleTree
 * @notice Merkle tree for storing leaf commitments with access control.
 *         Provides functions to add leaves (by authorized users), retrieve the root,
 *         and verify inclusion proofs.
 */
contract MerkleTree is AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    bytes32[] public leaves;
    bytes32 public root;

    event LeafSubmitted(bytes32 indexed leaf, bytes32 root);

    /**
     * @dev Constructor sets the deployer as admin and grants MINTER_ROLE.
     */
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
    }

    /**
     * @notice Submit a new leaf to the tree.
     * @param leaf The leaf hash to store.
     * @dev Only accounts with MINTER_ROLE can call this.
     * @revert If leaf is zero.
     */
    function submitLeaf(bytes32 leaf) external onlyRole(MINTER_ROLE) {
        require(leaf != 0x0, "Leaf cannot be zero");
        leaves.push(leaf);
        root = _computeRoot();
        emit LeafSubmitted(leaf, root);
    }

    /**
     * @notice Check that a leaf is part of the tree.
     * @param leaf The leaf to check.
     * @return true If the leaf exists in the leaves array.
     */
    function isIncluded(bytes32 leaf) external view returns (bool) {
        for (uint i = 0; i < leaves.length; i++) {
            if (leaves[i] == leaf) {
                return true;
            }
        }
        return false;
    }

    /**
     * @dev Compute the Merkle root from leaves array using standard pairwise hashing.
     * @return The Merkle root bytes32.
     */
    function _computeRoot() internal view returns (bytes32) {
        if (leaves.length == 0) {
            return 0x0;
        }
        bytes32[] memory currentLevel = new bytes32[](leaves.length);
        for (uint i = 0; i < leaves.length; i++) {
            currentLevel[i] = leaves[i];
        }
        while (currentLevel.length > 1) {
            // If odd number of elements, duplicate last one for even pairing
            if (currentLevel.length % 2 == 1) {
                currentLevel.push(currentLevel[currentLevel.length - 1]);
            }
            bytes32[] memory nextLevel = new bytes32[](currentLevel.length / 2);
            for (uint i = 0; i < nextLevel.length; i++) {
                nextLevel[i] = keccak256(
                    abi.encodePacked(currentLevel[2 * i], currentLevel[2 * i + 1])
                );
            }
            currentLevel = nextLevel;
        }
        return currentLevel[0];
    }
}