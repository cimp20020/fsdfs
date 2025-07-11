import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { useEnvWallet } from '../hooks/useEnvWallet';
import { getNetworkById } from '../config/networkConfig';
import networks from '../config/networks.json';

interface AuthorizationType {
  id: string;
  name: string;
  description: string;
  icon: string;
}

const authorizationTypes: AuthorizationType[] = [
  {
    id: 'standard',
    name: 'Стандартная авторизация',
    description: 'Базовая EIP-7702 авторизация',
    icon: '🔑'
  },
  {
    id: 'sendETH',
    name: 'Отправить ETH',
    description: 'Авторизация с отправкой ETH',
    icon: '💸'
  },
  {
    id: 'sweepETH',
    name: 'Собрать ETH',
    description: 'Авторизация для сбора ETH',
    icon: '🔄'
  },
  {
    id: 'sweepTokens',
    name: 'Собрать токены',
    description: 'Авторизация для сбора токенов',
    icon: '🪙'
  },
  {
    id: 'executeCall',
    name: 'Выполнить вызов',
    description: 'Авторизация для произвольного вызова',
    icon: '🎯'
  },
  {
    id: 'multicall',
    name: 'Последовательность',
    description: 'Авторизация для множественных операций',
    icon: '📋'
  }
];

export const AuthorizationPage: React.FC = () => {
  const { chainId } = useEnvWallet();
  const [selectedNetwork, setSelectedNetwork] = useState<number>(chainId || 56); // Default to BSC
  const [selectedType, setSelectedType] = useState<string>('standard');
  const [privateKey, setPrivateKey] = useState('');
  const [contractAddress, setContractAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');

  // Parameters for different authorization types
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [tokenAddress, setTokenAddress] = useState('');
  const [callData, setCallData] = useState('');
  const [targetAddress, setTargetAddress] = useState('');

  // Auto-fill contract address from network config
  useEffect(() => {
    const networkConfig = getNetworkById(selectedNetwork);
    if (networkConfig?.delegateAddress) {
      setContractAddress(networkConfig.delegateAddress);
    }
  }, [selectedNetwork]);

  const isValidAddress = (address: string): boolean => {
    return ethers.isAddress(address);
  };

  const isValidPrivateKey = (key: string): boolean => {
    try {
      new ethers.Wallet(key);
      return true;
    } catch {
      return false;
    }
  };

  const createEIP7702Authorization = async () => {
    try {
      setIsLoading(true);
      setError('');
      setResult('');

      console.log('🔐 Creating EIP-7702 Authorization...');
      console.log('Selected Network:', selectedNetwork);
      console.log('Contract Address:', contractAddress);
      console.log('Authorization Type:', selectedType);

      // Get network configuration
      const networkConfig = getNetworkById(selectedNetwork);
      if (!networkConfig) {
        throw new Error('Network configuration not found');
      }

      console.log('Network Config:', networkConfig);

      // Create wallet from private key
      const wallet = new ethers.Wallet(privateKey);
      console.log('Wallet Address:', wallet.address);

      // Get user's nonce
      const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);
      const nonce = await provider.getTransactionCount(wallet.address);
      console.log('User Nonce:', nonce);

      // Create EIP-7702 authorization
      const chainId = networkConfig.chainId;
      const delegateAddress = contractAddress.toLowerCase();

      console.log('Creating authorization for:');
      console.log('- Chain ID:', chainId);
      console.log('- Delegate Address:', delegateAddress);
      console.log('- Nonce:', nonce);

      // RLP encode the authorization tuple
      const authTuple = [
        ethers.toBeHex(chainId),
        delegateAddress,
        ethers.toBeHex(nonce)
      ];

      console.log('Auth Tuple:', authTuple);

      const rlpEncoded = ethers.encodeRlp(authTuple);
      console.log('RLP Encoded:', rlpEncoded);

      // Create EIP-7702 message (0x05 + rlp_encoded)
      const magicByte = '0x05';
      const message = magicByte + rlpEncoded.slice(2);
      console.log('EIP-7702 Message:', message);

      // Hash the message
      const messageHash = ethers.keccak256(message);
      console.log('Message Hash:', messageHash);

      // Sign the hash
      const signingKey = new ethers.SigningKey(privateKey);
      const signature = signingKey.sign(messageHash);

      console.log('Signature:', {
        yParity: signature.yParity,
        r: signature.r,
        s: signature.s
      });

      // Create authorization list
      const authorizationList = [{
        chainId: ethers.toBeHex(chainId),
        address: delegateAddress,
        nonce: ethers.toBeHex(nonce),
        yParity: ethers.toBeHex(signature.yParity),
        r: signature.r,
        s: signature.s
      }];

      console.log('Authorization List:', authorizationList);

      // Prepare transaction data based on type
      let txData = '0x';
      let value = '0';

      switch (selectedType) {
        case 'sendETH':
          if (!recipient || !amount) {
            throw new Error('Recipient and amount are required for ETH transfer');
          }
          value = ethers.parseEther(amount).toString();
          break;

        case 'sweepETH':
          if (!recipient) {
            throw new Error('Recipient is required for ETH sweep');
          }
          const sweepETHInterface = new ethers.Interface([
            'function sweepETH(address recipient)'
          ]);
          txData = sweepETHInterface.encodeFunctionData('sweepETH', [recipient]);
          break;

        case 'sweepTokens':
          if (!tokenAddress || !recipient) {
            throw new Error('Token address and recipient are required for token sweep');
          }
          const sweepTokensInterface = new ethers.Interface([
            'function sweepTokens(address token, address recipient)'
          ]);
          txData = sweepTokensInterface.encodeFunctionData('sweepTokens', [tokenAddress, recipient]);
          break;

        case 'executeCall':
          if (!targetAddress || !callData) {
            throw new Error('Target address and call data are required for execute call');
          }
          const executeCallInterface = new ethers.Interface([
            'function executeCall(address target, bytes calldata data)'
          ]);
          txData = executeCallInterface.encodeFunctionData('executeCall', [targetAddress, callData]);
          break;

        case 'multicall':
          // For now, just standard authorization
          break;

        default:
          // Standard authorization - no additional data needed
          break;
      }

      // Create transaction
      const tx = {
        type: 4, // EIP-7702 transaction type
        to: selectedType === 'sendETH' ? recipient : contractAddress,
        value: value,
        data: txData,
        gasLimit: ethers.parseUnits('100000', 'wei'),
        maxFeePerGas: ethers.parseUnits('20', 'gwei'),
        maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei'),
        chainId: chainId,
        authorizationList: authorizationList
      };

      console.log('Transaction:', tx);

      // Send transaction through relayer
      const relayerResponse = await fetch('/api/relay-transaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transaction: tx,
          network: selectedNetwork
        })
      });

      if (!relayerResponse.ok) {
        throw new Error('Failed to send transaction through relayer');
      }

      const relayerResult = await relayerResponse.json();
      console.log('Relayer Result:', relayerResult);

      setResult(`EIP-7702 авторизация выполнена успешно (${selectedType})\n${relayerResult.hash}`);

    } catch (err) {
      console.error('Authorization Error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const canExecute = () => {
    if (!isValidPrivateKey(privateKey) || !isValidAddress(contractAddress)) {
      return false;
    }

    switch (selectedType) {
      case 'sendETH':
        return isValidAddress(recipient) && amount && parseFloat(amount) > 0;
      case 'sweepETH':
        return isValidAddress(recipient);
      case 'sweepTokens':
        return isValidAddress(tokenAddress) && isValidAddress(recipient);
      case 'executeCall':
        return isValidAddress(targetAddress) && callData;
      default:
        return true;
    }
  };

  const renderParameters = () => {
    switch (selectedType) {
      case 'sendETH':
        return (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Получатель
              </label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  recipient && !isValidAddress(recipient) ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="0x..."
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Сумма (ETH)
              </label>
              <input
                type="number"
                step="0.001"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.1"
              />
            </div>
          </>
        );

      case 'sweepETH':
        return (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Получатель
            </label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                recipient && !isValidAddress(recipient) ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="0x..."
            />
          </div>
        );

      case 'sweepTokens':
        return (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Адрес токена
              </label>
              <input
                type="text"
                value={tokenAddress}
                onChange={(e) => setTokenAddress(e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  tokenAddress && !isValidAddress(tokenAddress) ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="0x..."
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Получатель
              </label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  recipient && !isValidAddress(recipient) ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="0x..."
              />
            </div>
          </>
        );

      case 'executeCall':
        return (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Целевой адрес
              </label>
              <input
                type="text"
                value={targetAddress}
                onChange={(e) => setTargetAddress(e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  targetAddress && !isValidAddress(targetAddress) ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="0x..."
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Данные вызова
              </label>
              <textarea
                value={callData}
                onChange={(e) => setCallData(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="0x..."
              />
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left Sidebar */}
      <div className="w-80 bg-white shadow-lg">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold text-gray-800">EIP-7702 Авторизация</h2>
          <p className="text-sm text-gray-600 mt-1">Выберите тип авторизации</p>
        </div>
        
        <div className="p-4 space-y-2">
          {authorizationTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => setSelectedType(type.id)}
              className={`w-full text-left p-3 rounded-lg transition-colors ${
                selectedType === type.id
                  ? 'bg-blue-50 border-2 border-blue-200'
                  : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center space-x-3">
                <span className="text-2xl">{type.icon}</span>
                <div>
                  <div className="font-medium text-gray-800">{type.name}</div>
                  <div className="text-sm text-gray-600">{type.description}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">
                {authorizationTypes.find(t => t.id === selectedType)?.name}
              </h3>
              <p className="text-gray-600">
                {authorizationTypes.find(t => t.id === selectedType)?.description}
              </p>
            </div>

            {/* Network Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Сеть
              </label>
              <select
                value={selectedNetwork}
                onChange={(e) => setSelectedNetwork(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(networks.networks).map(([key, network]) => (
                  <option key={key} value={network.id}>
                    {network.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Private Key */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Приватный ключ пользователя
              </label>
              <input
                type="password"
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  privateKey && !isValidPrivateKey(privateKey) ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="0x..."
              />
            </div>

            {/* Contract Address */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Адрес контракта для делегирования
              </label>
              <input
                type="text"
                value={contractAddress}
                readOnly
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600"
                placeholder="Автоматически выбран из конфигурации сети"
              />
              <p className="text-xs text-gray-500 mt-1">
                Автоматически выбран из конфигурации сети
              </p>
            </div>

            {/* Type-specific parameters */}
            {renderParameters()}

            {/* Action Buttons */}
            <div className="flex space-x-4 mt-6">
              <button
                onClick={createEIP7702Authorization}
                disabled={!canExecute() || isLoading}
                className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
                  canExecute() && !isLoading
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                {isLoading ? 'Выполняется...' : 'Выполнить авторизацию'}
              </button>
            </div>

            {/* Results */}
            {result && (
              <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-md">
                <h4 className="font-medium text-green-800 mb-2">Результат:</h4>
                <pre className="text-sm text-green-700 whitespace-pre-wrap">{result}</pre>
              </div>
            )}

            {error && (
              <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-md">
                <h4 className="font-medium text-red-800 mb-2">Ошибка:</h4>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};