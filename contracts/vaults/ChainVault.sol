pragma solidity ^0.8.24;

import "../vaults/BaseVault.sol";

/**
 * @dev Interface for crosschain messaging.
 */
interface IChainMessenger {
    function sendReport(address indexed receiver, bytes data) external;
}

/**
 * @dev Interface for treasury registry.
 */
interface ITreasuryRegistry {
    function recordVault(address vault) external;
}

contract ChainVault is BaseVault {
    ITreasuryRegistry public immutable treasuryRegistry;
    IChainMessenger public immutable messenger;

    event VaultReported(address indexed vault, uint256 totalAssets);

    constructor(
        address _asset,
        address _yieldDistributor,
        address _treasuryRegistry,
        address _messenger
    ) BaseVault(_asset, _yieldDistributor) {
        require(_treasuryRegistry != address(0), "ChainVault: treasuryRegistry cannot be zero");
        require(_messenger != address(0), "ChainVault: messenger cannot be zero");
        treasuryRegistry = ITreasuryRegistry(_treasuryRegistry);
        messenger = IChainMessenger(_messenger);
    }

    /**
     * @notice Report this vault's total assets to the treasury registry via crosschain messenger.
     */
    function reportTotalAssets() external {
        uint256 assets = totalAssets();
        bytes memory data = abi.encode(address(this), assets);
        messenger.sendReport(treasuryRegistry, data);
        emit VaultReported(address(this), assets);
    }
}