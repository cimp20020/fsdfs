import React, { useState } from 'react';
import { Send, ArrowUpRight, Coins, Target, Loader2, CheckCircle, AlertCircle, ExternalLink, Copy, Trash2, Plus, Globe } from 'lucide-react';
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

type FunctionType = 'sendETH' | 'sweepETH' | 'sweepTokens' | 'executeCall' | 'customSequence';

export const SweeperPage: React.FC = () => {
  const { relayerWallet, provider, relayerAddress, chainId } = useEnvWallet();
  const [contractAddress, setContractAddress] = useState('');
  const [selectedFunction, setSelectedFunction] = useState<FunctionType>('sendETH');
  const [selectedNetwork, setSelectedNetwork] = useState<number>(chainId || 1);
  const [recipientAddress, setRecipientAddress] = useState('');
  const [tokenAddress, setTokenAddress] = useState('');
  const [callTarget, setCallTarget] = useState('');
  const [callData, setCallData] = useState('');
  const [ethAmount, setEthAmount] = useState('0');
  const [sequenceOperations, setSequenceOperations] = useState<SequenceOperation[]>([]);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [txResult, setTxResult] = useState<TransactionResult>({
    hash: null,
    status: 'idle',
    message: '',
  });
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [isSimulated, setIsSimulated] = useState(false);
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
    { id: 'sendETH' as FunctionType, name: 'Отправить ETH', icon: Send },
    { id: 'sweepETH' as FunctionType, name: 'Собрать ETH', icon: ArrowUpRight },
    { id: 'sweepTokens' as FunctionType, name: 'Собрать токены', icon: Coins },
    { id: 'executeCall' as FunctionType, name: 'Выполнить вызов', icon: Target },
    { id: 'customSequence' as FunctionType, name: 'Последовательность', icon: Plus },
  ];

  const isValidAddress = (address: string) => {
    return ethers.isAddress(address);
  };

  const handleSimulate = async () => {
    if (selectedFunction === 'customSequence') {
      await simulateFullSequence();
      return;
    }

    if (!relayerWallet || !provider || !contractAddress) {
      setTxResult({
        hash: null,
        status: 'error',
        message: 'Конфигурация неполная',
      });
      return;
    }

    try {
      setTxResult({ hash: null, status: 'pending', message: 'Запуск симуляции...' });
      setSimulationResult(null);
      setIsSimulated(false);

      let functionName = '';
      let params: any[] = [];
      let value = '0';

      switch (selectedFunction) {
        case 'sendETH':
          functionName = 'fallbackETHReceiver';
          params = [];
          value = ethAmount;
          break;
        case 'sweepETH':
          functionName = 'sweepETH';
          params = [ethers.parseEther(ethAmount || '0')];
          break;
        case 'sweepTokens':
          if (!isValidAddress(tokenAddress)) {
            setTxResult({ hash: null, status: 'error', message: 'Неверный адрес токена' });
            return;
          }
          functionName = 'sweepTokens';
          params = [tokenAddress];
          break;
        case 'executeCall':
          if (!isValidAddress(callTarget)) {
            setTxResult({ hash: null, status: 'error', message: 'Неверный целевой адрес' });
            return;
          }
          const dataBytes = callData.startsWith('0x') ? callData : '0x' + callData;
          functionName = 'executeCall';
          params = [callTarget, dataBytes];
          value = ethAmount;
          break;
        default:
          setTxResult({ hash: null, status: 'error', message: 'Неподдерживаемая функция' });
          return;
      }

      // Симуляция с Tenderly
      if (tenderlySimulator.isEnabled()) {
        const contract = new ethers.Contract(contractAddress, sweeperABI, relayerWallet);
        const functionData = contract.interface.encodeFunctionData(functionName, params);
        
        const network = await provider.getNetwork();
        const simulationResult = await tenderlySimulator.simulateContractCall(
          Number(network.chainId),
          relayerAddress!,
          contractAddress,
          functionData,
          ethers.parseEther(value).toString(),
          200000
        );
        
        setSimulationResult(simulationResult);
        setIsSimulated(true);
        
        if (simulationResult.success) {
          setTxResult({
            hash: null,
            status: 'success',
            message: 'Симуляция прошла успешно. Можно отправить транзакцию.',
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
        setTxResult({
          hash: null,
          status: 'error',
          message: 'Tenderly не настроен. Симуляция недоступна.',
        });
      }

    } catch (error) {
      console.error('Simulation failed:', error);
      setTxResult({
        hash: null,
        status: 'error',
        message: error instanceof Error ? error.message : 'Ошибка симуляции',
      });
    }
  };

  const executeContractFunction = async (functionName: string, params: any[] = [], value: string = '0') => {
    if (!relayerWallet || !provider || !contractAddress) {
      setTxResult({
        hash: null,
        status: 'error',
        message: 'Конфигурация неполная',
      });
      return;
    }

    try {
      setTxResult({ hash: null, status: 'pending', message: `Выполнение ${functionName}...` });

      const contract = new ethers.Contract(contractAddress, sweeperABI, relayerWallet);
      const tx = await contract[functionName](...params, {
        value: ethers.parseEther(value),
        gasLimit: getNetworkGasConfig(chainId || selectedNetwork)?.gasLimit || 200000,
      });

      setTxResult({
        hash: tx.hash,
        status: 'success',
        message: `${functionName} выполнен успешно`,
      });

    } catch (error) {
      console.error(`${functionName} failed:`, error);
      setTxResult({
        hash: null,
        status: 'error',
        message: error instanceof Error ? error.message : `Ошибка ${functionName}`,
      });
    }
  };

  const handleExecute = () => {
    if (!isSimulated || !simulationResult?.success) {
      setTxResult({
        hash: null,
        status: 'error',
        message: 'Сначала выполните успешную симуляцию',
      });
      return;
    }

    switch (selectedFunction) {
      case 'sendETH':
        executeContractFunction('fallbackETHReceiver', [], ethAmount);
        break;
      case 'sweepETH':
        executeContractFunction('sweepETH', [ethers.parseEther(ethAmount || '0')]);
        break;
      case 'sweepTokens':
        if (!isValidAddress(tokenAddress)) {
          setTxResult({ hash: null, status: 'error', message: 'Неверный адрес токена' });
          return;
        }
        executeContractFunction('sweepTokens', [tokenAddress]);
        break;
      case 'executeCall':
        if (!isValidAddress(callTarget)) {
          setTxResult({ hash: null, status: 'error', message: 'Неверный целевой адрес' });
          return;
        }
        const dataBytes = callData.startsWith('0x') ? callData : '0x' + callData;
        executeContractFunction('executeCall', [callTarget, dataBytes], ethAmount);
        break;
      case 'customSequence':
        executeCustomSequence();
        break;
    }
  };

  const executeCustomSequence = async () => {
    const enabledOperations = sequenceOperations.filter(op => op.enabled);
    if (!relayerWallet || !provider || !contractAddress || enabledOperations.length === 0) {
      setTxResult({ hash: null, status: 'error', message: 'Неверная конфигурация последовательности' });
      return;
    }

    try {
      setTxResult({ hash: null, status: 'pending', message: 'Выполнение последовательности...' });

      const contract = new ethers.Contract(contractAddress, sweeperABI, relayerWallet);
      const targets: string[] = [];
      const datas: string[] = [];
      let totalValue = BigInt(0);

      for (const operation of enabledOperations) {
        targets.push(contractAddress);
        
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

      const tx = await contract.multicall(targets, datas, {
        value: totalValue,
        gasLimit: (getNetworkGasConfig(chainId || selectedNetwork)?.gasLimit || 200000) + 100000,
      });

      setTxResult({
        hash: tx.hash,
        status: 'success',
        message: `Последовательность выполнена (${enabledOperations.length} операций)`,
      });

    } catch (error) {
      console.error('Sequence failed:', error);
      setTxResult({
        hash: null,
        status: 'error',
        message: error instanceof Error ? error.message : 'Ошибка последовательности',
      });
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
    
    // Trigger simulation after parameter update
    setTimeout(() => simulateOperation(id), 500);
  };

  const toggleOperation = (id: string) => {
    setSequenceOperations(prev => prev.map(op => 
      op.id === id 
        ? { ...op, enabled: !op.enabled }
        : op
    ));
  };

  const simulateOperation = async (operationId: string) => {
    const operation = sequenceOperations.find(op => op.id === operationId);
    if (!operation || !relayerWallet || !provider || !contractAddress) return;

    // Check if operation has required parameters
    const isValid = validateOperation(operation);
    if (!isValid) return;

    // Update simulation status to pending
    setSequenceOperations(prev => prev.map(op => 
      op.id === operationId 
        ? { ...op, simulationStatus: 'pending' }
        : op
    ));

    try {
      let functionName = '';
      let params: any[] = [];
      let value = '0';

      switch (operation.type) {
        case 'sendETH':
          functionName = 'fallbackETHReceiver';
          params = [];
          value = operation.params.ethAmount || '0';
          break;
        case 'sweepETH':
          functionName = 'sweepETH';
          params = [ethers.parseEther(operation.params.ethAmount || '0')];
          break;
        case 'sweepTokens':
          functionName = 'sweepTokens';
          params = [operation.params.tokenAddress];
          break;
        case 'executeCall':
          const dataBytes = operation.params.callData?.startsWith('0x') 
            ? operation.params.callData 
            : '0x' + (operation.params.callData || '');
          functionName = 'executeCall';
          params = [operation.params.callTarget, dataBytes];
          value = operation.params.ethAmount || '0';
          break;
      }

      if (tenderlySimulator.isEnabled()) {
        const contract = new ethers.Contract(contractAddress, sweeperABI, relayerWallet);
        const functionData = contract.interface.encodeFunctionData(functionName, params);
        
        const network = await provider.getNetwork();
        const simulationResult = await tenderlySimulator.simulateContractCall(
          Number(network.chainId),
          relayerAddress!,
          contractAddress,
          functionData,
          ethers.parseEther(value).toString(),
          100000
        );
        
        setSequenceOperations(prev => prev.map(op => 
          op.id === operationId 
            ? { 
                ...op, 
                simulationStatus: simulationResult.success ? 'success' : 'error',
                simulationError: simulationResult.error,
                enabled: simulationResult.success // Auto-disable failed operations
              }
            : op
        ));
      } else {
        // If Tenderly not available, assume success
        setSequenceOperations(prev => prev.map(op => 
          op.id === operationId 
            ? { ...op, simulationStatus: 'success' }
            : op
        ));
      }
    } catch (error) {
      setSequenceOperations(prev => prev.map(op => 
        op.id === operationId 
          ? { 
              ...op, 
              simulationStatus: 'error',
              simulationError: error instanceof Error ? error.message : 'Simulation failed',
              enabled: false // Auto-disable failed operations
            }
          : op
      ));
    }
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

  const simulateFullSequence = async () => {
    if (!relayerWallet || !provider || !contractAddress) return;

    const enabledOperations = sequenceOperations.filter(op => op.enabled);
    if (enabledOperations.length === 0) return;

    try {
      setTxResult({ hash: null, status: 'pending', message: 'Симуляция полной последовательности...' });

      const contract = new ethers.Contract(contractAddress, sweeperABI, relayerWallet);
      const targets: string[] = [];
      const datas: string[] = [];
      let totalValue = BigInt(0);

      for (const operation of enabledOperations) {
        targets.push(contractAddress);
        
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

      if (tenderlySimulator.isEnabled()) {
        const multicallData = contract.interface.encodeFunctionData('multicall', [targets, datas]);
        
        const network = await provider.getNetwork();
        const simulationResult = await tenderlySimulator.simulateContractCall(
          Number(network.chainId),
          relayerAddress!,
          contractAddress,
          multicallData,
          totalValue.toString(),
          (getNetworkGasConfig(chainId || selectedNetwork)?.gasLimit || 200000) + 100000
        );
        
        setSimulationResult(simulationResult);
        setIsSimulated(true);
        
        if (simulationResult.success) {
          setTxResult({
            hash: null,
            status: 'success',
            message: `Симуляция последовательности прошла успешно (${enabledOperations.length} операций)`,
            simulationUrl: simulationResult.simulationUrl,
          });
        } else {
          setTxResult({
            hash: null,
            status: 'error',
            message: `Симуляция последовательности не прошла: ${simulationResult.error}`,
            simulationUrl: simulationResult.simulationUrl,
          });
        }
      }
    } catch (error) {
      console.error('Full sequence simulation failed:', error);
      setTxResult({
        hash: null,
        status: 'error',
        message: error instanceof Error ? error.message : 'Ошибка симуляции последовательности',
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedItem('transaction-hash');
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
    switch (txResult.status) {
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
                   disabled={!contractAddress || !isValidAddress(contractAddress)}
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
                          onClick={() => simulateOperation(operation.id)}
                          disabled={operation.simulationStatus === 'pending' || !validateOperation(operation)}
                          className="text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Симулировать операцию"
                        >
                          <Target className="w-3 h-3" />
                        </button>
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

  const isSimulateDisabled = () => {
    if (!relayerWallet || !provider || !contractAddress || !isValidAddress(contractAddress) || txResult.status === 'pending') {
      return true;
    }

    switch (selectedFunction) {
      case 'sweepTokens':
        return !tokenAddress || !isValidAddress(tokenAddress);
      case 'executeCall':
        return !callTarget || !isValidAddress(callTarget);
      case 'customSequence':
        return sequenceOperations.filter(op => op.enabled).length === 0;
      default:
        return false;
    }
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
                  {network.name} ({network.currency})
                </option>
              ))}
            </select>
          </div>

          {/* Contract Address */}
          <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
            <label className="block text-xs font-medium text-gray-400 mb-2">Адрес контракта</label>
            <input
              type="text"
              value={contractAddress}
              onChange={(e) => setContractAddress(e.target.value)}
              placeholder="0x..."
              className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-sm"
            />
            {contractAddress && !isValidAddress(contractAddress) && (
              <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded">
                <p className="text-red-400 text-xs flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Неверный формат адреса Ethereum
                </p>
              </div>
            )}
          </div>

          {/* Function Parameters */}
          <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-white mb-3">Параметры</h3>
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
                {txResult.status === 'pending' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Симуляция...
                  </>
                ) : (
                  <>
                    <Target className="w-4 h-4" />
                    Симулировать
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
                      Отправить транзакцию
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
                    onClick={() => copyToClipboard(txResult.hash!)}
                    className="p-1 text-gray-400 hover:text-white rounded transition-colors"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  {(() => {
                    const txUrl = getTransactionUrl(txResult.hash, chainId || selectedNetwork);
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