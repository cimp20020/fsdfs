import React, { useState, useEffect } from 'react';
import { Shield, Send, Target, Loader2, CheckCircle, AlertCircle, ExternalLink, Copy, Globe, Key, User } from 'lucide-react';
import { ethers } from 'ethers';
import { useEnvWallet } from '../hooks/useEnvWallet';
import { tenderlySimulator } from '../utils/tenderly';
import { getAllNetworks, getNetworkById, getTransactionUrl } from '../config/networkConfig';

interface TransactionStatus {
  hash: string | null;
  status: 'idle' | 'pending' | 'success' | 'error';
  message: string;
  simulationUrl?: string;
}

interface AuthorizationData {
  chainId: number;
  address: string;
  nonce: string;
  yParity: string;
  r: string;
  s: string;
}

interface AuthorizationDetails {
  userAddress: string;
  delegateAddress: string;
  userNonce: number;
  chainId: number;
  encodedAuth: string;
  authHash: string;
  signature: {
    r: string;
    s: string;
    yParity: number;
  };
  authData: AuthorizationData;
  signedTransaction: string;
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
  const [authorizationDetails, setAuthorizationDetails] = useState<AuthorizationDetails | null>(null);
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

  const handlePrepareAuthorization = async () => {
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

      console.log(`UserEOA: ${userWallet.address}`);
      console.log(`Relayer: ${relayerAddress}`);
      console.log(`Delegated Address: ${delegateAddress}`);

      // 1. Получаем данные сети
      const userNonce = await provider.getTransactionCount(userWallet.address);
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);

      console.log(`Chain ID: ${chainId}, User Nonce: ${userNonce}`);

      // 2. Готовим EIP-7702 авторизацию (точно как в примере)
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

      const finalAuthData: AuthorizationData = {
        chainId: authData.chainId,
        address: authData.address,
        nonce: authData.nonce,
        yParity: authSig.yParity === 0 ? '0x' : '0x01',
        r: authSig.r,
        s: authSig.s
      };

      console.log('Authorization data prepared:', finalAuthData);

      // 3. Готовим пустую транзакцию от имени relayer
      const relayerNonce = await provider.getTransactionCount(relayerAddress!);
      const feeData = await provider.getFeeData();

      const txData = [
        ethers.toBeHex(finalAuthData.chainId),
        ethers.toBeHex(relayerNonce),
        ethers.toBeHex(feeData.maxPriorityFeePerGas || ethers.parseUnits('2', 'gwei')),
        ethers.toBeHex(feeData.maxFeePerGas || ethers.parseUnits('50', 'gwei')),
        ethers.toBeHex(100000), // достаточно газа для передачи
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

      // Сохраняем детали для отображения
      setAuthorizationDetails({
        userAddress: userWallet.address,
        delegateAddress: delegateAddress,
        userNonce: userNonce,
        chainId: chainId,
        encodedAuth: ethers.hexlify(encodedAuth),
        authHash: authHash,
        signature: {
          r: authSig.r,
          s: authSig.s,
          yParity: authSig.yParity
        },
        authData: finalAuthData,
        signedTransaction: signedTx
      });

      // Сохраняем подписанную транзакцию для отправки
      (window as any).signedTransaction = signedTx;

      setTxStatus({
        hash: null,
        status: 'success',
        message: 'Авторизация подготовлена успешно. Можно отправить транзакцию.',
      });

    } catch (error) {
      console.error('Authorization preparation failed:', error);
      setTxStatus({
        hash: null,
        status: 'error',
        message: error instanceof Error ? error.message : 'Ошибка подготовки авторизации',
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
        message: 'Сначала подготовьте авторизацию',
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

  const isPrepareDisabled = () => {
    return !relayerWallet || !provider || !userWallet || !isValidAddress(delegateAddress) || txStatus.status === 'pending';
  };

  const isSendDisabled = () => {
    return !authorizationDetails || txStatus.status === 'pending';
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
      <CopyNotification 
        show={copiedItem === 'signed-tx'} 
        text="Подписанная транзакция скопирована!" 
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

      {/* Action Buttons */}
      <div className="space-y-3">
        <button
          onClick={handlePrepareAuthorization}
          disabled={isPrepareDisabled()}
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
          onClick={handleSendTransaction}
          disabled={isSendDisabled()}
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
              Отправить авторизацию
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
        </div>
      )}

      {/* Authorization Details */}
      {authorizationDetails && (
        <div className="bg-[#111111] border border-gray-800 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <h3 className="text-lg font-semibold text-white">Детали авторизации</h3>
          </div>
          
          <div className="space-y-4 text-sm">
            {/* Basic Info */}
            <div className="bg-[#0a0a0a] border border-gray-700 rounded-lg p-4">
              <h4 className="text-white font-medium mb-2">Основная информация:</h4>
              <div className="space-y-1 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">User Address:</span>
                  <span className="text-white break-all">{authorizationDetails.userAddress}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Delegate Address:</span>
                  <span className="text-white break-all">{authorizationDetails.delegateAddress}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Chain ID:</span>
                  <span className="text-white">{authorizationDetails.chainId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">User Nonce:</span>
                  <span className="text-white">{authorizationDetails.userNonce}</span>
                </div>
              </div>
            </div>

            {/* Encoded Authorization */}
            <div className="bg-[#0a0a0a] border border-gray-700 rounded-lg p-4">
              <h4 className="text-white font-medium mb-2">Закодированная авторизация:</h4>
              <div className="font-mono text-xs text-white break-all bg-gray-900 p-2 rounded">
                {authorizationDetails.encodedAuth}
              </div>
            </div>

            {/* Authorization Hash */}
            <div className="bg-[#0a0a0a] border border-gray-700 rounded-lg p-4">
              <h4 className="text-white font-medium mb-2">Хеш авторизации:</h4>
              <div className="font-mono text-xs text-white break-all bg-gray-900 p-2 rounded">
                {authorizationDetails.authHash}
              </div>
            </div>

            {/* Signature */}
            <div className="bg-[#0a0a0a] border border-gray-700 rounded-lg p-4">
              <h4 className="text-white font-medium mb-2">Подпись:</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-gray-400">r:</span>
                  <div className="font-mono text-white break-all">{authorizationDetails.signature.r}</div>
                </div>
                <div>
                  <span className="text-gray-400">s:</span>
                  <div className="font-mono text-white break-all">{authorizationDetails.signature.s}</div>
                </div>
                <div>
                  <span className="text-gray-400">yParity:</span>
                  <div className="font-mono text-white">{authorizationDetails.signature.yParity}</div>
                </div>
              </div>
            </div>

            {/* Final Authorization Data */}
            <div className="bg-[#0a0a0a] border border-gray-700 rounded-lg p-4">
              <h4 className="text-white font-medium mb-2">Финальные данные авторизации:</h4>
              <pre className="font-mono text-xs text-white bg-gray-900 p-2 rounded overflow-x-auto">
{JSON.stringify(authorizationDetails.authData, null, 2)}
              </pre>
            </div>

            {/* Signed Transaction */}
            <div className="bg-[#0a0a0a] border border-gray-700 rounded-lg p-4">
              <h4 className="text-white font-medium mb-2">Подписанная транзакция:</h4>
              <div className="font-mono text-xs text-white break-all bg-gray-900 p-2 rounded max-h-32 overflow-y-auto">
                {authorizationDetails.signedTransaction}
              </div>
              <button
                onClick={() => copyToClipboard(authorizationDetails.signedTransaction, 'signed-tx')}
                className="mt-2 px-3 py-1 bg-[#222225] text-white rounded text-xs hover:bg-[#2a2a2d] transition-colors flex items-center gap-1"
              >
                <Copy className="w-3 h-3" />
                Копировать транзакцию
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};