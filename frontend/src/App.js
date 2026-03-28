import './App.css';
import { WagmiConfig } from 'wagmi';
import { configureChains, createClient, sepolia } from 'wagmi';
import { WalletConnectConnector } from 'wagmi/connectors/walletConnect';
import { InjectedConnector } from 'wagmi/connectors/injected';
import { publicProvider } from 'wagmi/providers/public';
import { alchemyProvider } from 'wagmi/providers/alchemy';
import { infuraProvider } from 'wagmi/providers/infura';
import { etherscanProvider } from 'wagmi/providers/etherscan';
import Dashboard from './components/Dashboard';
import ProposalForm from './components/ProposalForm';
import { useAccount, useConnect, useDisconnect, useNetwork } from 'wagmi';
import { useEffect, useState } from 'react';

function App() {
  const { data: account, isLoading, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: network } = useNetwork();
  const [walletConnectProjectId, setWalletConnectProjectId] = useState('');

  // Load WalletConnect project ID from environment variable
  useEffect(() => {
    const projectId = process.env.REACT_APP_WALLETCONNECT_PROJECT_ID;
    if (projectId) {
      setWalletConnectProjectId(projectId);
    }
  }, []);

  // Configure chains with multiple RPC fallbacks
  const { chains, provider, webSocketProvider } = configureChains(
    [sepolia],
    [
      // Alchemy (requires API key)
      alchemyProvider({ apiKey: process.env.REACT_APP_ALCHEMY_API_KEY || '' }),
      // Infura (requires API key)
      infuraProvider({ apiKey: process.env.REACT_APP_INFURA_API_KEY || '' }),
      // Etherscan (free tier)
      etherscanProvider({ apiKey: process.env.REACT_APP_ETHERSCAN_API_KEY || '' }),
      // Public provider (fallback)
      publicProvider()
    ]
  );

  // Create Wagmi client  const wagmiClient = createClient({
    autoConnect: true,
    connectors: [
      new WalletConnectConnector({
        chains,
        options: {
          projectId: walletConnectProjectId || '', // Empty string if not set (will fail gracefully)
          showQrCode: true
        }
      }),
      new InjectedConnector({
        chains,
        options: {
          name: 'Injected',
          shimDisconnect: true
        }
      })
    ],
    provider,
    webSocketProvider
  });

  return (
    <WagmiConfig client={wagmiClient}>
      <div className="App">
        <header className="App-header">
          <h1>DAO Nexus</h1>
          <div className="wallet-status">
            {isLoading ? (
              <span>Connecting...</span>
            ) : !isConnected ? (
              <button onClick={() => connect()}>Connect Wallet</button>
            ) : (
              <>
                <span>Connected: {account?.substring(0, 6)}...{account?.substring(38)}</span>
                <span> | Network: {network?.name}</span>
                <button onClick={() => disconnect()}>Disconnect</button>
              </>
            )}
          </div>
        </header>
        <main>
          {isConnected ? (
            <>
              <Dashboard />
              <ProposalForm />
            </>
          ) : (
            <p>Please connect your wallet to use the DAO Nexus dashboard.</p>
          )}
        </main>
      </div>
    </WagmiConfig>
  );
}

export default App;