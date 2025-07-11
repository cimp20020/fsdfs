import React, { useState } from 'react';
import { Send, Loader2, CheckCircle, AlertCircle, ExternalLink, Copy, Key, User, Zap, Globe, Plus } from 'lucide-react';
import { ethers } from 'ethers';
import { useEnvWallet } from '../hooks/useEnvWallet';
import { tenderlySimulator } from '../utils/tenderly';
import { getAllNetworks, getNetworkById, getNetworkDelegateAddress, getTransactionUrl } from '../config/networkConfig';

interface TransactionStatus {
  hash: string | null;
  status: 'idle' | 'pending' | 'success' | 'error';
  message: string;
  simulationUrl?: string;
}

interface AuthorizationFunction {
  id: string;
  name: string;
  description: string;
  params: {
    target?: string;
    value?: string;
    data?: string;
  };
}

export const AuthorizationPage: React.FC = () => {
  const { 
    userWallet, 
    relayerWallet, 
    provider, 
    userAddress, 
    relayerAddress, 
    userBalance,
    relayerBalance,
    chainId,
    updateUserPrivateKey, 
    currentUserPrivateKey,
    refreshBalances 
  } = useEnvWallet();
  
  const [privateKey, setPrivateKey] = useState(currentUserPrivateKey || '');
  const [delegateAddress, setDelegateAddress] = useState('');
  const [gasLimit, setGasLimit] = useState('40000');
  const [selectedNetwork, setSelectedNetwork] = useState<number>(chainId || 1);
  const [selectedFunction, setSelectedFunction] = useState<string>('authorization');
  const [functionTarget, setFunctionTarget] = useState('');
  const [functionValue, setFunctionValue] = useState('0');
  const [functionData, setFunctionData] = useState('');
  const [customFunctions, setCustomFunctions] = useState<AuthorizationFunction[]>([]);
  const [txStatus, setTxStatus] = useState<TransactionStatus>({
    hash: null,
    status: 'idle',
    message: '',
  });

  const networks = getAllNetworks();

  const isValidAddress = (address: string) => {
    return ethers.isAddress(address);
  };

  const isValidPrivateKey = (key: string): boolean => {
    try {
      const normalized = key.startsWith('0x') ? key : '0x' + key;
      return /^0x[a-fA-F0-9]{64}$/.test(normalized);
    } catch {
      return false;
    }
  };

  const handlePrivateKeyChange = (key: string) => {
    setPrivateKey(key);
    if (key.trim() === '') {
      updateUserPrivateKey('');
      // Auto-fill delegate address from network config
      const networkConfig = getNetworkById(selectedNetwork);
      if (networkConfig && !delegateAddress) {
        setDelegateAddress(networkConfig.delegateAddress);
      }
    } else if (isValidPrivateKey(key)) {
      const normalizedKey = key.startsWith('0x') ? key : '0x' + key;
      updateUserPrivateKey(normalizedKey);
    }
  };

  const addCustomFunction = () => {
    const newFunction: AuthorizationFunction = {
      id: Date.now().toString(),
      name: `Функция ${customFunctions.length + 1}`,
      description: 'Пользовательская функция',
      params: {
        target: '',
        value: '0',
        data: '0x'
      }
    };
    setCustomFunctions(prev => [...prev, newFunction]);
    setSelectedFunction(newFunction.id);
  };

  const updateCustomFunction = (id: string, field: string, value: string) => {
    setCustomFunctions(prev => prev.map(func => 
      func.id === id 
        ? { ...func, params: { ...func.params, [field]: value } }
        : func
    ));
  };

  const handleAuthorize = async () => {
    if (!provider || !userWallet || !relayerWallet) {
      setTxStatus({
        hash: null,
        status: 'error',
        message: 'Кошелек не настроен',
      });
      return;
    }

    if (selectedFunction === 'authorization' && !isValidAddress(delegateAddress)) {
      setTxStatus({
        hash: null,
        status: 'error',
        message: 'Неверный адрес делегата',
      });
      return;
    }

    try {
      setTxStatus({ hash: null, status: 'pending', message: 'Подготовка авторизации...' });

      const userNonce = await provider.getTransactionCount(userAddress!);
      const network = await provider.getNetwork();
      const currentChainId = Number(network.chainId);

      let authData;
      let targetAddress = delegateAddress;

      if (selectedFunction === 'authorization') {
        // Стандартная авторизация
        authData = {
          chainId: currentChainId,
          address: delegateAddress,
          nonce: ethers.toBeHex(userNonce),
        };
      } else {
        // Пользовательская функция
        const customFunc = customFunctions.find(f => f.id === selectedFunction);
        if (!customFunc || !isValidAddress(customFunc.params.target || '')) {
          setTxStatus({
            hash: null,
            status: 'error',
            message: 'Неверные параметры функции',
          });
          return;
        }

        targetAddress = customFunc.params.target!;
        authData = {
          chainId: currentChainId,
          address: targetAddress,
          nonce: ethers.toBeHex(userNonce),
          value: customFunc.params.value || '0',
          data: customFunc.params.data || '0x',
        };
      }

      setTxStatus({ hash: null, status: 'pending', message: 'Создание подписи авторизации...' });

      // Создание подписи авторизации
      const encodedAuth = ethers.concat([
        '0x05',
        ethers.encodeRlp([
          ethers.toBeHex(authData.chainId),
          authData.address,
          authData.nonce,
        ]),
      ]);

      const authHash = ethers.keccak256(encodedAuth);
      const authSig = await userWallet.signMessage(ethers.getBytes(authHash));
      const signature = ethers.Signature.from(authSig);

      const authWithSig = {
        ...authData,
        yParity: signature.yParity === 0 ? '0x' : '0x01',
        r: signature.r,
        s: signature.s,
      };

      // Симуляция с Tenderly если доступно
      let simulationResult = null;
      if (tenderlySimulator.isEnabled()) {
        setTxStatus({ hash: null, status: 'pending', message: 'Запуск симуляции...' });
        simulationResult = await tenderlySimulator.simulateEIP7702Authorization(
          currentChainId,
          userAddress!,
          targetAddress,
          relayerAddress!,
          authWithSig,
          parseInt(gasLimit)
        );
      }

      // Для демонстрации показываем данные авторизации
      const demoTxHash = 'demo-' + Date.now();
      setTxStatus({
        hash: demoTxHash,
        status: 'success',
        message: 'Авторизация успешно подготовлена',
        simulationUrl: simulationResult?.simulationUrl,
      });

      console.log('EIP-7702 Authorization Data:', {
        authData: authWithSig,
        simulation: simulationResult,
      });

    } catch (error) {
      console.error('Authorization failed:', error);
      setTxStatus({
        hash: null,
        status: 'error',
        message: error instanceof Error ? error.message : 'Ошибка авторизации',
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getStatusIcon = () => {
    switch (txStatus.status) {
      case 'pending':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-400" />;
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (txStatus.status) {
      case 'pending':
        return 'border-blue-500/20 bg-blue-500/5';
      case 'success':
        return 'border-green-500/20 bg-green-500/5';
      case 'error':
        return 'border-red-500/20 bg-red-500/5';
      default:
        return 'border-gray-700 bg-gray-800/50';
    }
  };

  const currentNetwork = getNetworkById(chainId || selectedNetwork);

  const isAuthorizeDisabled = () => {
    if (!userWallet || !isValidPrivateKey(privateKey) || txStatus.status === 'pending') {
      return true;
    }
    
    if (selectedFunction === 'authorization') {
      return !delegateAddress || !isValidAddress(delegateAddress);
    } else {
      const customFunc = customFunctions.find(f => f.id === selectedFunction);
      return !customFunc || !customFunc.params.target || !isValidAddress(customFunc.params.target);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid grid-cols-12 gap-6">
        {/* Main Content */}
        <div className="col-span-8 space-y-4">
          {/* Network Selection */}
          <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-medium text-white">Сеть</h3>
            </div>
            <select
              value={selectedNetwork}
              onChange={(e) => setSelectedNetwork(Number(e.target.value))}
              className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              {networks.map((network) => (
                <option key={network.id} value={network.id}>
                  {network.name} ({network.currency})
                </option>
              ))}
            </select>
          </div>

          {/* Private Key Input */}
          <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Key className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-medium text-white">Приватный ключ</h3>
            </div>
            <input
              type="password"
              value={privateKey}
              onChange={(e) => handlePrivateKeyChange(e.target.value)}
              placeholder="0x... или без префикса 0x"
              className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
            />
            {privateKey && !isValidPrivateKey(privateKey) && (
              <p className="text-red-400 text-xs mt-1">Неверный формат приватного ключа</p>
            )}
          </div>

          {/* Function Selection */}
          <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-white">Тип функции</h3>
              <button
                onClick={addCustomFunction}
                className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Добавить функцию
              </button>
            </div>
            
            <select
              value={selectedFunction}
              onChange={(e) => setSelectedFunction(e.target.value)}
              className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="authorization">Стандартная авторизация</option>
              {customFunctions.map((func) => (
                <option key={func.id} value={func.id}>
                  {func.name}
                </option>
              ))}
            </select>
          </div>

          {/* Function Parameters */}
          <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-white mb-4">Параметры</h3>
            
            {selectedFunction === 'authorization' ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">
                    Адрес контракта делегата
                  </label>
                  <input
                    type="text"
                    value={delegateAddress}
                    onChange={(e) => setDelegateAddress(e.target.value)}
                    placeholder={getNetworkById(selectedNetwork)?.delegateAddress || "0x..."}
                    className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                  />
                  {delegateAddress && !isValidAddress(delegateAddress) && (
                    <p className="text-red-400 text-xs mt-1">Неверный формат адреса</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">
                    Лимит газа
                  </label>
                  <input
                    type="number"
                    value={gasLimit}
                    onChange={(e) => setGasLimit(e.target.value)}
                    placeholder="40000"
                    className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
              </div>
            ) : (
              // Custom function parameters
              (() => {
                const customFunc = customFunctions.find(f => f.id === selectedFunction);
                if (!customFunc) return null;
                
                return (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-2">
                        Целевой адрес
                      </label>
                      <input
                        type="text"
                        value={customFunc.params.target || ''}
                        onChange={(e) => updateCustomFunction(customFunc.id, 'target', e.target.value)}
                        placeholder="0x..."
                        className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-2">
                        Значение (ETH)
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        value={customFunc.params.value || '0'}
                        onChange={(e) => updateCustomFunction(customFunc.id, 'value', e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-2">
                        Данные вызова
                      </label>
                      <textarea
                        value={customFunc.params.data || '0x'}
                        onChange={(e) => updateCustomFunction(customFunc.id, 'data', e.target.value)}
                        placeholder="0x..."
                        rows={2}
                        className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                      />
                    </div>
                  </div>
                );
              })()
            )}

            <button
              onClick={handleAuthorize}
              className="flex items-center gap-1 px-2 py-1 bg-[#222225] text-white rounded text-xs hover:bg-[#2a2a2d] transition-colors"
              className="w-full mt-4 bg-[#222225] text-white py-2 px-4 rounded text-sm font-medium hover:bg-[#2a2a2d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {txStatus.status === 'pending' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Обработка...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Авторизовать
                </>
              )}
            </button>
          </div>

          {/* Transaction Status */}
          {txStatus.message && (
            <div className={`border rounded-lg p-4 ${getStatusColor()}`}>
              <div className="flex items-center gap-2 mb-2">
                {getStatusIcon()}
                <span className="text-sm font-medium">{txStatus.message}</span>
              </div>
              {txStatus.hash && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs font-mono text-gray-400">{txStatus.hash}</span>
                  <button
                    onClick={() => copyToClipboard(txStatus.hash!)}
                    className="p-1 text-gray-400 hover:text-white rounded transition-colors"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  {(() => {
                    const txUrl = getTransactionUrl(txStatus.hash, chainId || selectedNetwork);
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
              {txStatus.simulationUrl && (
                <a
                  href={txStatus.simulationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 text-xs mt-2"
                >
                  <ExternalLink className="w-3 h-3" />
                  Посмотреть в Tenderly Dashboard
                </a>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="col-span-4 space-y-4">
          {/* Current Network */}
          <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4 text-green-400" />
              <h3 className="text-sm font-medium text-white">Текущая сеть</h3>
            </div>
            <div className="text-sm text-gray-300">
              {currentNetwork?.name || 'Неизвестно'} ({currentNetwork?.currency || 'ETH'})
            </div>
            <div className="text-xs text-gray-500 mt-1">Chain ID: {chainId || selectedNetwork}</div>
          </div>

          {/* User Wallet Status */}
          {userAddress && (
            <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-medium text-white">Кошелек пользователя</h3>
              </div>
              <div className="text-xs text-gray-400 font-mono mb-2">{userAddress}</div>
              {userBalance && (
                <div className="text-xs text-gray-300">
                  Баланс: {parseFloat(userBalance).toFixed(4)} {currentNetwork?.currency || 'ETH'}
                </div>
              )}
            </div>
          )}

          {/* Relayer Wallet Status */}
          {relayerAddress && (
            <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-medium text-white">Релейер</h3>
              </div>
              <div className="text-xs text-gray-400 font-mono mb-2">{relayerAddress}</div>
              {relayerBalance && (
                <div className="text-xs text-gray-300">
                  Баланс: {parseFloat(relayerBalance).toFixed(4)} {currentNetwork?.currency || 'ETH'}
                </div>
              )}
            </div>
          )}

          {/* Refresh Balances */}
          <button
            onClick={refreshBalances}
            className="w-full bg-[#222225] text-white py-2 px-4 rounded text-sm font-medium hover:bg-[#2a2a2d] transition-colors"
          >
            Обновить балансы
          </button>

          {/* Info */}
          <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-white mb-2">О EIP-7702</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              EIP-7702 позволяет EOA временно делегировать выполнение смарт-контрактам, сохраняя при этом владение.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};