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
      
      {/* Relayer Address */}
      {relayerAddress && (
        <div className="bg-[#111111] border border-gray-800 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <Wallet className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Адрес релейера</h2>
          </div>
          
          <div 
            onClick={() => copyToClipboard(relayerAddress, 'relayer-address')}
            className="text-white font-mono text-sm bg-[#0a0a0a] border border-gray-700 p-4 rounded cursor-pointer hover:bg-gray-800/50 transition-colors flex items-center justify-between group"
          >
            <span>{relayerAddress}</span>
            <Copy className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
          </div>
        </div>
      )}

      {/* Network Configuration */}
      <div className="bg-[#111111] border border-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Network className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-white">Конфигурация сетей</h2>
          </div>
          <div className="text-sm text-gray-400">
            Всего сетей: {networks.length}
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-2 px-3 text-gray-400 font-medium">Сеть</th>
                <th className="text-left py-2 px-3 text-gray-400 font-medium">Chain ID</th>
                <th className="text-left py-2 px-3 text-gray-400 font-medium">Валюта</th>
                <th className="text-left py-2 px-3 text-gray-400 font-medium">Gas Limit</th>
                <th className="text-left py-2 px-3 text-gray-400 font-medium">Delegate Address</th>
                <th className="text-center py-2 px-3 text-gray-400 font-medium">Статус</th>
              </tr>
            </thead>
            <tbody>
              {networks.map((network) => (
                <tr key={network.id} className={`border-b border-gray-800 hover:bg-gray-800/30 transition-colors ${
                  network.id === chainId ? 'bg-green-500/5' : ''
                }`}>
                  <td className="py-3 px-3">
                    <div className="font-medium text-white">{network.name}</div>
                  </td>
                  <td className="py-3 px-3 text-gray-300">{network.id}</td>
                  <td className="py-3 px-3 text-gray-300">{network.currency}</td>
                  <td className="py-3 px-3 text-gray-300">{network.gasConfig.gasLimit.toLocaleString()}</td>
                  <td className="py-3 px-3">
                    <div className="font-mono text-xs text-gray-300 max-w-32 truncate" title={network.delegateAddress}>
                      {network.delegateAddress}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <div className={`w-2 h-2 rounded-full mx-auto ${
                      network.id === chainId ? 'bg-green-400' : 'bg-gray-600'
                    }`} title={network.id === chainId ? 'Активная сеть' : 'Неактивная сеть'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Multi-Network Balances */}
      {multiNetworkBalances && Object.keys(multiNetworkBalances).length > 0 && (
        <div className="bg-[#111111] border border-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-green-400" />
              <h2 className="text-lg font-semibold text-white">Балансы во всех сетях</h2>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#222225] text-white rounded text-sm hover:bg-[#2a2a2d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Обновить
            </button>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Object.entries(multiNetworkBalances).map(([networkName, data]) => {
              const network = networks.find(n => n.name === networkName);
              const isCurrentNetwork = network?.id === chainId;
              
              return (
                <div key={networkName} className={`bg-[#0a0a0a] border rounded-lg p-4 ${
                  isCurrentNetwork ? 'border-green-500/30 bg-green-500/5' : 'border-gray-700'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-sm font-medium text-gray-400">{networkName}</div>
                    {isCurrentNetwork && (
                      <div className="w-2 h-2 bg-green-400 rounded-full" title="Активная сеть" />
                    )}
                  </div>
                  <div className="text-lg font-semibold text-white">
                    {parseFloat(data.balance).toFixed(4)}
                  </div>
                  <div className="text-xs text-gray-400">{data.currency}</div>
                  {network && (
                    <div className="text-xs text-gray-500 mt-1">
                      Chain ID: {network.id}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export { RelayerPage }