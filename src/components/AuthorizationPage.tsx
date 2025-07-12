import React, { useState, useEffect } from 'react';
import { Shield, Send, Target, Loader2, CheckCircle, AlertCircle, ExternalLink, Copy, Globe, Key, User, ArrowUpRight, Coins, Plus, Trash2 } from 'lucide-react';
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
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [isSimulated, setIsSimulated] = useState(false);
  const [authorizationDetails, setAuthorizationDetails] = useState<AuthorizationDetails | null>(null);
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
    { id: 'authorization' as FunctionType, name: 'Только авторизация', icon: Shield },
    { id: 'sendETH' as FunctionType, name: 'Авторизация + Отправить ETH', icon: Send },
    { id: 'sweepETH' as FunctionType, name: 'Авторизация + Собрать ETH', icon: ArrowUpRight },
    { id: 'sweepTokens' as FunctionType, name: 'Авторизация + Собрать токены', icon: Coins },
    { id: 'executeCall' as FunctionType, name: 'Авторизация + Выполнить вызов', icon: Target },
    { id: 'customSequence' as FunctionType, name: 'Авторизация + Последовательность', icon: Plus },
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

  const isValidAddress = (address: string) => {
    return ethers.isAddress(address);
  };

  const isValidPrivateKey = (key: string) => {
    if (!key) return false;
    const cleanKey = key.startsWith('0x') ? key.slice(2) : key;
    return /^[0-9a-fA-F]{64}$/.test(cleanKey);
  };

  const handlePrepareAuthorization = async (includeFunction: boolean = false) => {
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

    // Validate function parameters if including function
    if (includeFunction && selectedFunction !== 'authorization') {
      const validationError = validateFunctionParameters();
      if (validationError) {
        setTxStatus({
          hash: null,
          status: 'error',
          message: validationError,
        });
        return;
      }
    }

    try {
      setTxStatus({ hash: null, status: 'pending', message: 'Подготовка авторизации...' });

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

      let txData = [
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

      // If including function, modify transaction data
      if (includeFunction && selectedFunction !== 'authorization') {
        const functionData = await prepareFunctionData();
        if (functionData) {
          // Update transaction with function call data
          txData[5] = delegateAddress; // to address (delegate contract)
          txData[6] = functionData.data; // function call data
          txData[4] = ethers.toBeHex(functionData.gasLimit); // update gas limit
          
          if (functionData.value && functionData.value !== '0') {
            // For payable functions, we need to handle value differently
            // This is a simplified approach - in practice, you might need more complex handling
          }
        }
      }

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

      // Simulate if Tenderly is available
      if (includeFunction && tenderlySimulator.isEnabled()) {
        await simulateTransaction(signedTx);
      }

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

      setIsSimulated(includeFunction ? !!simulationResult?.success : true);
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

  const validateFunctionParameters = (): string | null => {
    switch (selectedFunction) {
      case 'sweepTokens':
        if (!tokenAddress || !isValidAddress(tokenAddress)) {
          return 'Неверный адрес токена';
        }
        break;
      case 'executeCall':
        if (!callTarget || !isValidAddress(callTarget)) {
          return 'Неверный целевой адрес';
        }
        break;
      case 'customSequence':
        const enabledOps = sequenceOperations.filter(op => op.enabled);
        if (enabledOps.length === 0) {
          return 'Добавьте хотя бы одну операцию в последовательность';
        }
        for (const op of enabledOps) {
          if (!validateOperation(op)) {
            return `Неверные параметры для операции ${op.type}`;
          }
        }
        break;
    }
    return null;
  };

  const prepareFunctionData = async () => {
    if (!delegateAddress) return null;

    const contract = new ethers.Interface(sweeperABI);
    let functionData = '';
    let gasLimit = getNetworkGasConfig(chainId || selectedNetwork)?.gasLimit || 200000;
    let value = '0';

    switch (selectedFunction) {
      case 'sendETH':
        functionData = '0x'; // fallbackETHReceiver
        value = ethAmount;
        break;
      case 'sweepETH':
        functionData = contract.encodeFunctionData('sweepETH', [ethers.parseEther(ethAmount || '0')]);
        break;
      case 'sweepTokens':
        functionData = contract.encodeFunctionData('sweepTokens', [tokenAddress]);
        break;
      case 'executeCall':
        const dataBytes = callData.startsWith('0x') ? callData : '0x' + callData;
        functionData = contract.encodeFunctionData('executeCall', [callTarget, dataBytes]);
        value = ethAmount;
        break;
      case 'customSequence':
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
              datas.push(contract.encodeFunctionData('sweepETH', [ethers.parseEther(sweepAmount)]));
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
              if (operation.params.ethAmount) {
                totalValue += ethers.parseEther(operation.params.ethAmount);
              }
              break;
          }
        }

        functionData = contract.encodeFunctionData('multicall', [targets, datas]);
        value = totalValue.toString();
        gasLimit += 100000; // Extra gas for multicall
        break;
      default:
        return null;
    }

    return { data: functionData, gasLimit, value };
  };

  const simulateTransaction = async (signedTx: string) => {
    // This is a simplified simulation - in practice, you'd need to decode the transaction
    // and simulate it properly with Tenderly
    setSimulationResult({ success: true, gasUsed: 100000 });
  };

  // Sequence operations management
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

  const moveOperation = (draggedId: string, targetId: string) => {
    setSequenceOperations(prev => {
      const draggedIndex = prev.findIndex(op => op.id === draggedId);
      const targetIndex = prev.findIndex(op => op.id === targetId);
      
      if (draggedIndex === -1 || targetIndex === -1) return prev;
      
      const newOperations = [...prev];
      const [draggedOperation] = newOperations.splice(draggedIndex, 1);
      newOperations.splice(targetIndex, 0, draggedOperation);
      
      return newOperations.map((op, index) => ({ ...op, order: index + 1 }));
    });
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

    if (selectedFunction !== 'authorization' && !isSimulated) {
      setTxStatus({ hash: null, status: 'error', message: 'Сначала выполните симуляцию' });
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

  const renderFunctionInputs = () => {
    switch (selectedFunction) {
      case 'authorization':
        return null;
      case 'sendETH':
      case 'sweepETH':
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
                  .map((operation) => (
                  <div 
                    key={operation.id} 
                    className={`bg-[#0a0a0a] border border-gray-700 rounded p-3 cursor-move transition-all duration-200 ${
                      draggedItem === operation.id ? 'opacity-50 transform rotate-2' : ''
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
                      <button
                        onClick={() => removeOperation(operation.id)}
                        className="text-red-400 hover:text-red-300 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    
                    {operation.simulationError && (
                      <div className="text-xs text-red-400 mb-2 p-2 bg-red-500/10 rounded">
                        {operation.simulationError}
                      </div>
                    )}
                    
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

  const isPrepareDisabled = () => {
    if (!relayerWallet || !provider || !userWallet || !isValidAddress(delegateAddress) || txStatus.status === 'pending') {
      return true;
    }

    if (selectedFunction !== 'authorization') {
      return !!validateFunctionParameters();
    }

    return false;
  };

  const isSendDisabled = () => {
    const hasSignedTx = !!(window as any).signedTransaction;
    const needsSimulation = selectedFunction !== 'authorization' && !isSimulated;
    return !hasSignedTx || needsSimulation || txStatus.status === 'pending';
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

      {/* Function Selection */}
      <div className="bg-[#111111] border border-gray-800 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-5 h-5 text-gray-400" />
          <h3 className="text-lg font-semibold text-white">Тип операции</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {functions.map((func) => {
            const IconComponent = func.icon;
            return (
              <button
                key={func.id}
                onClick={() => {
                  setSelectedFunction(func.id);
                  resetSimulation();
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
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

      {/* Function Parameters */}
      {selectedFunction !== 'authorization' && (
        <div className="bg-[#111111] border border-gray-800 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-5 h-5 text-gray-400" />
            <h3 className="text-lg font-semibold text-white">Параметры функции</h3>
          </div>
          {renderFunctionInputs()}
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-3">
        <button
          onClick={() => handlePrepareAuthorization(selectedFunction !== 'authorization')}
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
              {selectedFunction === 'authorization' ? 'Подготовить авторизацию' : 'Подготовить авторизацию + функцию'}
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
              {selectedFunction === 'authorization' ? 'Отправить авторизацию' : 'Отправить авторизацию + функцию'}
            </>
          )}
        </button>

        {selectedFunction !== 'authorization' && isSimulated && (
          <button
            onClick={resetSimulation}
            className="w-full bg-[#222225] text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-[#2a2a2d] transition-colors flex items-center justify-center gap-2"
          >
            <Target className="w-4 h-4" />
            Новая симуляция
          </button>
        )}
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
    </div>
  );
};