import React, { useEffect, useState } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';

const Dashboard = () => {
  const { address, isConnected } = useAccount();
  const { connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const [vaults, setVaults] = useState([]);
  const [votingPower, setVotingPower] = useState('0');
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!isConnected) return;
      try {
        setLoading(true);
        // Fetch vault APYs
        const vaultsRes = await fetch('/treasury');
        if (!vaultsRes.ok) throw new Error('Failed to fetch vaults');
        const vaultsData = await vaultsRes.json();
        setVaults(vaultsData);

        // Fetch voting power
        const powerRes = await fetch(`/voting-power/${address}`);
        if (!powerRes.ok) throw new Error('Failed to fetch voting power');
        const powerData = await powerRes.json();
        setVotingPower(powerData.votingPower || '0');

        // Fetch active proposals
        const proposalsRes = await fetch('/proposals?active=true');
        if (!proposalsRes.ok) throw new Error('Failed to fetch proposals');
        const proposalsData = await proposalsRes.json();
        setProposals(proposalsData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isConnected, address]);

  if (error) {
    return <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded">{error}</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">DAO Nexus Dashboard</h1>
        <div className="mt-4 flex items-center space-x-4">
          {isConnected ? (
            <>
              <span className="text-gray-600">Connected:</span>
              <span className="font-mono">{address}</span>
              <button
                onClick={disconnectAsync}
                className="ml-4 px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
              >
                Disconnect
              </button>
            </>
          ) : (
            <button              onClick={connectAsync}
              className="px-4 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700"
            >
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      {loading && <div className="text-center py-8">Loading...</div>}

      {!loading && !isConnected && (
        <div className="text-center py-8">
          <p className="text-gray-500">Please connect your wallet to view dashboard data.</p>
        </div>
      )}

      {!loading && isConnected && (
        <>
          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Vault APYs</h2>
            {vaults.length === 0 ? (
              <p className="text-gray-500">No vault data available.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Chain</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Asset</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">APY</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">TVL (USD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {vaults.map((vault) => (
                      <tr key={vault.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {vault.chainName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {vault.assetSymbol}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-indigo-600 font-medium">
                          {vault.apy?.toFixed(2)}%
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          ${vault.tvlUsd?.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Your Voting Power</h2>
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-3xl font-bold text-indigo-600">{votingPower}</p>
              <p className="text-gray-500 mt-2">DAO Nexus Governance Token</p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Active Proposals</h2>
            {proposals.length === 0 ? (
              <p className="text-gray-500">No active proposals at the moment.</p>
            ) : (
              <div className="space-y-4">
                {proposals.map((proposal) => (
                  <div key={proposal.id} className="bg-white rounded-lg shadow p-4">
                    <h3 className="font-semibold text-gray-900">{proposal.title}</h3>
                    <p className="mt-2 text-gray-600">{proposal.description}</p>
                    <div className="mt-4 flex items-center space-x-4 text-sm">
                      <span>Voting ends: {new Date(proposal.endBlock * 1000).toLocaleString()}</span>
                      <span className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full">
                        {proposal.forVotes} For | {proposal.againstVotes} Against
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default Dashboard;