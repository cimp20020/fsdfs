import React from 'react';
import { Globe, Zap, Wallet, RefreshCw } from 'lucide-react';
import { useEnvWallet } from '../hooks/useEnvWallet';
import { getAllNetworks, getNetworkById } from '../config/networkConfig';

export const RelayerPage: React.FC = () => {
  const { 
    relayerAddress, 
    relayerBalance, 
    chainId, 
    multiNetworkBalances,
    refreshBalances,
    fetchMultiNetworkBalances 
  } = useEnvWallet();

  const networks = getAllNetworks();
  const currentNetwork = getNetworkById(chainId || 0);

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Current Network */}
      <div className="bg-[#111111] border border-gray-800 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <Globe className="w-5 h-5 text-green-400" />
          <h2 className="text-lg font-semibold text-white">Текущая сеть</h2>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-sm text-gray-400">Название</div>
            <div className="text-white font-medium">
              {currentNetwork?.name || 'Неизвестно'}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-400">Валюта</div>
            <div className="text-white font-medium">
              {currentNetwork?.currency || 'ETH'}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-400">Chain ID</div>
            <div className="text-white font-medium">
              {chainId || 'Не подключено'}
            </div>
          </div>
        </div>
      </div>

      {/* Relayer Information */}
      {relayerAddress && (
        <div className="bg-[#111111] border border-gray-800 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <Zap className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-white">Релейер</h2>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-sm text-gray-400 mb-2">Адрес</div>
              <div className="text-white font-mono text-sm bg-gray-800/50 p-3 rounded border">
                {relayerAddress}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Сокращенно: {truncateAddress(relayerAddress)}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-400 mb-2">Баланс в текущей сети</div>
              <div className="text-white font-medium text-lg">
                {relayerBalance ? 
                  `${parseFloat(relayerBalance).toFixed(4)} ${currentNetwork?.currency || 'ETH'}` : 
                  'Загрузка...'
                }
              </div>
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

      {/* Actions */}
      <div className="bg-[#111111] border border-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Действия</h2>
        <div className="flex gap-3">
          <button
            onClick={refreshBalances}
            className="flex items-center gap-2 px-4 py-2 bg-[#222225] text-white rounded hover:bg-[#2a2a2d] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Обновить баланс текущей сети
          </button>
          <button
            onClick={fetchMultiNetworkBalances}
            className="flex items-center gap-2 px-4 py-2 bg-[#222225] text-white rounded hover:bg-[#2a2a2d] transition-colors"
          >
            <Globe className="w-4 h-4" />
            Обновить все сети
          </button>
        </div>
      </div>

      {/* Configuration Info */}
      <div className="bg-[#111111] border border-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Конфигурация</h2>
        <div className="text-sm text-gray-400 space-y-2">
          <p>• Релейер настроен через переменные окружения</p>
          <p>• Поддерживается несколько сетей одновременно</p>
          <p>• Балансы обновляются автоматически при смене сети</p>
          <p>• Для каждой сети можно настроить отдельный приватный ключ</p>
        </div>
      </div>
    </div>
  );
};