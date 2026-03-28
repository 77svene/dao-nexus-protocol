pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/utils/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title BaseVault
 * @notice ERC4626 compliant vault that deposits assets into a YieldDistributor and
 *         reports total assets back to the caller. This contract is extended by
 *         ChainVault for crosschain messaging.
 */
contract BaseVault is ERC4626, ReentrancyGuard {
    IYieldDistributor public immutable yieldDistributor;

    /**
     * @param asset        ERC20 token that is deposited into the vault.
     * @param yieldDistributor Address of the YieldDistributor contract that manages
     *                         strategies and yield compounding.
     */
    constructor(
        ERC20 _asset,
        address _yieldDistributor
    ) ERC4626(_asset) {
        require(_yieldDistributor != address(0), "BaseVault: yieldDistributor address cannot be zero");
        yieldDistributor = IYieldDistributor(_yieldDistributor);
    }

    /**
     * @return The total assets managed by the yield distributor that belong to this vault.
     */
    function totalAssets() public view override returns (uint256) {
        return yieldDistributor.totalAssetsForVault(address(this));
    }

    /**
     * @internal
     * @override ERC4626._deposit
     * @dev Deposits `amount` of the underlying asset into the yield distributor,
     *      then transfers the same amount to the distributor on behalf of the caller.
     *      The transfer is protected against reentrancy.
     */
    function _deposit(uint256 amount) internal override reentrant {
        super._deposit(amount);
        // Transfer the deposited amount to the yield distributor.
        // The call is protected by `nonReentrant` to prevent ERC777 reentrancy.
        require(
            ERC20(asset()).transfer(address(yieldDistributor), amount),
            "BaseVault: transfer to yield distributor failed"
        );
    }

    /**
     * @internal
     * @override ERC4626._withdraw
     * @dev Withdraws `shares` from the vault, requests the corresponding
     *      `amount` from the yield distributor, and then performs the payout.
     *      The external call to `withdraw` now checks its return value.
     */
    function _withdraw(uint256 shares) internal override {
        uint256 amount = previewWithdraw(shares);
        // The yield distributor must successfully withdraw the amount.
        // If it fails, the transaction reverts.
        require(
            yieldDistributor.withdraw(address(this), amount),
            "BaseVault: withdraw from yield distributor failed"
        );
        super._withdraw(shares);
    }
}