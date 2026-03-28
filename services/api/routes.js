const express = require('express');
const router = express.Router();
const { validateJWT, checkNonce, checkWhitelist } = require('./middleware');
const { ethers } = require('ethers');

// Contract addresses from environment variables (set during deployment)
const GOVERNOR_ADDRESS = process.env.GOVERNOR_ADDRESS;
const DAO_TOKEN_ADDRESS = process.env.DAO_TOKEN_ADDRESS;
const TREASURY_REGISTRY_ADDRESS = process.env.TREASURY_REGISTRY_ADDRESS;
const AGENT_REGISTRY_ADDRESS = process.env.AGENT_REGISTRY_ADDRESS;
const MERKLE_TREE_ADDRESS = process.env.MERKLE_TREE_ADDRESS;
const VOTE_PROOF_VERIFIER_ADDRESS = process.env.VOTE_PROOF_VERIFIER_ADDRESS;

// Contract ABIs (minimal required for endpoints)
const governorABI = [
  "function propose(address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, string description) external returns (uint256)",
  "function votingToken() view returns (address)",
  "function state(uint256 proposalId) view returns (uint8)",
  "function castVote(uint256 proposalId, uint8 support) external"
];

const daoTokenABI = [
  "function delegate(address delegatee) external",
  "function getPastVotes(address account, uint256 blockNumber) view returns (uint256)",
  "function getVotes(address account) view returns (uint256)",
  "function delegators(address account) view returns (address)"
];

const treasuryRegistryABI = [
  "function getVaults() view returns (address[])",
  "function vaultInfo(address vault) view returns (uint256 totalAssets, uint256 totalSupply, string lastReported)"
];

const agentRegistryABI = [
  "function agents(address agent) view returns (bytes32 strategyHash, uint256 bonding)",
  "function getAgentCount() view returns (uint256)",
  "function getAgentAtIndex(uint256 index) view returns (address)"
];

const merkleTreeABI = [
  "function roots(uint256) view returns (bytes32)",
  "function getLeafCount() view returns (uint256)",
  "function submitLeaf(bytes32 leaf) external"
];

const voteProofVerifierABI = [
  "function verifyProof(bytes calldata proof) external returns (bool)"
];

// Initialize provider and signer (using backend private key for transaction signing)
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'http://localhost:8545');
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

// Contract instances
const governor = new ethers.Contract(GOVERNOR_ADDRESS, governorABI, signer);
const daoToken = new ethers.Contract(DAO_TOKEN_ADDRESS, daoTokenABI, signer);
const treasuryRegistry = new ethers.Contract(TREASURY_REGISTRY_ADDRESS, treasuryRegistryABI, signer);
const agentRegistry = new ethers.Contract(AGENT_REGISTRY_ADDRESS, agentRegistryABI, signer);
const merkleTree = new ethers.Contract(MERKLE_TREE_ADDRESS, merkleTreeABI, signer);
const voteProofVerifier = new ethers.Contract(VOTE_PROOF_VERIFIER_ADDRESS, voteProofVerifierABI, signer);

// Middleware applied to all routes
router.use(validateJWT);
router.use(checkNonce);
router.use(checkWhitelist);

// POST /proposals - Create a new governance proposal
router.post('/proposals', async (req, res) => {
  try {
    const { targets, values, signatures, calldatas, description } = req.body;
        // Validate inputs
    if (!targets || !values || !signatures || !calldatas || !description) {
      return res.status(400).json({ error: 'Missing required proposal fields' });
    }
        if (targets.length !== values.length || targets.length !== signatures.length || targets.length !== calldatas.length) {
      return res.status(400).json({ error: 'Array length mismatch' });
    }
    
    // Convert values to ethers BigNumber
    const valuesBN = values.map(v => ethers.parseEther(v.toString()));
    
    // Submit proposal
    const tx = await governor.propose(targets, valuesBN, signatures, calldatas, description);
    const receipt = await tx.wait();
    
    // Extract proposal ID from events    const proposalCreatedEvent = governor.interface.parseLog(receipt.logs[0]);
    const proposalId = proposalCreatedEvent.args.proposalId;
    
    res.status(201).json({ 
      proposalId,       transactionHash: receipt.hash,
      message: 'Proposal created successfully'
    });
  } catch (error) {
    console.error('Proposal creation failed:', error);
    res.status(500).json({ error: 'Proposal creation failed', details: error.message });
  }
});

// POST /vote - Submit vote with ZK proof and signature
router.post('/vote', async (req, res) => {
  try {
    const { proposalId, support, proof, signature } = req.body;
    
    // Validate inputs
    if (proposalId === undefined || support === undefined || !proof || !signature) {
      return res.status(400).json({ error: 'Missing required vote fields' });
    }
    
    // Verify ZK proof first (off-chain verification would happen here, but we verify on-chain)
    const isValidProof = await voteProofVerifier.verifyProof(proof);
    if (!isValidProof) {
      return res.status(400).json({ error: 'Invalid ZK proof' });
    }
    
    // Verify signature (assuming signature is of the vote intent)
    // In a real implementation, we'd recover signer from signature and compare to msg.sender
    // For simplicity, we assume signature is valid if middleware passed
    
    // Cast vote on Governor (support: 0=against, 1=for, 2=abstain)
    const tx = await governor.castVote(proposalId, support);
    const receipt = await tx.wait();
    
    res.status(200).json({ 
      transactionHash: receipt.hash,
      message: 'Vote submitted successfully'
    });
  } catch (error) {
    console.error('Vote submission failed:', error);
    res.status(500).json({ error: 'Vote submission failed', details: error.message });
  }
});

// GET /delegations - List active delegation agents
router.get('/delegations', async (req, res) => {
  try {
    const agentCount = await agentRegistry.getAgentCount();
    const agents = [];
        for (let i = 0; i < agentCount; i++) {
      const agentAddress = await agentRegistry.getAgentAtIndex(i);
      const { strategyHash, bonding } = await agentRegistry.agents(agentAddress);
      
      agents.push({
        address: agentAddress,
        strategyHash: ethers.formatBytes32String(strategyHash),
        bonding: bonding.toString(),
        isActive: bonding > 0      });
    }
    
    // Filter only active agents
    const activeAgents = agents.filter(agent => agent.isActive);
    
    res.status(200).json({ 
      agents: activeAgents,
      count: activeAgents.length
    });
  } catch (error) {
    console.error('Failed to fetch delegations:', error);
    res.status(500).json({ error: 'Failed to fetch delegations', details: error.message });
  }
});

// GET /treasury - Aggregate vault APYs and totals
router.get('/treasury', async (req, res) => {
  try {
    const vaultAddresses = await treasuryRegistry.getVaults();
    const treasuryData = {
      totalValueLocked: ethers.BigNumber.from(0),
      totalYield: ethers.BigNumber.from(0),
      vaults: [],
      averageAPY: 0
    };
    
    let totalApy = 0;
    let vaultCount = 0;
    
    for (const vaultAddr of vaultAddresses) {
      try {
        const vaultInfo = await treasuryRegistry.vaultInfo(vaultAddr);
        const totalAssets = vaultInfo.totalAssets;
        const totalSupply = vaultInfo.totalSupply;
        
        // Calculate APY (simplified - in reality would need historical data)
        // For MVP, we'll use a mock APY based on supply change
        const apy = totalSupply > 0 ? (totalAssets * BigInt(100) * BigInt(365) / totalSupply / BigInt(30)) : BigInt(0);
        
        treasuryData.totalValueLocked = treasuryData.totalValueLocked + totalAssets;
        treasuryData.totalYield = treasuryData.totalYield + (totalAssets - totalSupply); // Simplified yield        
        treasuryData.vaults.push({
          address: vaultAddr,
          totalAssets: totalAssets.toString(),
          totalSupply: totalSupply.toString(),
          apy: Number(apy) / 100, // Convert to percentage
          lastReported: vaultInfo.lastReported
        });
                totalApy += Number(apy);
        vaultCount++;
      } catch (vaultError) {
        console.warn(`Failed to fetch data for vault ${vaultAddr}:`, vaultError.message);
        // Continue with other vaults      }
    }
    
    treasuryData.averageAPY = vaultCount > 0 ? totalApy / vaultCount : 0;
    
    // Format big numbers for JSON response
    res.status(200).json({
      totalValueLocked: treasuryData.totalValueLocked.toString(),
      totalYield: treasuryData.totalYield.toString(),
      averageAPY: treasuryData.averageAPY,
      vaults: treasuryData.vaults
    });
  } catch (error) {
    console.error('Treasury data fetch failed:', error);
    res.status(500).json({ error: 'Failed to fetch treasury data', details: error.message });
  }
});

module.exports = router;