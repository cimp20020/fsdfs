import React, { useState } from 'react';
import { Wallet, RefreshCw, Copy, CheckCircle } from 'lucide-react';
import { useEnvWallet } from '../hooks/useEnvWallet';

export const RelayerPage: React.FC = () => {
  const { 
    relayerAddress, 
    multiNetworkBalances,
    fetchMultiNetworkBalances 
  } = useEnvWallet();

  const [copiedItem, setCopiedItem] = useState<string | null>(null);

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

  const CopyNotification = ({ show, text }: { show: boolean; text: string }) => (
    <div className={`fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg transition-all duration-300 z-50 flex items-center gap-2 ${
      show ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
    }`}>
      <CheckCircle className="w-4 h-4" />
      {text}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Copy Notifications */}
      <CopyNotification 
        show={copiedItem === 'relayer-address'} 
        text="Адрес релейера скопирован!" 
      />

      {/* Relayer Information and Multi-Network Balances */}
      {(relayerAddress || (multiNetworkBalances && Object.keys(multiNetworkBalances).length > 0)) && (
        <div className="bg-[#111111] border border-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Wallet className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-white">Информация о релейере</h2>
            </div>
            {multiNetworkBalances && Object.keys(multiNetworkBalances).length > 0 && (
              <button
                onClick={fetchMultiNetworkBalances}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#222225] text-white rounded text-sm hover:bg-[#2a2a2d] transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Обновить
              </button>
            )}
          </div>

          {/* Relayer Address */}
          {relayerAddress && (
            <div className="mb-6">
              <div className="text-sm text-gray-400 mb-2">Адрес релейера</div>
              <div 
                onClick={() => copyToClipboard(relayerAddress, 'relayer-address')}
                className="text-white font-mono text-sm bg-[#0a0a0a] border border-gray-700 p-3 rounded cursor-pointer hover:bg-gray-800/50 transition-colors flex items-center justify-between group"
              >
                <span>{relayerAddress}</span>
                <Copy className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
              </div>
            </div>
          )}

          {/* Multi-Network Balances */}
          {multiNetworkBalances && Object.keys(multiNetworkBalances).length > 0 && (
            <>
              <div className="text-sm text-gray-400 mb-4">Балансы во всех сетях</div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Object.entries(multiNetworkBalances).map(([networkName, data]) => (
                  <div key={networkName} className="bg-[#111111] border border-gray-800 rounded-lg p-4">
                    <div className="text-sm font-medium text-white mb-1">{networkName}</div>
                    <div className="text-lg font-semibold text-green-400">
                      {parseFloat(data.balance).toFixed(4)}
                    </div>
                    <div className="text-xs text-gray-400">{data.currency}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};