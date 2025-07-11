import React, { useState, useEffect } from 'react';
import { Shield, Send, Target, Loader2, CheckCircle, AlertCircle, ExternalLink, Copy, Globe, Key, User } from 'lucide-react';
import { ethers } from 'ethers';
import { useEnvWallet } from '../hooks/useEnvWallet';
import { tenderlySimulator } from '../utils/tenderly';
import { getAllNetworks, getNetworkById, getTransactionUrl, getNetworkGasConfig } from '../config/networkConfig';

interface TransactionStatus {
  hash: string | null;
  status: 'idle' | 'pending' | 'success' | 'error';
  message: string;
  simulationUrl?: string;
}

export const AuthorizationPage: React.FC = () => {
  const { relayerWallet, provider, relayerAddress } = useEnvWallet();
  const [selectedNetwork, setSelectedNetwork] = useState<number>(56); // Default to BSC
  const [userPrivateKey, setUserPrivateKey] = useState('');
  const [userWallet, setUserWallet] = useState<ethers.Wallet | null>(null);
  const [delegateAddress, setDelegateAddress] = useState('');
  const [gasLimit, setGasLimit] = useState('100000');
  const [txStatus, setTxStatus] = useState<TransactionStatus>({
    hash: null,
    status: 'idle',
    message: '',
  });
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

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
      setTxStatus({ hash: null, status: 'pending', message: 'Подготовка авторизации...' });

      const network = getNetworkById(selectedNetwork);
      if (!network) {
        throw new Error('Сеть не найдена');
      }

      // Get user nonce
      const userNonce = await provider.getTransactionCount(userWallet.address);
      const chainId = selectedNetwork;

      setTxStatus({ hash: null, status: 'pending', message: 'Создание подписи авторизации...' });

      // Create EIP-7702 authorization data
      const authData = {
        chainId: ethers.toBeHex(chainId),
        address: delegateAddress.toLowerCase(),
        nonce: ethers.toBeHex(userNonce),
      };

      // Create authorization signature with proper RLP encoding
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

      const authorization = {
        ...authData,
        yParity: signature.yParity === 0 ? '0x00' : '0x01',
        r: signature.r,
        s: signature.s,
      };

      setTxStatus({ hash: null, status: 'pending', message: 'Симуляция транзакции...' });

      // Simulate with Tenderly if available
      if (tenderlySimulator.isEnabled()) {
        const simulationResult = await tenderlySimulator.simulateEIP7702Authorization(
          chainId,
          userWallet.address,
          delegateAddress,
          relayerAddress!,
          authorization,
          parseInt(gasLimit)
        );
        
        if (simulationResult.success) {
          setTxStatus({
            hash: null,
            status: 'success',
            message: 'Симуляция прошла успешно. Можно отправить авторизацию.',
            simulationUrl: simulationResult.simulationUrl,
          });
        } else {
          setTxStatus({
            hash: null,
            status: 'error',
            message: `Симуляция не прошла: ${simulationResult.error}`,
            simulationUrl: simulationResult.simulationUrl,
          });
        }
      } else {
        setTxStatus({
          hash: null,
          status: 'success',
          message: 'Авторизация подготовлена. Можно отправить транзакцию.',
        });
      }

      // Store authorization for execution
      (window as any).pendingAuthorization = authorization;

    } catch (error) {
      console.error('Authorization preparation failed:', error);
      setTxStatus({
        hash: null,
        status: 'error',
        message: error instanceof Error ? error.message : 'Ошибка подготовки авторизации',
      });
    }
  };

  const handleExecute = async () => {
    if (!relayerWallet || !provider || !userWallet) {
      setTxStatus({
        hash: null,
        status: 'error',
        message: 'Конфигурация неполная',
      });
      return;
    }

    const authorization = (window as any).pendingAuthorization;
    if (!authorization) {
      setTxStatus({
        hash: null,
        status: 'error',
        message: 'Сначала выполните симуляцию',
      });
      return;
    }

    try {
      setTxStatus({ hash: null, status: 'pending', message: 'Отправка авторизации...' });

      const network = getNetworkById(selectedNetwork);
      if (!network) {
        throw new Error('Сеть не найдена');
      }

      // Get current gas prices
      const feeData = await provider.getFeeData();
      const relayerNonce = await provider.getTransactionCount(relayerAddress!);

      // Try to send EIP-7702 transaction (type 4)
      try {
        const eip7702Tx = {
          type: 4, // EIP-7702 transaction type
          chainId: selectedNetwork,
          nonce: relayerNonce,
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits('2', 'gwei'),
          maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits('50', 'gwei'),
          gasLimit: parseInt(gasLimit),
          to: userWallet.address,
          value: 0,
          data: '0x',
          accessList: [],
          authorizationList: [authorization],
        };

        console.log('Sending EIP-7702 transaction:', eip7702Tx);
        
        // This will likely fail as EIP-7702 is not yet implemented
        const tx = await relayerWallet.sendTransaction(eip7702Tx);
        
        setTxStatus({
          hash: tx.hash,
          status: 'success',
          message: 'EIP-7702 авторизация отправлена успешно!',
        });

      } catch (eip7702Error) {
        console.log('EIP-7702 not supported, falling back to regular transaction');
        
        // Fallback: send a regular transaction to demonstrate the concept
        const fallbackTx = await relayerWallet.sendTransaction({
          to: userWallet.address,
          value: 0,
          data: ethers.concat([
            '0x', // Empty data
            ethers.toUtf8Bytes(`EIP-7702 Authorization: ${delegateAddress}`)
          ]),
          gasLimit: parseInt(gasLimit),
        });

        setTxStatus({
          hash: fallbackTx.hash,
          status: 'success',
          message: 'Авторизация отправлена (демо режим - EIP-7702 еще не поддерживается)',
        });
      }

    } catch (error) {
      console.error('Authorization execution failed:', error);
      setTxStatus({
        hash: null,
        status: 'error',
        message: error instanceof Error ? error.message : 'Ошибка выполнения авторизации',
      });
    }
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
        return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
      case 'success':
        return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'error':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      default:
        return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  const isSimulateDisabled = () => {
    return !relayerWallet || !provider || !userWallet || !isValidAddress(delegateAddress) || txStatus.status === 'pending';
  };

  const isExecuteDisabled = () => {
    return !relayerWallet || !provider || !userWallet || txStatus.status !== 'success' || txStatus.status === 'pending';
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
        show={copiedItem === 'user-address'} 
        text="Адрес пользователя скопирован!" 
      />
      <CopyNotification 
        show={copiedItem === 'transaction-hash'} 
        text="Hash транзакции скопирован!" 
      />

      {/* Network Selection */}
      <div className="bg-[#111111] border border-gray-800 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-5 h-5 text-gray-400" />
          <h3 className="text-lg font-semibold text-white">Выбор сети</h3>
        </div>
        <select
          value={selectedNetwork}
          onChange={(e) => setSelectedNetwork(Number(e.target.value))}
          className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent"
        >
          {networks.map((network) => (
            <option key={network.id} value={network.id}>
              {network.name} (Chain ID: {network.id})
            </option>
          ))}
        </select>
      </div>

      {/* User Private Key */}
      <div className="bg-[#111111] border border-gray-800 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Key className="w-5 h-5 text-gray-400" />
          <h3 className="text-lg font-semibold text-white">Приватный ключ пользователя</h3>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Приватный ключ (64 hex символа)
            </label>
            <input
              type="password"
              value={userPrivateKey}
              onChange={(e) => setUserPrivateKey(e.target.value)}
              placeholder="0x... или без префикса"
              className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent font-mono"
            />
            {userPrivateKey && !isValidPrivateKey(userPrivateKey) && (
              <p className="text-red-400 text-sm mt-1">Неверный формат приватного ключа</p>
            )}
          </div>
          
          {userWallet && (
            <div className="bg-[#0a0a0a] border border-gray-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <User className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-300">Адрес пользователя:</span>
              </div>
              <div 
                onClick={() => copyToClipboard(userWallet.address, 'user-address')}
                className="text-white font-mono text-sm cursor-pointer hover:bg-gray-800/50 transition-colors p-2 rounded flex items-center justify-between group"
              >
                <span>{userWallet.address}</span>
                <Copy className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delegate Contract Address */}
      <div className="bg-[#111111] border border-gray-800 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-gray-400" />
          <h3 className="text-lg font-semibold text-white">Адрес контракта делегата</h3>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Delegate Contract Address (автоматически из конфигурации)
          </label>
          <input
            type="text"
            value={delegateAddress}
            onChange={(e) => setDelegateAddress(e.target.value)}
            placeholder="0x..."
            className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent font-mono"
          />
          {delegateAddress && !isValidAddress(delegateAddress) && (
            <p className="text-red-400 text-sm mt-1">Неверный формат адреса</p>
          )}
        </div>
      </div>

      {/* Gas Settings */}
      <div className="bg-[#111111] border border-gray-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Настройки газа</h3>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Gas Limit
          </label>
          <input
            type="number"
            value={gasLimit}
            onChange={(e) => setGasLimit(e.target.value)}
            placeholder="100000"
            className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-3">
        <button
          onClick={handleSimulate}
          disabled={isSimulateDisabled()}
          className="w-full bg-gradient-to-r from-gray-600 to-gray-700 text-white py-3 px-6 rounded-lg font-medium hover:from-gray-700 hover:to-gray-800 transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
        >
          {txStatus.status === 'pending' && txStatus.message.includes('Подготовка') ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Подготовка...
            </>
          ) : (
            <>
              <Target className="w-5 h-5" />
              Подготовить авторизацию
            </>
          )}
        </button>

        <button
          onClick={handleExecute}
          disabled={isExecuteDisabled()}
          className="w-full bg-gradient-to-r from-gray-600 to-gray-700 text-white py-3 px-6 rounded-lg font-medium hover:from-gray-700 hover:to-gray-800 transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
        >
          {txStatus.status === 'pending' && txStatus.message.includes('Отправка') ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Отправка...
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              Выполнить авторизацию
            </>
          )}
        </button>
      </div>

      {/* Transaction Status */}
      {txStatus.message && (
        <div className={`p-4 rounded-lg border ${getStatusColor()}`}>
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <span className="text-sm font-medium">{txStatus.message}</span>
          </div>
          {txStatus.hash && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Transaction Hash:</span>
                <button
                  onClick={() => copyToClipboard(txStatus.hash!, 'transaction-hash')}
                  className="text-xs font-mono text-white hover:text-gray-300 transition-colors flex items-center gap-1"
                >
                  {txStatus.hash}
                  <Copy className="w-3 h-3" />
                </button>
              </div>
              {(() => {
                const txUrl = getTransactionUrl(txStatus.hash, selectedNetwork);
                return txUrl ? (
                  <a
                    href={txUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-gray-400 hover:text-white text-xs"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Посмотреть в блокчейн эксплорере
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
              className="inline-flex items-center gap-1 text-gray-400 hover:text-white text-xs mt-2"
            >
              <ExternalLink className="w-3 h-3" />
              Посмотреть симуляцию в Tenderly
            </a>
          )}
        </div>
      )}
    </div>
  );
};