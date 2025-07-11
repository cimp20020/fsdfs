import React from 'react';
import { Zap, Wallet, RefreshCw, Copy } from 'lucide-react';
import { useEnvWallet } from '../hooks/useEnvWallet';
import { getAllNetworks, getNetworkById } from '../config/networkConfig';

export const RelayerPage: React.FC = () => {
  const { 
    relayerAddress, 
    multiNetworkBalances,
    fetchMultiNetworkBalances 
  } = useEnvWallet();

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Relayer Information */}
      {relayerAddress && (
        <div className="bg-[#111111] border border-gray-800 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <Zap className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-white">Релейер</h2>
          </div>
          <div>
            <div className="text-sm text-gray-400 mb-2">Адрес</div>
            <div 
              onClick={() => copyToClipboard(relayerAddress)}
              className="text-white font-mono text-sm bg-gray-800/50 p-3 rounded border cursor-pointer hover:bg-gray-700/50 transition-colors flex items-center justify-between group"
            >
              <span>{relayerAddress}</span>
              <Copy className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Сокращенно: {truncateAddress(relayerAddress)} • Нажмите для копирования
            </div>
          </div>
        </div>
      )}

      {/* Multi-Network Balances */}
      {multiNetworkBalances && Object.keys(multiNetworkBalances).length > 0 && (
        <div className="bg-[#111111] border border-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Wallet className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-white">Балансы во всех сетях</h2>
            </div>
            <button
              onClick={fetchMultiNetworkBalances}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#222225] text-white rounded text-sm hover:bg-[#2a2a2d] transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Обновить
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Object.entries(multiNetworkBalances).map(([networkName, data]) => (
              <div key={networkName} className="bg-gray-800/30 border border-gray-700 rounded p-4">
                <div className="text-sm font-medium text-white mb-1">{networkName}</div>
                <div className="text-lg font-semibold text-green-400">
                  {parseFloat(data.balance).toFixed(4)}
                </div>
                <div className="text-xs text-gray-400">{data.currency}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};