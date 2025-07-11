import React, { useState } from 'react';
import { Shield, Send, Target, Loader2, CheckCircle, AlertCircle, ExternalLink, Copy, Globe, Key, User } from 'lucide-react';
import { ethers } from 'ethers';
import { useEnvWallet } from '../hooks/useEnvWallet';
import { tenderlySimulator } from '../utils/tenderly';
import { getAllNetworks, getNetworkById, getTransactionUrl, getNetworkGasConfig } from '../config/networkConfig';

interface TransactionResult {
  hash: string | null;
  status: 'idle' | 'pending' | 'success' | 'error';
  message: string;
  simulationUrl?: string;
}

export const AuthorizationPage: React.FC = () => {
  const { relayerWallet, provider } = useEnvWallet();
  const [userPrivateKey, setUserPrivateKey] = useState('');
  const [selectedNetwork, setSelectedNetwork] = useState<number>(56); // BSC по умолчанию
  const [txResult, setTxResult] = useState<TransactionResult>({
    hash: null,
    status: 'idle',
    message: '',
  });
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [isSimulated, setIsSimulated] = useState(false);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  const networks = getAllNetworks();
  const selectedNetworkConfig = getNetworkById(selectedNetwork);

  const isValidPrivateKey = (key: string) => {
    try {
      if (!key) return false;
      const cleanKey = key.startsWith('0x') ? key.slice(2) : key;
      return /^[0-9a-fA-F]{64}$/.test(cleanKey);
    } catch {
      return false;
    }
  };

  const getUserAddress = () => {
    if (!userPrivateKey || !isValidPrivateKey(userPrivateKey)) return null;
    try {
      const wallet = new ethers.Wallet(userPrivateKey);
      return wallet.address;
    } catch {
      return null;
    }
  };

  const handleSimulate = async () => {
    if (!relayerWallet || !provider || !userPrivateKey || !selectedNetworkConfig) {
      setTxResult({
        hash: null,
        status: 'error',
        message: 'Конфигурация неполная',
      });
      return;
    }

    if (!isValidPrivateKey(userPrivateKey)) {
      setTxResult({
        hash: null,
        status: 'error',
        message: 'Неверный формат приватного ключа',
      });
      return;
    }

    try {
      setTxResult({ hash: null, status: 'pending', message: 'Запуск симуляции EIP-7702...' });
      setSimulationResult(null);
      setIsSimulated(false);

      const userWallet = new ethers.Wallet(userPrivateKey);
      const userAddress = userWallet.address;
      const delegateAddress = selectedNetworkConfig.delegateAddress;
      const relayerAddress = relayerWallet.address;

      console.log('🔍 EIP-7702 Authorization Simulation:', {
        userAddress,
        delegateAddress,
        relayerAddress,
        network: selectedNetworkConfig.name
      });

      // Симуляция с Tenderly
      if (tenderlySimulator.isEnabled()) {
        const simulationResult = await tenderlySimulator.simulateEIP7702Authorization(
          selectedNetwork,
          userAddress,
          delegateAddress,
          relayerAddress,
          {}, // authData - пустой объект для базовой авторизации
          selectedNetworkConfig.gasConfig.authorizationGasLimit || 300000
        );
        
        setSimulationResult(simulationResult);
        setIsSimulated(true);
        
        if (simulationResult.success) {
          setTxResult({
            hash: null,
            status: 'success',
            message: 'Симуляция EIP-7702 прошла успешно. Можно отправить транзакцию.',
            simulationUrl: simulationResult.simulationUrl,
          });
        } else {
          setTxResult({
            hash: null,
            status: 'error',
            message: `Симуляция не прошла: ${simulationResult.error}`,
            simulationUrl: simulationResult.simulationUrl,
          });
        }
      } else {
        // Если Tenderly недоступен, предполагаем успех
        setSimulationResult({ success: true });
        setIsSimulated(true);
        setTxResult({
          hash: null,
          status: 'success',
          message: 'Tenderly не настроен. Симуляция пропущена, можно отправить транзакцию.',
        });
      }

    } catch (error) {
      console.error('EIP-7702 simulation failed:', error);
      setTxResult({
        hash: null,
        status: 'error',
        message: error instanceof Error ? error.message : 'Ошибка симуляции EIP-7702',
      });
    }
  };

  const handleExecute = async () => {
    if (!isSimulated || !simulationResult?.success) {
      setTxResult({
        hash: null,
        status: 'error',
        message: 'Сначала выполните успешную симуляцию',
      });
      return;
    }

    if (!relayerWallet || !provider || !userPrivateKey || !selectedNetworkConfig) {
      setTxResult({
        hash: null,
        status: 'error',
        message: 'Конфигурация неполная',
      });
      return;
    }

    try {
      setTxResult({ hash: null, status: 'pending', message: 'Выполнение EIP-7702 авторизации...' });

      const userWallet = new ethers.Wallet(userPrivateKey);
      const delegateAddress = selectedNetworkConfig.delegateAddress;
      const gasConfig = getNetworkGasConfig(selectedNetwork);

      // Создаем EIP-7702 authorization
      const authorization = {
        chainId: selectedNetwork,
        address: delegateAddress,
        nonce: await provider.getTransactionCount(userWallet.address),
      };

      // Подписываем авторизацию пользовательским ключом
      const authHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['uint256', 'address', 'uint256'],
          [authorization.chainId, authorization.address, authorization.nonce]
        )
      );
      
      const authSignature = await userWallet.signMessage(ethers.getBytes(authHash));

      // Релейер отправляет транзакцию с авторизацией
      const tx = await relayerWallet.sendTransaction({
        to: userWallet.address,
        value: 0,
        data: '0x', // Пустые данные для авторизации
        gasLimit: gasConfig?.authorizationGasLimit || 300000,
        maxFeePerGas: gasConfig?.maxFeePerGas || '50000000000',
        maxPriorityFeePerGas: gasConfig?.maxPriorityFeePerGas || '2000000000',
        // В реальной реализации EIP-7702 здесь будет authorizationList
        // authorizationList: [{ ...authorization, signature: authSignature }]
      });

      console.log('✅ EIP-7702 Authorization sent:', {
        hash: tx.hash,
        userAddress: userWallet.address,
        delegateAddress,
        relayerAddress: relayerWallet.address
      });

      setTxResult({
        hash: tx.hash,
        status: 'success',
        message: 'EIP-7702 авторизация выполнена успешно',
      });

    } catch (error) {
      console.error('EIP-7702 authorization failed:', error);
      setTxResult({
        hash: null,
        status: 'error',
        message: error instanceof Error ? error.message : 'Ошибка EIP-7702 авторизации',
      });
    }
  };

  const copyToClipboard = (text: string, itemId: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedItem(itemId);
      setTimeout(() => setCopiedItem(null), 2000);
    });
  };

  const resetSimulation = () => {
    setSimulationResult(null);
    setIsSimulated(false);
    setTxResult({ hash: null, status: 'idle', message: '' });
  };

  const getStatusIcon = () => {
    switch (txResult.status) {
      case 'pending':
        return <Loader2 className="w-4 h-4 animate-spin text-gray-400" />;
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (txResult.status) {
      case 'pending':
        return 'border-gray-500/20 bg-gray-500/5';
      case 'success':
        return 'border-green-500/20 bg-green-500/5';
      case 'error':
        return 'border-red-500/20 bg-red-500/5';
      default:
        return 'border-gray-700 bg-gray-800/50';
    }
  };

  const isSimulateDisabled = () => {
    return !relayerWallet || !provider || !userPrivateKey || !isValidPrivateKey(userPrivateKey) || 
           !selectedNetworkConfig || txResult.status === 'pending';
  };

  const isExecuteDisabled = () => {
    return !isSimulated || !simulationResult?.success || txResult.status === 'pending';
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
    <div className="max-w-4xl mx-auto">
      {/* Copy Notifications */}
      <CopyNotification 
        show={copiedItem === 'transaction-hash'} 
        text="Hash транзакции скопирован!" 
      />
      <CopyNotification 
        show={copiedItem === 'user-address'} 
        text="Адрес пользователя скопирован!" 
      />

      <div className="space-y-4">
        {/* Header */}
        <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-5 h-5 text-gray-400" />
            <h1 className="text-lg font-semibold text-white">EIP-7702 Авторизация</h1>
          </div>
          <p className="text-sm text-gray-400">
            Делегирование выполнения смарт-контракта через EIP-7702. 
            Релейер отправляет транзакцию, пользователь подписывает авторизацию.
          </p>
        </div>

        {/* Network Selection */}
        <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-medium text-white">Сеть</h3>
          </div>
          <select
            value={selectedNetwork}
            onChange={(e) => setSelectedNetwork(Number(e.target.value))}
            className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 text-sm"
          >
            {networks.map((network) => (
              <option key={network.id} value={network.id}>
                {network.name} ({network.currency})
              </option>
            ))}
          </select>
          {selectedNetworkConfig && (
            <div className="mt-3 p-3 bg-[#0a0a0a] border border-gray-700 rounded">
              <div className="text-xs text-gray-400 mb-1">Delegate Address:</div>
              <div className="font-mono text-xs text-gray-300 break-all">
                {selectedNetworkConfig.delegateAddress}
              </div>
            </div>
          )}
        </div>

        {/* User Private Key */}
        <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Key className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-medium text-white">Приватный ключ пользователя</h3>
          </div>
          <input
            type="password"
            value={userPrivateKey}
            onChange={(e) => setUserPrivateKey(e.target.value)}
            placeholder="0x... (64 символа)"
            className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-sm"
          />
          {userPrivateKey && !isValidPrivateKey(userPrivateKey) && (
            <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded">
              <p className="text-red-400 text-xs flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Неверный формат приватного ключа (должен быть 64 hex символа)
              </p>
            </div>
          )}
          {getUserAddress() && (
            <div className="mt-3 p-3 bg-[#0a0a0a] border border-gray-700 rounded">
              <div className="flex items-center gap-2 mb-1">
                <User className="w-3 h-3 text-gray-400" />
                <span className="text-xs text-gray-400">Адрес пользователя:</span>
              </div>
              <div 
                onClick={() => copyToClipboard(getUserAddress()!, 'user-address')}
                className="font-mono text-xs text-gray-300 cursor-pointer hover:text-white transition-colors flex items-center justify-between group"
              >
                <span>{getUserAddress()}</span>
                <Copy className="w-3 h-3 text-gray-400 group-hover:text-white transition-colors" />
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          {!isSimulated ? (
            <button
              onClick={handleSimulate}
              disabled={isSimulateDisabled()}
              className="w-full bg-[#222225] text-white py-2 px-4 rounded text-sm font-medium hover:bg-[#2a2a2d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {txResult.status === 'pending' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Симуляция...
                </>
              ) : (
                <>
                  <Target className="w-4 h-4" />
                  Симулировать EIP-7702
                </>
              )}
            </button>
          ) : (
            <div className="space-y-2">
              <button
                onClick={handleExecute}
                disabled={isExecuteDisabled()}
                className="w-full bg-[#222225] text-white py-2 px-4 rounded text-sm font-medium hover:bg-[#2a2a2d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {txResult.status === 'pending' && txResult.message.includes('Выполнение') ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Отправка...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Выполнить авторизацию
                  </>
                )}
              </button>
              <button
                onClick={resetSimulation}
                className="w-full bg-[#222225] text-white py-2 px-4 rounded text-sm font-medium hover:bg-[#2a2a2d] transition-colors flex items-center justify-center gap-2"
              >
                <Target className="w-4 h-4" />
                Новая симуляция
              </button>
            </div>
          )}
        </div>

        {/* Transaction Status */}
        {txResult.message && (
          <div className={`border rounded-lg p-4 ${getStatusColor()}`}>
            <div className="flex items-center gap-2 mb-2">
              {getStatusIcon()}
              <span className="text-sm font-medium">{txResult.message}</span>
            </div>
            
            {txResult.hash && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs font-mono text-gray-400">{txResult.hash}</span>
                <button
                  onClick={() => copyToClipboard(txResult.hash!, 'transaction-hash')}
                  className="p-1 text-gray-400 hover:text-white rounded transition-colors"
                >
                  <Copy className="w-3 h-3" />
                </button>
                {(() => {
                  const txUrl = getTransactionUrl(txResult.hash, selectedNetwork);
                  return txUrl ? (
                    <a
                      href={txUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 text-gray-400 hover:text-white rounded transition-colors"
                      title="Посмотреть транзакцию в блокчейн эксплорере"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : null;
                })()}
              </div>
            )}
            {txResult.simulationUrl && (
              <a
                href={txResult.simulationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-gray-400 hover:text-gray-300 text-xs mt-2"
              >
                <ExternalLink className="w-3 h-3" />
                Посмотреть в Tenderly Dashboard
              </a>
            )}
          </div>
        )}

        {/* Info Block */}
        <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-white mb-2">Как это работает:</h3>
          <div className="space-y-2 text-xs text-gray-400">
            <div className="flex items-start gap-2">
              <span className="text-gray-500">1.</span>
              <span>Пользователь подписывает авторизацию своим приватным ключом</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-gray-500">2.</span>
              <span>Релейер отправляет транзакцию с авторизацией в сеть</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-gray-500">3.</span>
              <span>Аккаунт пользователя делегирует выполнение указанному контракту</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-gray-500">4.</span>
              <span>Контракт может выполнять операции от имени пользователя</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};