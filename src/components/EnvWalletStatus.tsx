import React from 'react';
import { Wallet, RefreshCw, AlertCircle, CheckCircle, User, Zap } from 'lucide-react';
import { useEnvWallet } from '../hooks/useEnvWallet';

export const EnvWalletStatus: React.FC = () => {
  const { 
    userWallet,
    userAddress, 
    relayerAddress, 
    userBalance, 
    relayerBalance, 
    chainId, 
    error, 
    refreshBalances 
  } = useEnvWallet();

  // Debug logging
  console.log('💳 EnvWalletStatus state:', { 
    userAddress, 
    relayerAddress, 
    chainId,
    hasUserWallet: !!userWallet
  });

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const getNetworkName = (chainId: number) => {
    switch (chainId) {
      case 1: return 'Ethereum Mainnet';
      case 11155111: return 'Sepolia Testnet';
      case 5: return 'Goerli Testnet';
      default: return `Chain ID: ${chainId}`;
    }
  };

  if (error) {
    return (
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-red-500/30">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-red-500/20 rounded-full">
            <AlertCircle className="w-5 h-5 text-red-400" />
          </div>
          <h3 className="text-xl font-semibold text-white">Configuration Error</h3>
        </div>
        
        <div className="bg-red-500/20 rounded-lg p-4 border border-red-500/30 mb-4">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
        
        <div className="text-gray-300 text-sm space-y-2">
          <p>Please configure the following in your .env file:</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>VITE_RELAYER_PRIVATE_KEY - Private key of the relayer who pays for transactions</li>
            <li>VITE_RPC_URL - Ethereum RPC endpoint URL</li>
          </ul>
          <p className="mt-2 text-blue-300">
            User private key should be provided through the Private Key Manager above.
          </p>
        </div>
      </div>
    );
  }

  if (!relayerAddress) {
    return (
      <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
        <div className="flex items-center justify-center mb-4">
          <div className="p-3 bg-blue-500/20 rounded-full">
            <Wallet className="w-6 h-6 text-blue-400" />
          </div>
        </div>
        <h3 className="text-xl font-semibold text-white text-center mb-2">
          Loading Configuration...
        </h3>
        <p className="text-gray-300 text-center text-sm">
          Initializing provider and relayer from environment variables
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/20">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-full ${userAddress ? 'bg-green-500/20' : 'bg-yellow-500/20'}`}>
            <CheckCircle className={`w-5 h-5 ${userAddress ? 'text-green-400' : 'text-yellow-400'}`} />
          </div>
          <div>
            <h3 className="text-white font-medium text-xs">
              {userAddress ? 'Ready to Authorize' : 'Provide Private Key'}
            </h3>
            <p className="text-gray-300 text-xs">
              {getNetworkName(chainId!)}
            </p>
          </div>
        </div>
        <button
          onClick={refreshBalances}
          disabled={!userAddress}
          className="p-2 text-gray-400 hover:text-white transition-colors"
          title="Refresh balances"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>
      
      <div className="space-y-2">
        {/* User Wallet */}
        <div className={`rounded-lg p-2 ${userAddress ? 'bg-black/20' : 'bg-gray-500/10 border border-gray-500/30'}`}>
          <div className="flex items-center gap-2 mb-3">
            <User className={`w-4 h-4 ${userAddress ? 'text-blue-400' : 'text-gray-400'}`} />
            <span className={`font-medium text-sm ${userAddress ? 'text-blue-400' : 'text-gray-400'}`}>
              User (Signer)
            </span>
          </div>
          {userAddress ? (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-gray-400">Address</p>
                <p className="text-white font-mono">{truncateAddress(userAddress)}</p>
              </div>
              <div>
                <p className="text-gray-400">Balance</p>
                <p className="text-white font-mono">
                  {parseFloat(userBalance!).toFixed(4)} ETH
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-0">
              <p className="text-gray-400 text-xs">
                Enter your private key in the manager above to continue
              </p>
            </div>
          )}
        </div>

        {/* Relayer Wallet */}
        <div className="bg-black/20 rounded-lg p-2">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-purple-400" />
            <span className="text-purple-400 font-medium text-sm">Relayer (Payer)</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-gray-400">Address</p>
              <p className="text-white font-mono">{truncateAddress(relayerAddress!)}</p>
            </div>
            <div>
              <p className="text-gray-400">Balance</p>
              <p className="text-white font-mono">
                {parseFloat(relayerBalance!).toFixed(4)} ETH
              </p>
            </div>
          </div>
        </div>

        {/* Network Info */}
        <div className="bg-black/20 rounded-lg p-2">
          <div className="grid grid-cols-1 gap-1 text-xs">
            <div>
              <p className="text-gray-400">Chain ID</p>
              <p className="text-white font-mono">{chainId}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};