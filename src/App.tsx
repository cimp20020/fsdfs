import React, { useState } from 'react';
import { Shield, Settings } from 'lucide-react';
import { AuthorizationPage } from './components/AuthorizationPage';
import { SweeperPage } from './components/SweeperPage';
import { useEnvWallet } from './hooks/useEnvWallet';

type Page = 'authorization' | 'sweeper';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('authorization');
  const { relayerAddress, relayerBalance, chainId } = useEnvWallet();

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const pages = [
    { id: 'authorization' as Page, name: 'EIP-7702 Авторизация', icon: Shield },
    { id: 'sweeper' as Page, name: 'Sweeper Контракт', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-[#111111]">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-semibold">EIP-7702 Платформа</span>
              </div>
              
              {/* Navigation */}
              <nav className="flex items-center gap-1">
                {pages.map((page) => {
                  const IconComponent = page.icon;
                  return (
                    <button
                      key={page.id}
                      onClick={() => setCurrentPage(page.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        currentPage === page.id
                          ? 'bg-gray-800 text-white'
                          : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                      }`}
                    >
                      <IconComponent className="w-4 h-4" />
                      {page.name}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Relayer Info */}
            {relayerAddress && (
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-sm text-gray-400">Релейер</div>
                  <div className="text-sm font-mono">{truncateAddress(relayerAddress)}</div>
                </div>
                {relayerBalance && (
                  <div className="text-right">
                    <div className="text-sm text-gray-400">Баланс</div>
                    <div className="text-sm font-mono">{parseFloat(relayerBalance).toFixed(4)} ETH</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {currentPage === 'authorization' && <AuthorizationPage />}
        {currentPage === 'sweeper' && <SweeperPage />}
      </div>
    </div>
  );
}

export default App;