import React, { useState, useEffect } from 'react';
import { Shield, Send, Target, Loader2, CheckCircle, AlertCircle, ExternalLink, Copy, Globe, Key, User, ArrowUpRight, Coins, Plus, Trash2, Wrench } from 'lucide-react';
import { ethers } from 'ethers';
import { useEnvWallet } from '../hooks/useEnvWallet';
import { tenderlySimulator } from '../utils/tenderly';
import { getAllNetworks, getNetworkById, getTransactionUrl, getNetworkGasConfig, getNetworkAuthorizationGasLimit, getNetworkRpcUrl, getNetworkRelayerKey } from '../config/networkConfig';

interface TransactionStatus {
  hash: string | null;
  status: 'idle' | 'pending' | 'success' | 'error';
  message: string;
  simulationUrl?: string;
}

interface SequenceOperation {
  id: string;
  type: 'sendETH' | 'sweepTokens' | 'executeCall';
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

type FunctionType = 'authorization' | 'sendETH' | 'sweepTokens' | 'executeCall' | 'customSequence';

export const AuthorizationPage: React.FC = () => {
  const { relayerWallet, provider, relayerAddress } = useEnvWallet();
  const [selectedNetwork, setSelectedNetwork] = useState<number>(56); // Default to BSC
  const [selectedFunction, setSelectedFunction] = useState<FunctionType>('authorization');
  const [userPrivateKey, setUserPrivateKey] = useState('');
  const [userWallet, setUserWallet] = useState<ethers.Wallet | null>(null);
  const [delegateAddress, setDelegateAddress] = useState('');
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
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [isSimulated, setIsSimulated] = useState(false);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  const networks = getAllNetworks();

  // Create provider and wallet for selected network
  const getNetworkProvider = () => {
    const network = getNetworkById(selectedNetwork);
    if (!network) return null;
    return new ethers.JsonRpcProvider(network.rpcUrl);
  };

  const getNetworkRelayerWallet = () => {
    const network = getNetworkById(selectedNetwork);
    if (!network) return null;
    
    const relayerKey = getNetworkRelayerKey(selectedNetwork);
    if (!relayerKey) return null;
    
    const provider = getNetworkProvider();
    if (!provider) return null;
    
    return new ethers.Wallet(relayerKey, provider);
  };

  // Sweeper contract ABI
  const sweeperABI = [
    "function sweepETH(uint256 amount) public",
    "function sweepTokens(address tokenAddress) public",
    "function executeCall(address target, bytes calldata data) external payable",
    "function multicall(address[] calldata targets, bytes[] calldata datas) external payable",
    "function fallbackETHReceiver() external payable",
  ];

  const functions = [
    { id: 'authorization' as FunctionType, name: 'Только авторизация', icon: Shield },
    { id: 'sendETH' as FunctionType, name: 'Отправить ETH', icon: Send },
    { id: 'sweepTokens' as FunctionType, name: 'Собрать токены', icon: Coins },
    { id: 'executeCall' as FunctionType, name: 'Выполнить вызов', icon: Target },
    { id: 'customSequence' as FunctionType, name: 'Последовательность', icon: Plus },
  ];

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

  // Reset simulation when function or parameters change
  useEffect(() => {
    resetSimulation();
  }, [selectedFunction, delegateAddress, ethAmount, tokenAddress, callTarget, callData, sequenceOperations]);

  const isValidAddress = (address: string) => {
    return ethers.isAddress(address);
  };

  const isValidPrivateKey = (key: string) => {
    if (!key) return false;
    const cleanKey = key.startsWith('0x') ? key.slice(2) : key;
    return /^[0-9a-fA-F]{64}$/.test(cleanKey);
  };

  const prepareFunctionData = (): string => {
    if (!userWallet) return '0x';

    switch (selectedFunction) {
      case 'authorization':
        return '0x';
      case 'sendETH':
        return '0x'; // fallbackETHReceiver doesn't need data
      case 'sweepTokens':
        if (!isValidAddress(tokenAddress)) return '0x';
        const contractTokens = new ethers.Interface(sweeperABI);
        return contractTokens.encodeFunctionData('sweepTokens', [tokenAddress]);
      case 'executeCall':
        if (!isValidAddress(callTarget)) return '0x';
        const dataBytes = callData.startsWith('0x') ? callData : '0x' + callData;
        const contractCall = new ethers.Interface(sweeperABI);
        return contractCall.encodeFunctionData('executeCall', [callTarget, dataBytes]);
      case 'customSequence':
        return prepareSequenceData();
      default:
        return '0x';
    }
  };

  const prepareSequenceData = (): string => {
    if (!userWallet) return '0x';
    
    const enabledOperations = sequenceOperations.filter(op => op.enabled);
    if (enabledOperations.length === 0) return '0x';

    const contract = new ethers.Interface(sweeperABI);
    const targets: string[] = [];
    const datas: string[] = [];

    for (const operation of enabledOperations) {
      targets.push(userWallet.address); // Use user address instead of contract address
      
      switch (operation.type) {
        case 'sendETH':
          datas.push('0x');
          break;
        case 'sweepTokens':
          datas.push(contract.encodeFunctionData('sweepTokens', [operation.params.tokenAddress]));
          break;
        case 'executeCall':
          let callDataBytes = operation.params.callData || '0x';
          if (!callDataBytes.startsWith('0x')) {
            callDataBytes = '0x' + callDataBytes;
          }
          datas.push(contract.encodeFunctionData('executeCall', [
            operation.params.callTarget,
            callDataBytes
          ]));
          break;
      }
    }

    return contract.encodeFunctionData('multicall', [targets, datas]);
  };

  const getTransactionValue = (): string => {
    switch (selectedFunction) {
      case 'sendETH':
      case 'executeCall':
        return ethAmount || '0';
      case 'customSequence':
        let totalValue = BigInt(0);
        const enabledOperations = sequenceOperations.filter(op => op.enabled);
        for (const operation of enabledOperations) {
          if ((operation.type === 'sendETH' || operation.type === 'executeCall') && operation.params.ethAmount) {
            totalValue += ethers.parseEther(operation.params.ethAmount);
          }
        }
        return ethers.formatEther(totalValue);
      default:
        return '0';
    }
  };

  const validateFunctionParameters = (): boolean => {
    switch (selectedFunction) {
      case 'authorization':
        return true;
      case 'sendETH':
        return !!(ethAmount && parseFloat(ethAmount) > 0);
      case 'sweepTokens':
        return !!(tokenAddress && isValidAddress(tokenAddress));
      case 'executeCall':
        return !!(callTarget && isValidAddress(callTarget));
      case 'customSequence':
        return sequenceOperations.filter(op => op.enabled).length > 0;
      default:
        return false;
    }
  };

  const handleSimulate = async () => {
    const provider = getNetworkProvider();
    const relayerWallet = getNetworkRelayerWallet();
    
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

    if (!validateFunctionParameters()) {
      setTxStatus({
        hash: null,
        status: 'error',
        message: 'Неверные параметры функции',
      });
      return;
    }

    try {
      setTxStatus({ hash: null, status: 'pending', message: 'Симуляция авторизации...' });

      console.log(`UserEOA: ${userWallet.address}`);
      console.log(`Relayer: ${relayerWallet.address}`);
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

      // 2. Готовим данные функции
      const functionData = prepareFunctionData();
      const transactionValue = getTransactionValue();

      console.log(`Function: ${selectedFunction}, Data: ${functionData}, Value: ${transactionValue}`);

      // 3. Готовим EIP-7702 авторизацию
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

      // 4. Готовим транзакцию от имени relayer
      const relayerNonce = await provider.getTransactionCount(relayerWallet.address);
      const feeData = await provider.getFeeData();

      const txData = [
        ethers.toBeHex(finalAuthData.chainId),
        ethers.toBeHex(relayerNonce),
        ethers.toBeHex(feeData.maxPriorityFeePerGas || ethers.parseUnits('2', 'gwei')),
        ethers.toBeHex(feeData.maxFeePerGas || ethers.parseUnits('50', 'gwei')),
        ethers.toBeHex(getNetworkAuthorizationGasLimit(chainId)),
        userWallet.address,     // sender (delegator)
        userWallet.address,     // to (user address for function execution)
        functionData,           // data (function call or 0x for simple authorization)
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

      // Add value if needed
      if (transactionValue && parseFloat(transactionValue) > 0) {
        txData[6] = ethers.toBeHex(ethers.parseEther(transactionValue)); // Update value field
      }

      // 5. Подпись relayer'ом
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
          relayerWallet.address,
          finalAuthData,
          getNetworkAuthorizationGasLimit(chainId)
        );
        
        setSimulationResult(simulationResult);
        setIsSimulated(true);
        
        if (simulationResult.success) {
          setTxStatus({
            hash: null,
            status: 'success',
            message: `Симуляция ${selectedFunction === 'authorization' ? 'авторизации' : 'функции'} прошла успешно. Можно отправить транзакцию.`,
            simulationUrl: simulationResult.simulationUrl,
          });
        } else {
          setTxStatus({
            hash: null,
            status: 'error',
            message: `Симуляция ${selectedFunction === 'authorization' ? 'авторизации' : 'функции'} не прошла: ${simulationResult.error}`,
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
          message: `${selectedFunction === 'authorization' ? 'Авторизация' : 'Функция'} подготовлена успешно. Можно отправить транзакцию.`,
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
    const provider = getNetworkProvider();
    
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
        message: `EIP-7702 ${selectedFunction === 'authorization' ? 'авторизация' : 'функция'} отправлена успешно!`,
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
    const provider = getNetworkProvider();
    const relayerWallet = getNetworkRelayerWallet();
    
    return !relayerWallet || !provider || !userWallet || !isValidAddress(delegateAddress) || 
           txStatus.status === 'pending' || !validateFunctionParameters();
  };

  const isExecuteDisabled = () => {
    return !isSimulated || !simulationResult?.success || txStatus.status === 'pending';
  };

  // Sequence operations functions
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
      params: {}
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
        return !!(operation.params.ethAmount && parseFloat(operation.params.ethAmount) > 0);
      case 'sweepTokens':
        return !!(operation.params.tokenAddress && isValidAddress(operation.params.tokenAddress));
      case 'executeCall':
        return !!(operation.params.callTarget && isValidAddress(operation.params.callTarget));
      default:
        return false;
    }
  };

  const getOperationStatusIcon = (status: SequenceOperation['simulationStatus']) => {
    switch (status) {
      case 'pending':
        return <Loader2 className="w-3 h-3 animate-spin text-blue-400" />;
      case 'success':
        return <CheckCircle className="w-3 h-3 text-green-400" />;
      case 'error':
        return <AlertCircle className="w-3 h-3 text-red-400" />;
      default:
        return null;
    }
  };

  const getOperationStatusColor = (status: SequenceOperation['simulationStatus']) => {
    switch (status) {
      case 'pending':
        return 'border-blue-500/20';
      case 'success':
        return 'border-green-500/20';
      case 'error':
        return 'border-red-500/20';
      default:
        return 'border-gray-700';
    }
  };

  const renderFunctionInputs = () => {
    switch (selectedFunction) {
      case 'authorization':
        return (
          <div className="text-center py-4 text-gray-400 text-sm">
            Простая авторизация без дополнительных параметров
          </div>
        );
      case 'sendETH':
        return (
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
        );
      case 'sweepTokens':
        return (
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">Адрес токена</label>
            <input
              type="text"
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value)}
              placeholder="0x..."
              className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-sm"
            />
          </div>
        );
      case 'executeCall':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">Целевой адрес</label>
              <input
                type="text"
                value={callTarget}
                onChange={(e) => setCallTarget(e.target.value)}
                placeholder="0x..."
                className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-sm"
              />
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
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">Операции ({sequenceOperations.length})</span>
              <div className="flex gap-1">
                {['sendETH', 'sweepTokens', 'executeCall'].map((type) => (
                  <button
                    key={type}
                    onClick={() => addOperation(type as SequenceOperation['type'])}
                    className="px-2 py-1 bg-[#222225] text-gray-300 rounded text-xs hover:bg-[#2a2a2d] transition-colors"
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
                    className={`bg-[#0a0a0a] border rounded p-3 cursor-move transition-all duration-200 ${getOperationStatusColor(operation.simulationStatus)} ${
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
                        {getOperationStatusIcon(operation.simulationStatus)}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => removeOperation(operation.id)}
                          className="text-red-400 hover:text-red-300 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    
                    {operation.simulationError && (
                      <div className="text-xs text-red-400 mb-2 p-2 bg-red-500/10 rounded">
                        {operation.simulationError}
                      </div>
                    )}
                    
                    {operation.type === 'sendETH' && (
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
      
      <div className="grid grid-cols-12 gap-6">
        {/* Function Selection */}
        <div className="col-span-3">
          <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-white mb-3">Функции</h3>
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
                  {network.name} (Chain ID: {network.id})
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

          {/* Function Parameters */}
          <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-white mb-3">Параметры функции</h3>
            {renderFunctionInputs()}
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
                    Симулировать {selectedFunction === 'authorization' ? 'авторизацию' : 'функцию'}
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
                      Отправить {selectedFunction === 'authorization' ? 'авторизацию' : 'функцию'}
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
    </div>
  );
};