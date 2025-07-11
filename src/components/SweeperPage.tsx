import React, { useState } from 'react';
import { Send, ArrowUpRight, Coins, Target, Loader2, CheckCircle, AlertCircle, ExternalLink, Copy, Trash2, Plus } from 'lucide-react';
import { ethers } from 'ethers';
import { useEnvWallet } from '../hooks/useEnvWallet';
import { tenderlySimulator } from '../utils/tenderly';

interface TransactionResult {
  hash: string | null;
  status: 'idle' | 'pending' | 'success' | 'error';
  message: string;
  simulationUrl?: string;
}

interface SequenceOperation {
  id: string;
  type: 'sendETH' | 'sweepETH' | 'sweepTokens' | 'executeCall';
  params: {
    ethAmount?: string;
    tokenAddress?: string;
    callTarget?: string;
    callData?: string;
  };
}

type FunctionType = 'sendETH' | 'sweepETH' | 'sweepTokens' | 'executeCall' | 'customSequence';

export const SweeperPage: React.FC = () => {
  const { relayerWallet, provider, relayerAddress } = useEnvWallet();
  const [contractAddress, setContractAddress] = useState('');
  const [selectedFunction, setSelectedFunction] = useState<FunctionType>('sendETH');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [tokenAddress, setTokenAddress] = useState('');
  const [callTarget, setCallTarget] = useState('');
  const [callData, setCallData] = useState('');
  const [ethAmount, setEthAmount] = useState('0');
  const [sequenceOperations, setSequenceOperations] = useState<SequenceOperation[]>([]);
  const [txResult, setTxResult] = useState<TransactionResult>({
    hash: null,
    status: 'idle',
    message: '',
  });

  // Sweeper contract ABI
  const sweeperABI = [
    "function sweepETH(uint256 amount) public",
    "function sweepTokens(address tokenAddress) public",
    "function executeCall(address target, bytes calldata data) external payable",
    "function multicall(address[] calldata targets, bytes[] calldata datas) external payable",
    "function fallbackETHReceiver() external payable",
  ];

  const functions = [
    { id: 'sendETH' as FunctionType, name: 'Send ETH', icon: Send },
    { id: 'sweepETH' as FunctionType, name: 'Sweep ETH', icon: ArrowUpRight },
    { id: 'sweepTokens' as FunctionType, name: 'Sweep Tokens', icon: Coins },
    { id: 'executeCall' as FunctionType, name: 'Execute Call', icon: Target },
    { id: 'customSequence' as FunctionType, name: 'Custom Sequence', icon: Plus },
  ];

  const isValidAddress = (address: string) => {
    return ethers.isAddress(address);
  };

  const executeContractFunction = async (functionName: string, params: any[] = [], value: string = '0') => {
    if (!relayerWallet || !provider || !contractAddress) {
      setTxResult({
        hash: null,
        status: 'error',
        message: 'Configuration incomplete',
      });
      return;
    }

    try {
      setTxResult({ hash: null, status: 'pending', message: `Executing ${functionName}...` });

      // Simulate with Tenderly if available
      let simulationResult = null;
      if (tenderlySimulator.isEnabled()) {
        const contract = new ethers.Contract(contractAddress, sweeperABI, relayerWallet);
        const functionData = contract.interface.encodeFunctionData(functionName, params);
        
        const network = await provider.getNetwork();
        simulationResult = await tenderlySimulator.simulateContractCall(
          Number(network.chainId),
          relayerAddress!,
          contractAddress,
          functionData,
          ethers.parseEther(value).toString(),
          200000
        );
      }

      const contract = new ethers.Contract(contractAddress, sweeperABI, relayerWallet);
      const tx = await contract[functionName](...params, {
        value: ethers.parseEther(value),
        gasLimit: 200000,
      });

      setTxResult({
        hash: tx.hash,
        status: 'success',
        message: `${functionName} executed successfully`,
        simulationUrl: simulationResult?.simulationUrl,
      });

    } catch (error) {
      console.error(`${functionName} failed:`, error);
      setTxResult({
        hash: null,
        status: 'error',
        message: error instanceof Error ? error.message : `${functionName} failed`,
      });
    }
  };

  const handleExecute = () => {
    switch (selectedFunction) {
      case 'sendETH':
        executeContractFunction('fallbackETHReceiver', [], ethAmount);
        break;
      case 'sweepETH':
        executeContractFunction('sweepETH', [ethers.parseEther(ethAmount || '0')]);
        break;
      case 'sweepTokens':
        if (!isValidAddress(tokenAddress)) {
          setTxResult({ hash: null, status: 'error', message: 'Invalid token address' });
          return;
        }
        executeContractFunction('sweepTokens', [tokenAddress]);
        break;
      case 'executeCall':
        if (!isValidAddress(callTarget)) {
          setTxResult({ hash: null, status: 'error', message: 'Invalid target address' });
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
    if (!relayerWallet || !provider || !contractAddress || sequenceOperations.length === 0) {
      setTxResult({ hash: null, status: 'error', message: 'Invalid sequence configuration' });
      return;
    }

    try {
      setTxResult({ hash: null, status: 'pending', message: 'Executing sequence...' });

      const contract = new ethers.Contract(contractAddress, sweeperABI, relayerWallet);
      const targets: string[] = [];
      const datas: string[] = [];
      let totalValue = BigInt(0);

      for (const operation of sequenceOperations) {
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
        gasLimit: 300000,
      });

      setTxResult({
        hash: tx.hash,
        status: 'success',
        message: `Sequence executed (${sequenceOperations.length} operations)`,
      });

    } catch (error) {
      console.error('Sequence failed:', error);
      setTxResult({
        hash: null,
        status: 'error',
        message: error instanceof Error ? error.message : 'Sequence failed',
      });
    }
  };

  const addOperation = (type: SequenceOperation['type']) => {
    const newOperation: SequenceOperation = {
      id: Date.now().toString(),
      type,
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
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

  const renderFunctionInputs = () => {
    switch (selectedFunction) {
      case 'sendETH':
      case 'sweepETH':
        return (
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">ETH Amount</label>
            <input
              type="number"
              step="0.001"
              value={ethAmount}
              onChange={(e) => setEthAmount(e.target.value)}
              placeholder="0.0"
              className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
          </div>
        );
      case 'sweepTokens':
        return (
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">Token Address</label>
            <input
              type="text"
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value)}
              placeholder="0x..."
              className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
            />
          </div>
        );
      case 'executeCall':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">Target Address</label>
              <input
                type="text"
                value={callTarget}
                onChange={(e) => setCallTarget(e.target.value)}
                placeholder="0x..."
                className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">Call Data</label>
              <textarea
                value={callData}
                onChange={(e) => setCallData(e.target.value)}
                placeholder="0x..."
                rows={2}
                className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">ETH Amount (optional)</label>
              <input
                type="number"
                step="0.001"
                value={ethAmount}
                onChange={(e) => setEthAmount(e.target.value)}
                placeholder="0.0"
                className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>
          </div>
        );
      case 'customSequence':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">Operations ({sequenceOperations.length})</span>
              <div className="flex gap-1">
                {['sendETH', 'sweepETH', 'sweepTokens', 'executeCall'].map((type) => (
                  <button
                    key={type}
                    onClick={() => addOperation(type as SequenceOperation['type'])}
                    className="px-2 py-1 bg-gray-700 text-gray-300 rounded text-xs hover:bg-gray-600 transition-colors"
                  >
                    +{type}
                  </button>
                ))}
              </div>
            </div>
            
            {sequenceOperations.length === 0 ? (
              <div className="text-center py-4 text-gray-500 text-sm">
                No operations added
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {sequenceOperations.map((operation, index) => (
                  <div key={operation.id} className="bg-gray-800/50 border border-gray-700 rounded p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-white">
                        {index + 1}. {operation.type}
                      </span>
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
                        placeholder="ETH Amount"
                        className="w-full px-2 py-1 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                      />
                    )}
                    
                    {operation.type === 'sweepTokens' && (
                      <input
                        type="text"
                        value={operation.params.tokenAddress || ''}
                        onChange={(e) => updateOperationParam(operation.id, 'tokenAddress', e.target.value)}
                        placeholder="Token Address"
                        className="w-full px-2 py-1 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-xs"
                      />
                    )}
                    
                    {operation.type === 'executeCall' && (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={operation.params.callTarget || ''}
                          onChange={(e) => updateOperationParam(operation.id, 'callTarget', e.target.value)}
                          placeholder="Target Address"
                          className="w-full px-2 py-1 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-xs"
                        />
                        <textarea
                          value={operation.params.callData || ''}
                          onChange={(e) => updateOperationParam(operation.id, 'callData', e.target.value)}
                          placeholder="Call Data"
                          rows={1}
                          className="w-full px-2 py-1 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-xs"
                        />
                        <input
                          type="number"
                          step="0.001"
                          value={operation.params.ethAmount || ''}
                          onChange={(e) => updateOperationParam(operation.id, 'ethAmount', e.target.value)}
                          placeholder="ETH Amount (optional)"
                          className="w-full px-2 py-1 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold text-white mb-2">Sweeper Contract</h1>
        <p className="text-gray-400">Execute contract functions via relayer</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Function Selection */}
        <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-white mb-3">Functions</h3>
          <div className="space-y-1">
            {functions.map((func) => {
              const IconComponent = func.icon;
              return (
                <button
                  key={func.id}
                  onClick={() => setSelectedFunction(func.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
                    selectedFunction === func.id
                      ? 'bg-blue-600 text-white'
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

        {/* Main Form */}
        <div className="lg:col-span-2 space-y-4">
          {/* Contract Address */}
          <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
            <label className="block text-xs font-medium text-gray-400 mb-2">Contract Address</label>
            <input
              type="text"
              value={contractAddress}
              onChange={(e) => setContractAddress(e.target.value)}
              placeholder="0x..."
              className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
            />
          </div>

          {/* Function Parameters */}
          <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-white mb-3">Parameters</h3>
            {renderFunctionInputs()}
          </div>

          {/* Execute Button */}
          <button
            onClick={handleExecute}
            disabled={
              !relayerWallet ||
              !provider ||
              !contractAddress ||
              !isValidAddress(contractAddress) ||
              txResult.status === 'pending'
            }
            className="w-full bg-blue-600 text-white py-2 px-4 rounded text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {txResult.status === 'pending' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Executing...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Execute
              </>
            )}
          </button>

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
                  View in Tenderly
                </a>
              )}
            </div>
          )}
        </div>

        {/* Sidebar Info */}
        <div className="space-y-4">
          <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-white mb-2">Contract Info</h3>
            {contractAddress ? (
              <div className="text-xs text-gray-400 font-mono break-all">{contractAddress}</div>
            ) : (
              <div className="text-xs text-gray-500">No contract selected</div>
            )}
          </div>

          <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-white mb-2">Function</h3>
            <div className="text-xs text-gray-400">
              {functions.find(f => f.id === selectedFunction)?.name || 'None selected'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};