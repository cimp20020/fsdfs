import React, { useState } from 'react';
import { Wallet, RefreshCw, Copy, CheckCircle, Server, Network, Globe, Activity } from 'lucide-react';
import { useEnvWallet } from '../hooks/useEnvWallet';
import { getAllNetworks } from '../config/networkConfig';

export const RelayerPage: React.FC = () => {
  const { 
    relayerAddress, 
    chainId,
    relayerBalance,
    multiNetworkBalances,
    fetchMultiNetworkBalances,
    provider
  } = useEnvWallet();

  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const networks = getAllNetworks();
  const currentNetwork = networks.find(network => network.id === chainId);

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const copyToClipboard = async (text: string, itemId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItem(itemId);
      setTimeout(() => setCopiedItem(null), 2000); // Hide notification after 2 seconds
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchMultiNetworkBalances();
    } finally {
      setIsRefreshing(false);
    }
  };

  const CopyNotification = ({ show, text }: { show: boolean; text: string }) => (
    <div className={`fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg transition-all duration-300 z-50 flex items-center gap-2 ${
      show ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
    }`}>
      <CheckCircle className="w-4 h-4" />
      {text}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Copy Notifications */}
      <CopyNotification 
        show={copiedItem === 'relayer-address'} 
        text="Адрес релейера скопирован!" 
      />
      
      {/* Combined Information Block */}
      <div className="bg-[#111111] border border-gray-800 rounded-lg p-3 pb-2">
        {/* Relayer Address Section */}
        {relayerAddress && (
          <div className="mb-3">
            <div className="flex items-center gap-3 mb-4">
              <Wallet className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-white">Адрес релейера</h2>
            </div>
            
            <div 
              onClick={() => copyToClipboard(relayerAddress, 'relayer-address')}
              className="text-white font-mono text-sm bg-[#0a0a0a] border border-gray-700 p-3 rounded cursor-pointer hover:bg-gray-800/50 transition-colors flex items-center justify-between group"
            >
              <span>{relayerAddress}</span>
              <Copy className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-gray-700 mb-3"></div>

        {/* Networks Configuration Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Network className="w-5 h-5 text-purple-400" />
              <h2 className="text-lg font-semibold text-white">Конфигурация сетей</h2>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#222225] text-white rounded text-sm hover:bg-[#2a2a2d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Обновить
              </button>
              <div className="text-sm text-gray-400">
                Всего сетей: {networks.length}
              </div>
            </div>
          </div>
          
          <div className="overflow-x-auto -mx-3">
            <table className="w-full text-sm min-w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2 px-3 text-gray-400 font-medium whitespace-nowrap">Сеть</th>
                  <th className="text-left py-1 px-3 text-gray-400 font-medium whitespace-nowrap">Chain ID</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium whitespace-nowrap">Баланс</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium whitespace-nowrap">Gas Limit</th>
                  <th className="text-left py-2 px-3 text-gray-400 font-medium whitespace-nowrap">Delegate Address</th>
                </tr>
              </thead>
              <tbody>
                {networks.map((network) => {
                  const networkBalance = multiNetworkBalances?.[network.name];
                  return (
                    <tr key={network.id} className={`border-b border-gray-800 hover:bg-gray-800/30 transition-colors ${
                      network.id === chainId ? 'bg-[#222225]' : ''
                    }`}>
                      <td className="py-1.5 px-3">
                        <div className="font-medium text-white">{network.name}</div>
                      </td>
                      <td className="py-1.5 px-3 text-gray-300">{network.id}</td>
                      <td className="py-1.5 px-3">
                        {networkBalance ? (
                          <div className="text-white font-medium whitespace-nowrap">
                            {parseFloat(networkBalance.balance).toFixed(4)} {networkBalance.currency}
                          </div>
                        ) : (
                          <div className="text-gray-500">—</div>
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-gray-300 whitespace-nowrap">{network.gasConfig.gasLimit.toLocaleString()}</td>
                      <td className="py-1.5 px-3">
                        <div className="font-mono text-xs text-gray-300 break-all min-w-0">
                          {network.delegateAddress}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
