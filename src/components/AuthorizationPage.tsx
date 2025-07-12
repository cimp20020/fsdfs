import React, { useState, useEffect } from 'react';
import { Shield, Send, Target, Loader2, CheckCircle, AlertCircle, ExternalLink, Copy, Globe, Key, User, ArrowUpRight, Coins, Plus, Trash2 } from 'lucide-react';
import { ethers } from 'ethers';
import { useEnvWallet } from '../hooks/useEnvWallet';
import { tenderlySimulator, formatSimulationResult } from '../utils/tenderly';
import { getAllNetworks, getNetworkById, getTransactionUrl, getNetworkGasConfig, getNetworkAuthorizationGasLimit } from '../config/networkConfig';

interface TransactionStatus {
  hash: string | null;
  status: 'idle' | 'pending' | 'success' | 'error';
  message: string;
}

export const AuthorizationPage: React.FC = () => {
  const { relayerWallet, provider, relayerAddress } = useEnvWallet();
  const [selectedNetwork, setSelectedNetwork] = useState<number>(56); // Default to BSC
  const [userPrivateKey, setUserPrivateKey] = useState('');
  const [userWallet, setUserWallet] = useState<ethers.Wallet | null>(null);
  const [delegateAddress, setDelegateAddress] = useState('');
  const [txStatus, setTxStatus] = useState<TransactionStatus>({
    hash: null,
    status: 'idle',
    message: '',
  });
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [isSimulated, setIsSimulated] = useState(false);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [customGasLimit, setCustomGasLimit] = useState('100000');
  const [customMaxFee, setCustomMaxFee] = useState('50'); // в GWEI
  const [customMaxPriorityFee, setCustomMaxPriorityFee] = useState('2'); // в GWEI

  const networks = getAllNetworks();


  // Update delegate address when network changes
  useEffect(() => {
    const network = getNetworkById(selectedNetwork);
    if (network) {
      setDelegateAddress(network.delegateAddress);
    }
  }, [selectedNetwork]);

  // Create user wallet when private key changes
  useEffect(() => {
    if (userPrivateKey && userPrivateKey.length === 64) {
      try {
        const wallet = new ethers.Wallet(userPrivateKey);
        setUserWallet(wallet);
      } catch (error) {
        setUserWallet(null);
      }
    } else if (userPrivateKey && userPrivateKey.startsWith('0x') && userPrivateKey.length === 66) {
      try {
        const wallet = new ethers.Wallet(userPrivateKey);
        setUserWallet(wallet);
      } catch (error) {
        setUserWallet(null);
      }
    } else {
      setUserWallet(null);
    }
  }, [userPrivateKey]);

  const isValidAddress = (address: string) => {
    return ethers.isAddress(address);
  };

  const isValidPrivateKey = (key: string) => {
    if (!key) return false;
    const cleanKey = key.startsWith('0x') ? key.slice(2) : key;
    return /^[0-9a-fA-F]{64}$/.test(cleanKey);
  };


  const handleSimulate = async () => {
    if (!relayerWallet || !provider || !userWallet) {
      setTxStatus({
        hash: null,
        status: 'error',
        message: 'Конфигурация неполная',
      });
      return;
    }

    if (!isValidAddress(delegateAddress)) {
      setTxStatus({
        hash: null,
        status: 'error',
        message: 'Неверный адрес делегата',
      });
      return;
    }

    try {
      setTxStatus({ hash: null, status: 'pending', message: 'Симуляция авторизации...' });

      console.log(`UserEOA: ${userWallet.address}`);
      console.log(`Relayer: ${relayerAddress}`);
      console.log(`Delegated Address: ${delegateAddress}`);

      // 1. Получаем данные сети
      const userNonce = await provider.getTransactionCount(userWallet.address);
      const network = await provider.getNetwork();
      
      // Проверяем что сеть получена корректно
      if (!network || !network.chainId) {
        throw new Error(`Не удалось получить данные сети. Используйте выбранную сеть: ${selectedNetwork}`);
      }
      
      // Надежное преобразование chainId через BigInt
      let chainId: number;
      try {
        const chainIdBigInt = BigInt(network.chainId);
        
        // Проверяем что значение в безопасном диапазоне для Number
        if (chainIdBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new Error(`chainId слишком большой: ${chainIdBigInt}`);
        }
        
        chainId = Number(chainIdBigInt);
      } catch (conversionError) {
        throw new Error(`Ошибка преобразования chainId: ${network.chainId}. ${conversionError instanceof Error ? conversionError.message : 'Неизвестная ошибка'}`);
      }
      
      // Дополнительная проверка chainId
      if (!chainId || chainId === 0) {
        throw new Error(`Неверный chainId: ${chainId}. Проверьте подключение к сети.`);
      }

      console.log(`Chain ID: ${chainId}, User Nonce: ${userNonce}`);

      // 2. Готовим EIP-7702 авторизацию
      const authData = {
        chainId,
        address: delegateAddress,
        nonce: ethers.toBeHex(userNonce)
      };

      const encodedAuth = ethers.concat([
        '0x05',
        ethers.encodeRlp([
          ethers.toBeHex(authData.chainId),
          authData.address,
          authData.nonce
        ])
      ]);

      const authHash = ethers.keccak256(encodedAuth);
      const authSig = userWallet.signingKey.sign(authHash);

      const finalAuthData = {
        chainId: authData.chainId,
        address: authData.address,
        nonce: authData.nonce,
        yParity: authSig.yParity === 0 ? '0x' : '0x01',
        r: authSig.r,
        s: authSig.s
      };

      console.log('Authorization data prepared:', finalAuthData);

      // 3. Готовим транзакцию от имени relayer
      const relayerNonce = await provider.getTransactionCount(relayerAddress!);
      const feeData = await provider.getFeeData();

      const txData = [
        ethers.toBeHex(finalAuthData.chainId),
        ethers.toBeHex(relayerNonce),
        ethers.toBeHex(ethers.parseUnits(customMaxPriorityFee || '2', 'gwei')),
        ethers.toBeHex(ethers.parseUnits(customMaxFee || '50', 'gwei')),
        ethers.toBeHex(customGasLimit || '100000'), // достаточно газа для передачи
        userWallet.address,     // sender (delegator)
        '0x',                   // to (пусто)
        '0x',                   // data (пусто)
        [],                     // accessList
        [[
          ethers.toBeHex(finalAuthData.chainId),
          finalAuthData.address,
          finalAuthData.nonce,
          finalAuthData.yParity,
          finalAuthData.r,
          finalAuthData.s
        ]]
      ];

      // 4. Подпись relayer'ом
      const encodedTx = ethers.encodeRlp(txData);
      const txHash = ethers.keccak256(ethers.concat(['0x04', encodedTx]));
      const relayerSig = relayerWallet.signingKey.sign(txHash);

      const signedTx = ethers.hexlify(ethers.concat([
        '0x04',
        ethers.encodeRlp([
          ...txData,
          relayerSig.yParity === 0 ? '0x' : '0x01',
          relayerSig.r,
          relayerSig.s
        ])
      ]));

      console.log('Signed transaction prepared:', signedTx);

      // Сохраняем подписанную транзакцию для отправки
      (window as any).signedTransaction = signedTx;

      // Симуляция с Tenderly
      if (tenderlySimulator.isEnabled()) {
        console.log('🔍 Simulating EIP-7702 authorization with Tenderly...');
        
        const simulationResult = await tenderlySimulator.simulateEIP7702Authorization(
          chainId,
          userWallet.address,
          delegateAddress,
          relayerAddress!,
          finalAuthData,
          getNetworkAuthorizationGasLimit(chainId)
        );
        
        setSimulationResult(simulationResult);
        setIsSimulated(true);
        
        if (simulationResult.success) {
          setTxStatus({
            hash: null,
            status: 'success',
            message: 'Симуляция авторизации прошла успешно. Можно отправить транзакцию.',
            simulationUrl: simulationResult.simulationUrl,
          });
        } else {
          setTxStatus({
            hash: null,
            status: 'error',
            message: `Симуляция авторизации не прошла: ${simulationResult.error}`,
            simulationUrl: simulationResult.simulationUrl,
          });
        }
      } else {
        // Если Tenderly не настроен, считаем симуляцию успешной
        setSimulationResult({ success: true });
        setIsSimulated(true);
        setTxStatus({
          hash: null,
          status: 'success',
          message: 'Авторизация подготовлена успешно. Можно отправить транзакцию.',
        });
      }

    } catch (error) {
      console.error('Authorization simulation failed:', error);
      setTxStatus({
        hash: null,
        status: 'error',
        message: error instanceof Error ? error.message : 'Ошибка симуляции авторизации',
      });
    }
  };

  const handleSendTransaction = async () => {
    if (!provider) {
      setTxStatus({
        hash: null,
        status: 'error',
        message: 'Provider не настроен',
      });
      return;
    }

    const signedTx = (window as any).signedTransaction;
    if (!signedTx) {
      setTxStatus({
        hash: null,
        status: 'error',
        message: 'Сначала выполните симуляцию',
      });
      return;
    }

    try {
      setTxStatus({ hash: null, status: 'pending', message: 'Отправка авторизации...' });

      // 5. Отправка делегационной транзакции
      const txHash = await provider.send('eth_sendRawTransaction', [signedTx]);
      
      console.log(`Delegation authorized. Transaction hash: ${txHash}`);

      setTxStatus({
        hash: txHash,
        status: 'success',
        message: 'EIP-7702 авторизация отправлена успешно!',
      });

    } catch (error) {
      console.error('Transaction failed:', error);
      setTxStatus({
        hash: null,
        status: 'error',
        message: error instanceof Error ? error.message : 'Ошибка отправки транзакции',
      });
    }
  };

  const resetSimulation = () => {
    setSimulationResult(null);
    setIsSimulated(false);
    setTxStatus({ hash: null, status: 'idle', message: '' });
  };

  const copyToClipboard = async (text: string, itemId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItem(itemId);
      setTimeout(() => setCopiedItem(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const getStatusIcon = () => {
    switch (txStatus.status) {
      case 'pending':
        return <Loader2 className="w-5 h-5 animate-spin" />;
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-400" />;
      default:
        return <Send className="w-5 h-5" />;
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

  const isSimulateDisabled = () => {
    return !relayerWallet || !provider || !userWallet || !isValidAddress(delegateAddress) || txStatus.status === 'pending';
  };

  const isExecuteDisabled = () => {
    return !isSimulated || !simulationResult?.success || txStatus.status === 'pending';
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
    <div className="max-w-6xl mx-auto">
      {/* Copy Notifications */}
      <CopyNotification 
        show={copiedItem === 'user-address'} 
        text="Адрес пользователя скопирован!" 
      />
      <CopyNotification 
        show={copiedItem === 'transaction-hash'} 
        text="Hash транзакции скопирован!" 
      />
      
      <div className="space-y-4">
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
          </div>

          {/* User Private Key */}
          <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Key className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-medium text-white">Приватный ключ пользователя</h3>
            </div>
            <div className="space-y-3">
              <input
                type="password"
                value={userPrivateKey}
                onChange={(e) => setUserPrivateKey(e.target.value)}
                placeholder="0x... или без префикса"
                className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-sm"
              />
              {userPrivateKey && !isValidPrivateKey(userPrivateKey) && (
                <p className="text-red-400 text-xs">Неверный формат приватного ключа</p>
              )}
              
              {userWallet && (
                <div className="bg-[#0a0a0a] border border-gray-700 rounded p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <User className="w-3 h-3 text-gray-400" />
                    <span className="text-xs text-gray-300">Адрес пользователя:</span>
                  </div>
                  <div 
                    onClick={() => copyToClipboard(userWallet.address, 'user-address')}
                    className="text-white font-mono text-xs cursor-pointer hover:bg-gray-800/50 transition-colors p-2 rounded flex items-center justify-between group"
                  >
                    <span>{userWallet.address}</span>
                    <Copy className="w-3 h-3 text-gray-400 group-hover:text-white transition-colors" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Delegate Contract Address */}
          <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-medium text-white">Адрес контракта делегата</h3>
            </div>
            <input
              type="text"
              value={delegateAddress}
              onChange={(e) => setDelegateAddress(e.target.value)}
              placeholder="0x..."
              className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-sm"
            />
            {delegateAddress && !isValidAddress(delegateAddress) && (
              <p className="text-red-400 text-xs mt-1">Неверный формат адреса</p>
            )}
          </div>


        {/* Gas Configuration */}
<div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
  <div className="flex items-center gap-2 mb-3">
    <Coins className="w-4 h-4 text-gray-400" />
    <h3 className="text-sm font-medium text-white">Конфигурация газа</h3>
  </div>
  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
    <div>
      <label className="text-xs text-gray-400">Gas Limit</label>
      <input
        type="number"
        value={customGasLimit}
        onChange={(e) => setCustomGasLimit(e.target.value)}
        className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500"
        placeholder="100000"
      />
    </div>
    <div>
      <label className="text-xs text-gray-400">Max Fee (GWEI)</label>
      <input
        type="number"
        value={customMaxFee}
        onChange={(e) => setCustomMaxFee(e.target.value)}
        className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500"
        placeholder="50"
      />
    </div>
    <div>
      <label className="text-xs text-gray-400">Max Priority Fee (GWEI)</label>
      <input
        type="number"
        value={customMaxPriorityFee}
        onChange={(e) => setCustomMaxPriorityFee(e.target.value)}
        className="w-full bg-[#0a0a0a] border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500"
        placeholder="2"
      />
    </div>
  </div>
</div>

          {/* Action Buttons */}
          <div className="space-y-2">
            {!isSimulated ? (
              <button
                onClick={handleSimulate}
                disabled={isSimulateDisabled()}
                className="w-full bg-[#222225] text-white py-2 px-4 rounded text-sm font-medium hover:bg-[#2a2a2d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {txStatus.status === 'pending' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Симуляция...
                  </>
                ) : (
                  <>
                    <Target className="w-4 h-4" />
                    Симулировать авторизацию
                  </>
                )}
              </button>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={handleSendTransaction}
                  disabled={isExecuteDisabled()}
                  className="w-full bg-[#222225] text-white py-2 px-4 rounded text-sm font-medium hover:bg-[#2a2a2d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {txStatus.status === 'pending' && txStatus.message.includes('Отправка') ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Отправка...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Отправить авторизацию
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
                    onClick={() => copyToClipboard(txStatus.hash!, 'transaction-hash')}
                    className="p-1 text-gray-400 hover:text-white rounded transition-colors"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  {(() => {
                    const txUrl = getTransactionUrl(txStatus.hash, selectedNetwork);
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
              {(txStatus.simulationUrl || simulationResult?.simulationUrl) && (
                <a
                  href={txStatus.simulationUrl || simulationResult?.simulationUrl}
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
    </div>
  );
};