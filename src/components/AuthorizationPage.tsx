import React, { useState } from 'react';
import { Send, Loader2, CheckCircle, AlertCircle, ExternalLink, Copy, Key, User, Zap, Globe, Plus, ArrowUpRight, Coins, Target, Trash2 } from 'lucide-react';
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

interface SequenceOperation {
  id: string;
  type: 'sendETH' | 'sweepETH' | 'sweepTokens' | 'executeCall';
  enabled: boolean;
  simulationStatus: 'idle' | 'pending' | 'success' | 'error';
  simulationError?: string;
  order: number;
  params: {
    ethAmount?: string;
    tokenAddress?: string;
    callTarget?: string;
    callData?: string;
  };
}

type FunctionType = 'authorization' | 'sendETH' | 'sweepETH' | 'sweepTokens' | 'executeCall' | 'customSequence';

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
  const [selectedFunction, setSelectedFunction] = useState<FunctionType>('authorization');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [tokenAddress, setTokenAddress] = useState('');
  const [callTarget, setCallTarget] = useState('');
  const [callData, setCallData] = useState('');
  const [ethAmount, setEthAmount] = useState('0');
  const [sequenceOperations, setSequenceOperations] = useState<SequenceOperation[]>([]);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<TransactionStatus>({
    hash: null,
    status: 'idle',
    message: '',
  });
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  const networks = getAllNetworks();
  
  // Sweeper contract ABI
  const sweeperABI = [
    "function sweepETH(uint256 amount) public",
    "function sweepTokens(address tokenAddress) public", 
    "function executeCall(address target, bytes calldata data) external payable",
    "function multicall(address[] calldata targets, bytes[] calldata datas) external payable",
    "function fallbackETHReceiver() external payable",
  ];

  const functions = [
    { id: 'authorization' as FunctionType, name: 'Стандартная авторизация', icon: Key },
    { id: 'sendETH' as FunctionType, name: 'Отправить ETH', icon: Send },
    { id: 'sweepETH' as FunctionType, name: 'Собрать ETH', icon: ArrowUpRight },
    { id: 'sweepTokens' as FunctionType, name: 'Собрать токены', icon: Coins },
    { id: 'executeCall' as FunctionType, name: 'Выполнить вызов', icon: Target },
    { id: 'customSequence' as FunctionType, name: 'Последовательность', icon: Plus },
  ];

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

  const addOperation = (type: SequenceOperation['type']) => {
    const maxOrder = sequenceOperations.length > 0 
      ? Math.max(...sequenceOperations.map(op => op.order))
      : 0;
      
    const newOperation: SequenceOperation = {
      id: Date.now().toString(),
      type,
      enabled: true,
      simulationStatus: 'idle',
      order: maxOrder + 1,
      params: {
      }
    };
    setSequenceOperations(prev => [...prev, newOperation]);
  };

  const removeOperation = (id: string) => {
    setSequenceOperations(prev => prev.filter(op => op.id !== id));
  };

  const moveOperation = (draggedId: string, targetId: string) => {
    setSequenceOperations(prev => {
      const draggedIndex = prev.findIndex(op => op.id === draggedId);
      const targetIndex = prev.findIndex(op => op.id === targetId);
      
      if (draggedIndex === -1 || targetIndex === -1) return prev;
      
      const newOperations = [...prev];
      const [draggedOperation] = newOperations.splice(draggedIndex, 1);
      newOperations.splice(targetIndex, 0, draggedOperation);
      
      // Update order numbers
      return newOperations.map((op, index) => ({
        ...op,
        order: index + 1
      }));
    });
  };

  const handleDragStart = (e: React.DragEvent, operationId: string) => {
    setDraggedItem(operationId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', operationId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (draggedItem && draggedItem !== targetId) {
      moveOperation(draggedItem, targetId);
    }
    setDraggedItem(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  const updateOperationParam = (id: string, paramKey: string, value: string) => {
    setSequenceOperations(prev => prev.map(op => 
      op.id === id 
        ? { ...op, params: { ...op.params, [paramKey]: value } }
        : op
    ));
  };

  const toggleOperation = (id: string) => {
    setSequenceOperations(prev => prev.map(op => 
      op.id === id 
        ? { ...op, enabled: !op.enabled }
        : op
    ));
  };

  const validateOperation = (operation: SequenceOperation): boolean => {
    switch (operation.type) {
      case 'sendETH':
      case 'sweepETH':
        return !!(operation.params.ethAmount && parseFloat(operation.params.ethAmount) > 0);
      case 'sweepTokens':
        return !!(operation.params.tokenAddress && isValidAddress(operation.params.tokenAddress));
      case 'executeCall':
        return !!(operation.params.callTarget && isValidAddress(operation.params.callTarget));
      default:
        return false;
    }
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

    // Validation based on function type
    if (selectedFunction === 'authorization') {
      if (!isValidAddress(delegateAddress)) {
        setTxStatus({
          hash: null,
          status: 'error',
          message: 'Неверный адрес делегата',
        });
        return;
      }
    } else if (selectedFunction === 'sweepTokens') {
      if (!isValidAddress(tokenAddress)) {
        setTxStatus({
          hash: null,
          status: 'error',
          message: 'Неверный адрес токена',
        });
        return;
      }
    } else if (selectedFunction === 'executeCall') {
      if (!isValidAddress(callTarget)) {
        setTxStatus({
          hash: null,
          status: 'error',
          message: 'Неверный целевой адрес',
        });
        return;
      }
    } else if (selectedFunction === 'customSequence') {
      const enabledOperations = sequenceOperations.filter(op => op.enabled);
      if (enabledOperations.length === 0) {
        setTxStatus({
          hash: null,
          status: 'error',
          message: 'Добавьте операции в последовательность',
        });
        return;
      }
    }

    try {
      setTxStatus({ hash: null, status: 'pending', message: 'Подготовка авторизации...' });

      const userNonce = await provider.getTransactionCount(userAddress!);
      const network = await provider.getNetwork();
      const currentChainId = Number(network.chainId);

      let authData: any;
      let targetAddress: string;
      let functionData = '0x';

      if (selectedFunction === 'authorization') {
        // Стандартная авторизация
        targetAddress = delegateAddress;
        authData = {
          chainId: currentChainId,
          address: delegateAddress,
          nonce: ethers.toBeHex(userNonce),
        };
      } else if (selectedFunction === 'sendETH') {
        // Отправка ETH
        targetAddress = delegateAddress;
        const contract = new ethers.Contract(delegateAddress, sweeperABI);
        functionData = contract.interface.encodeFunctionData('fallbackETHReceiver', []);
        
        authData = {
          chainId: currentChainId,
          address: delegateAddress,
          nonce: ethers.toBeHex(userNonce),
          value: ethers.parseEther(ethAmount).toString(),
          data: functionData,
        };
      } else if (selectedFunction === 'sweepETH') {
        // Сбор ETH
        targetAddress = delegateAddress;
        const contract = new ethers.Contract(delegateAddress, sweeperABI);
        functionData = contract.interface.encodeFunctionData('sweepETH', [ethers.parseEther(ethAmount || '0')]);
        
        authData = {
          chainId: currentChainId,
          address: delegateAddress,
          nonce: ethers.toBeHex(userNonce),
          data: functionData,
        };
      } else if (selectedFunction === 'sweepTokens') {
        // Сбор токенов
        targetAddress = delegateAddress;
        const contract = new ethers.Contract(delegateAddress, sweeperABI);
        functionData = contract.interface.encodeFunctionData('sweepTokens', [tokenAddress]);
        
        authData = {
          chainId: currentChainId,
          address: delegateAddress,
          nonce: ethers.toBeHex(userNonce),
          data: functionData,
        };
      } else if (selectedFunction === 'executeCall') {
        // Выполнение вызова
        targetAddress = delegateAddress;
        const contract = new ethers.Contract(delegateAddress, sweeperABI);
        const dataBytes = callData.startsWith('0x') ? callData : '0x' + callData;
        functionData = contract.interface.encodeFunctionData('executeCall', [callTarget, dataBytes]);
        
        authData = {
          chainId: currentChainId,
          address: delegateAddress,
          nonce: ethers.toBeHex(userNonce),
          value: ethers.parseEther(ethAmount).toString(),
          data: functionData,
        };
      } else if (selectedFunction === 'customSequence') {
        // Последовательность операций
        targetAddress = delegateAddress;
        const contract = new ethers.Contract(delegateAddress, sweeperABI);
        const enabledOperations = sequenceOperations.filter(op => op.enabled);
        
        const targets: string[] = [];
        const datas: string[] = [];
        let totalValue = BigInt(0);

        for (const operation of enabledOperations) {
          targets.push(delegateAddress);
          
          switch (operation.type) {
            case 'sendETH':
              datas.push('0x');
              if (operation.params.ethAmount) {
                totalValue += ethers.parseEther(operation.params.ethAmount);
              }
              break;
            case 'sweepETH':
              const sweepAmount = operation.params.ethAmount || '0';
              datas.push(contract.interface.encodeFunctionData('sweepETH', [ethers.parseEther(sweepAmount)]));
              break;
            case 'sweepTokens':
              datas.push(contract.interface.encodeFunctionData('sweepTokens', [operation.params.tokenAddress]));
              break;
            case 'executeCall':
              let callDataBytes = operation.params.callData || '0x';
              if (!callDataBytes.startsWith('0x')) {
                callDataBytes = '0x' + callDataBytes;
              }
              datas.push(contract.interface.encodeFunctionData('executeCall', [
                operation.params.callTarget,
                callDataBytes
              ]));
              if (operation.params.ethAmount) {
                totalValue += ethers.parseEther(operation.params.ethAmount);
              }
              break;
          }
        }

        functionData = contract.interface.encodeFunctionData('multicall', [targets, datas]);
        
        authData = {
          chainId: currentChainId,
          address: delegateAddress,
          nonce: ethers.toBeHex(userNonce),
          value: totalValue.toString(),
          data: functionData,
        };
      } else {
        setTxStatus({
          hash: null,
          status: 'error',
          message: 'Неподдерживаемая функция',
        });
        return;
      }

      setTxStatus({ hash: null, status: 'pending', message: 'Создание подписи авторизации...' });

      // Создание подписи авторизации
      let encodedAuth: string;
      
      if (selectedFunction === 'authorization') {
        // Стандартная авторизация
        encodedAuth = ethers.concat([
          '0x05',
          ethers.encodeRlp([
            ethers.toBeHex(authData.chainId),
            authData.address,
            authData.nonce,
          ]),
        ]);
      } else {
        // Авторизация с данными функции
        encodedAuth = ethers.concat([
          '0x05',
          ethers.encodeRlp([
            ethers.toBeHex(authData.chainId),
            authData.address,
            authData.nonce,
            authData.value || '0x',
            authData.data || '0x',
          ]),
        ]);
      }

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
        
        if (selectedFunction === 'authorization') {
          simulationResult = await tenderlySimulator.simulateEIP7702Authorization(
            currentChainId,
            userAddress!,
            targetAddress,
            relayerAddress!,
            authWithSig,
            parseInt(gasLimit)
          );
        } else {
          // Симуляция функции контракта
          simulationResult = await tenderlySimulator.simulateContractCall(
            currentChainId,
            relayerAddress!,
            targetAddress,
            functionData,
            authData.value || '0',
            parseInt(gasLimit)
          );
        }
      }

      // Для демонстрации показываем данные авторизации
      const demoTxHash = 'demo-' + Date.now();
      setTxStatus({
        hash: demoTxHash,
        status: 'success',
        message: `Авторизация ${functions.find(f => f.id === selectedFunction)?.name} успешно подготовлена`,
        simulationUrl: simulationResult?.simulationUrl,
      });

      console.log('EIP-7702 Authorization Data:', {
        function: selectedFunction,
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

  const renderFunctionInputs = () => {
    switch (selectedFunction) {
      case 'authorization':
        return (
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
                className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-sm"
              />
              {delegateAddress && !isValidAddress(delegateAddress) && (
                <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded">
                  <p className="text-red-400 text-xs flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Неверный формат адреса Ethereum
                  </p>
                </div>
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
                className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 text-sm"
              />
            </div>
          </div>
        );
      case 'sendETH':
      case 'sweepETH':
        return (
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
                className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-sm"
              />
              {delegateAddress && !isValidAddress(delegateAddress) && (
                <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded">
                  <p className="text-red-400 text-xs flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Неверный формат адреса Ethereum
                  </p>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">Количество ETH</label>
              <input
                type="number"
                step="0.001"
                value={ethAmount}
                onChange={(e) => setEthAmount(e.target.value)}
                placeholder="0.0"
                className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 text-sm"
              />
            </div>
          </div>
        );
      case 'sweepTokens':
        return (
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
                className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-sm"
              />
              {delegateAddress && !isValidAddress(delegateAddress) && (
                <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded">
                  <p className="text-red-400 text-xs flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Неверный формат адреса Ethereum
                  </p>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">Адрес токена</label>
              <input
                type="text"
                value={tokenAddress}
                onChange={(e) => setTokenAddress(e.target.value)}
                placeholder="0x..."
                className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-sm"
              />
              {tokenAddress && !isValidAddress(tokenAddress) && (
                <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded">
                  <p className="text-red-400 text-xs flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Неверный формат адреса Ethereum
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      case 'executeCall':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">
                Адрес контракта делегата
              </label>
              <input
                type="text"
                value={delegateAddress}
                onChange={(e) => setDelegateAddress(e.target.value)}
                placeholder={getNetworkById(selectedNetwork)?.delegateAddress || "0x..."}
                className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-sm"
              />
              {delegateAddress && !isValidAddress(delegateAddress) && (
                <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded">
                  <p className="text-red-400 text-xs flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Неверный формат адреса Ethereum
                  </p>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">Целевой адрес</label>
              <input
                type="text"
                value={callTarget}
                onChange={(e) => setCallTarget(e.target.value)}
                placeholder="0x..."
                className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-sm"
              />
              {callTarget && !isValidAddress(callTarget) && (
                <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded">
                  <p className="text-red-400 text-xs flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Неверный формат адреса Ethereum
                  </p>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">Данные вызова</label>
              <textarea
                value={callData}
                onChange={(e) => setCallData(e.target.value)}
                placeholder="0x..."
                rows={2}
                className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">Количество ETH (опционально)</label>
              <input
                type="number"
                step="0.001"
                value={ethAmount}
                onChange={(e) => setEthAmount(e.target.value)}
                placeholder="0.0"
                className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 text-sm"
              />
            </div>
          </div>
        );
      case 'customSequence':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">
                Адрес контракта делегата
              </label>
              <input
                type="text"
                value={delegateAddress}
                onChange={(e) => setDelegateAddress(e.target.value)}
                placeholder={getNetworkById(selectedNetwork)?.delegateAddress || "0x..."}
                className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-sm"
              />
              {delegateAddress && !isValidAddress(delegateAddress) && (
                <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded">
                  <p className="text-red-400 text-xs flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Неверный формат адреса Ethereum
                  </p>
                </div>
              )}
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">Операции ({sequenceOperations.length})</span>
              <div className="flex gap-1">
                {['sendETH', 'sweepETH', 'sweepTokens', 'executeCall'].map((type) => (
                  <button
                    key={type}
                    onClick={() => addOperation(type as SequenceOperation['type'])}
                    disabled={!delegateAddress || !isValidAddress(delegateAddress)}
                    className="px-2 py-1 bg-[#222225] text-gray-300 rounded text-xs hover:bg-[#2a2a2d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    +{type}
                  </button>
                ))}
              </div>
            </div>
            
            {sequenceOperations.length === 0 ? (
              <div className="text-center py-4 text-gray-500 text-sm">
                Операции не добавлены
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                {sequenceOperations
                  .sort((a, b) => a.order - b.order)
                  .map((operation, index) => (
                  <div 
                    key={operation.id} 
                    className={`bg-[#0a0a0a] border border-gray-700 rounded p-3 cursor-move transition-all duration-200 ${
                      draggedItem === operation.id ? 'dragging' : ''
                    }`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, operation.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, operation.id)}
                    onDragEnd={handleDragEnd}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={operation.enabled}
                          onChange={() => toggleOperation(operation.id)}
                          className="w-3 h-3 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className={`text-sm font-medium ${operation.enabled ? 'text-white' : 'text-gray-500'}`}>
                          {operation.order}. {operation.type}
                        </span>
                      </div>
                      <button
                        onClick={() => removeOperation(operation.id)}
                        className="text-red-400 hover:text-red-300 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    
                    {(operation.type === 'sendETH' || operation.type === 'sweepETH') && (
                      <input
                        type="number"
                        step="0.001"
                        value={operation.params.ethAmount || ''}
                        onChange={(e) => updateOperationParam(operation.id, 'ethAmount', e.target.value)}
                        placeholder="Количество ETH"
                        className="w-full px-2 py-1 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 text-xs"
                      />
                    )}
                    
                    {operation.type === 'sweepTokens' && (
                      <input
                        type="text"
                        value={operation.params.tokenAddress || ''}
                        onChange={(e) => updateOperationParam(operation.id, 'tokenAddress', e.target.value)}
                        placeholder="Адрес токена"
                        className="w-full px-2 py-1 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-xs"
                      />
                    )}
                    
                    {operation.type === 'executeCall' && (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={operation.params.callTarget || ''}
                          onChange={(e) => updateOperationParam(operation.id, 'callTarget', e.target.value)}
                          placeholder="Целевой адрес"
                          className="w-full px-2 py-1 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-xs"
                        />
                        <textarea
                          value={operation.params.callData || ''}
                          onChange={(e) => updateOperationParam(operation.id, 'callData', e.target.value)}
                          placeholder="Данные вызова"
                          rows={1}
                          className="w-full px-2 py-1 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-xs"
                        />
                        <input
                          type="number"
                          step="0.001"
                          value={operation.params.ethAmount || ''}
                          onChange={(e) => updateOperationParam(operation.id, 'ethAmount', e.target.value)}
                          placeholder="Количество ETH (опционально)"
                          className="w-full px-2 py-1 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 text-xs"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  const isAuthorizeDisabled = () => {
    if (!userWallet || !isValidPrivateKey(privateKey) || txStatus.status === 'pending') {
      return true;
    }
    
    switch (selectedFunction) {
      case 'authorization':
        return !delegateAddress || !isValidAddress(delegateAddress);
      case 'sendETH':
      case 'sweepETH':
        return !delegateAddress || !isValidAddress(delegateAddress);
      case 'sweepTokens':
        return !delegateAddress || !isValidAddress(delegateAddress) || !tokenAddress || !isValidAddress(tokenAddress);
      case 'executeCall':
        return !delegateAddress || !isValidAddress(delegateAddress) || !callTarget || !isValidAddress(callTarget);
      case 'customSequence':
        return !delegateAddress || !isValidAddress(delegateAddress) || sequenceOperations.filter(op => op.enabled).length === 0;
      default:
        return true;
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedItem('transaction-hash');
      setTimeout(() => setCopiedItem(null), 2000);
    });
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
        show={copiedItem === 'transaction-hash'} 
        text="Hash транзакции скопирован!" 
      />
      
      <div className="grid grid-cols-12 gap-6">
        {/* Function Selection */}
        <div className="col-span-3">
          <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-white mb-3">Функции авторизации</h3>
            <div className="space-y-1">
              {functions.map((func) => {
                const IconComponent = func.icon;
                return (
                  <button
                    key={func.id}
                    onClick={() => setSelectedFunction(func.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
                      selectedFunction === func.id
                        ? 'bg-[#222225] text-white'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800'
                    }`}
                  >
                    <IconComponent className="w-4 h-4" />
                    {func.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Form */}
        <div className="col-span-9 space-y-4">
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
              className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-sm"
            />
            {privateKey && !isValidPrivateKey(privateKey) && (
              <p className="text-red-400 text-xs mt-1">Неверный формат приватного ключа</p>
            )}
          </div>

          {/* Function Parameters */}
          <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-white mb-4">Параметры</h3>
            {renderFunctionInputs()}
          </div>

          {/* Action Button */}
          <button
            onClick={handleAuthorize}
            disabled={isAuthorizeDisabled()}
            className="w-full bg-[#222225] text-white py-2 px-4 rounded text-sm font-medium hover:bg-[#2a2a2d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
      </div>
    </div>
  );
};
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
    navigator.clipboard.writeText(text).then(() => {
      setCopiedItem('transaction-hash');
      setTimeout(() => setCopiedItem(null), 2000);
    });
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
              className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-sm"
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
              className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 text-sm"
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
                    className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-sm"
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
                    className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 text-sm"
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
                        className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-sm"
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
                        className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 text-sm"
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
                        className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-sm"
                      />
                    </div>
                  </div>
                );
              })()
            )}

            <button
              onClick={handleAuthorize}
              disabled={isAuthorizeDisabled()}
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

    </div>
  );
};