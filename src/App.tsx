import React, { useState } from 'react';
import { Shield, Github, Twitter, Zap } from 'lucide-react';
import { EnvAuthorizationForm } from './components/EnvAuthorizationForm';
import { ContractInteraction } from './components/ContractInteraction';
import { InfoCard } from './components/InfoCard';
import { useEnvWallet } from './hooks/useEnvWallet';

function App() {
  const { updateUserPrivateKey, currentUserPrivateKey, userAddress, relayerAddress, relayerBalance, multiNetworkBalances } = useEnvWallet();

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatBalance = (balance: string) => {
    const ethValue = parseFloat(balance);
    return {
      eth: ethValue.toFixed(4),
    };
  };

  // Handler for bulk authorization
  const handleBulkAuthorize = async (privateKey: string, keyIndex: number): Promise<{ success: boolean; txHash?: string; error?: string }> => {
    try {
      console.log(`🔄 Starting bulk authorization for key ${keyIndex + 1}`);
      
      await updateUserPrivateKey(privateKey);
      
      let retries = 0;
      const maxRetries = 20;
      
      while (retries < maxRetries) {
        const authButton = document.querySelector('[data-testid="auth-button"]') as HTMLButtonElement;
        if (authButton && !authButton.disabled) {
          console.log(`✅ Button ready after ${retries} retries`);
          break;
        }
        console.log(`⏳ Waiting for button to be ready... retry ${retries + 1}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, 500));
        retries++;
      }
      
      const authButton = document.querySelector('[data-testid="auth-button"]') as HTMLButtonElement;
      if (authButton && !authButton.disabled) {
        console.log(`🎯 Clicking authorization button for key ${keyIndex + 1}`);
        authButton.click();
        
        let txRetries = 0;
        const maxTxRetries = 60;
        
        while (txRetries < maxTxRetries) {
          const statusElement = document.querySelector('[data-testid="tx-status"]');
          if (statusElement) {
            const statusText = statusElement.textContent || '';
            if (statusText.includes('successfully') || statusText.includes('Transaction:')) {
              console.log(`✅ Transaction completed for key ${keyIndex + 1}`);
              return { 
                success: true, 
                txHash: `bulk-tx-${Date.now()}-${keyIndex}` 
              };
            } else if (statusText.includes('failed') || statusText.includes('error')) {
              console.log(`❌ Transaction failed for key ${keyIndex + 1}: ${statusText}`);
              return { 
                success: false, 
                error: statusText 
              };
            }
          }
          
          await new Promise(resolve => setTimeout(resolve, 500));
          txRetries++;
        }
        
        return { 
          success: true, 
          txHash: `bulk-tx-${Date.now()}-${keyIndex}` 
        };
      } else {
        return { 
          success: false, 
          error: `Authorization button not ready after ${maxRetries} retries` 
        };
      }
    } catch (error) {
      console.error(`❌ Bulk authorization failed for key ${keyIndex + 1}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  };

  return (
    <div className="min-h-screen bg-black">
      
      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-white drop-shadow-sm" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white">EIP-7702 Authorization Platform</h1>
              <p className="text-zinc-400 text-sm">Ethereum Account Delegation & Contract Interaction</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-8">
            <EnvAuthorizationForm />
          </div>
          
          {/* Right Column */}
          <div className="space-y-8">
            {/* Relayer Wallet Block */}
            {relayerAddress && (
              <div className="bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl">
                <div className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
                      <Zap className="w-5 h-5 text-white drop-shadow-sm" />
                    </div>
                    <div>
                      <div className="text-base font-semibold text-white">Relayer Wallet</div>
                      <div className="text-sm text-zinc-400">Pays for transaction fees</div>
                    </div>
                  </div>
                  
                  {/* Current Network Balance */}
                  {relayerBalance && (
                    <div className="bg-black/50 rounded-xl p-4 mb-4 border border-zinc-800">
                      <div className="text-sm text-zinc-400 mb-2">Current Network</div>
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-zinc-300 font-mono">{truncateAddress(relayerAddress)}</div>
                        <div className="text-right">
                          <div className="text-base font-semibold text-white">
                            {parseFloat(relayerBalance).toFixed(4)} ETH
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Multi-Network Balances */}
                  {multiNetworkBalances && (
                    <div className="bg-black/50 rounded-xl p-4 border border-zinc-800">
                      <div className="text-sm text-zinc-400 mb-3">All Networks</div>
                      <div className="space-y-3">
                        {Object.entries(multiNetworkBalances).map(([network, data]) => (
                          <div key={network} className="flex items-center justify-between">
                            <div className="text-sm text-zinc-300 font-medium">{network}</div>
                            <div className="text-sm font-mono text-white">
                              {parseFloat(data.balance).toFixed(4)} {data.currency}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {!relayerBalance && !multiNetworkBalances && (
                    <div className="flex items-center justify-between">
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <ContractInteraction />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;