import React, { useState, useEffect } from 'react';
import { Shield, Send, Trash2, RefreshCw, Coins, ArrowUpRight, AlertCircle, CheckCircle, Loader2, Copy, ExternalLink, Wallet, Zap, Target, Settings, Eye, DollarSign, Globe } from 'lucide-react';
import { ethers } from 'ethers';
import { useEnvWallet } from '../hooks/useEnvWallet';
import { tenderlySimulator } from '../utils/tenderly';
import { SimulationModal } from './SimulationModal';

interface TransactionResult {
  hash: string | null;
  status: 'idle' | 'pending' | 'success' | 'error';
  message: string;
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

interface DelegationInfo {
  isChecking: boolean;
  delegatedAddress: string | null;
  isMatching: boolean | null;
  error: string | null;
}

type FunctionType = 'sendETH' | 'sweepETH' | 'sweepTokens' | 'executeCall' | 'customSequence';

interface NetworkConfig {
  id: number;
  name: string;
  explorerUrl: string;
  nativeCurrency: string;
}

const NETWORKS: NetworkConfig[] = [
  {
    id: 56,
    name: 'BSC Mainnet',
    explorerUrl: 'https://bscscan.com',
    nativeCurrency: 'BNB'
  },
  {
    id: 1,
    name: 'Ethereum Mainnet',
    explorerUrl: 'https://etherscan.io',
    nativeCurrency: 'ETH'
  },
  {
    id: 11155111,
    name: 'Sepolia Testnet',
    explorerUrl: 'https://sepolia.etherscan.io',
    nativeCurrency: 'ETH'
  },
  {
    id: 42161,
    name: 'Arbitrum One',
    explorerUrl: 'https://arbiscan.io',
    nativeCurrency: 'ETH'
  },
  {
    id: 8453,
    name: 'Base Mainnet',
    explorerUrl: 'https://basescan.org',
    nativeCurrency: 'ETH'
  },
  {
    id: 137,
    name: 'Polygon Mainnet',
    explorerUrl: 'https://polygonscan.com',
    nativeCurrency: 'MATIC'
  },
  {
    id: 10,
    name: 'Optimism Mainnet',
    explorerUrl: 'https://optimistic.etherscan.io',
    nativeCurrency: 'ETH'
  }
];

export const ContractInteraction: React.FC = () => {
  const { relayerWallet, provider, relayerBalance, relayerAddress } = useEnvWallet();
  const [contractAddress, setContractAddress] = useState('');
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkConfig>(NETWORKS[0]);
  const [selectedFunction, setSelectedFunction] = useState<FunctionType | null>(null);
  const [recipientAddress, setRecipientAddress] = useState('');
  const [tokenAddress, setTokenAddress] = useState('');
  const [callTarget, setCallTarget] = useState('');
  const [callData, setCallData] = useState('');
  const [ethAmount, setEthAmount] = useState('0');
  const [sequenceOperations, setSequenceOperations] = useState<SequenceOperation[]>([]);
  const [delegationInfo, setDelegationInfo] = useState<DelegationInfo>({
    isChecking: false,
    delegatedAddress: null,
    isMatching: null,
    error: null
  });
  const [txResult, setTxResult] = useState<TransactionResult>({
    hash: null,
    status: 'idle',
    message: '',
  });
  const [showSimulation, setShowSimulation] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [pendingExecution, setPendingExecution] = useState<(() => void) | null>(null);

  const [showFunctionPopup, setShowFunctionPopup] = useState(false);

  // Check delegation when contract address changes
  useEffect(() => {
    if (contractAddress && isValidAddress(contractAddress) && provider) {
      checkDelegation();
    } else {
      setDelegationInfo({
        isChecking: false,
        delegatedAddress: null,
        isMatching: null,
        error: null
      });
    }
  }, [contractAddress, provider]);

  const checkDelegation = async () => {
    if (!provider || !contractAddress) return;

    setDelegationInfo(prev => ({ ...prev, isChecking: true, error: null }));

    try {
      // Get the code at the contract address to check if it's delegated
      const code = await provider.getCode(contractAddress);
      
      if (code === '0x') {
        setDelegationInfo({
          isChecking: false,
          delegatedAddress: null,
          isMatching: false,
          error: 'No contract found at this address'
        });
        return;
      }

      // For EIP-7702, we need to check the account's delegation
      // This is a simplified check - in reality, you'd need to query the delegation storage
      try {
        // Try to get delegation info from storage slot
        const delegationSlot = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const delegationData = await provider.getStorage(contractAddress, delegationSlot);
        
        if (delegationData && delegationData !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
          // Extract address from storage (last 20 bytes)
          const delegatedAddr = '0x' + delegationData.slice(-40);
          const expectedDelegate = import.meta.env.VITE_DELEGATE_CONTRACT_ADDRESS?.toLowerCase();
          
          setDelegationInfo({
            isChecking: false,
            delegatedAddress: delegatedAddr,
            isMatching: expectedDelegate ? delegatedAddr.toLowerCase() === expectedDelegate : null,
            error: null
          });
        } else {
          setDelegationInfo({
            isChecking: false,
            delegatedAddress: null,
            isMatching: false,
            error: 'No delegation found'
          });
        }
      } catch (storageError) {
        // Fallback: assume it's a regular contract
        setDelegationInfo({
          isChecking: false,
          delegatedAddress: 'Contract detected',
          isMatching: null,
          error: null
        });
      }
    } catch (error) {
      console.error('Failed to check delegation:', error);
      setDelegationInfo({
        isChecking: false,
        delegatedAddress: null,
        isMatching: null,
        error: 'Failed to check delegation'
      });
    }
  };

  // Sweeper contract ABI
  const sweeperABI = [
    "function recipient() external view returns (address)",
    "function sweepETH(uint256 amount) public",
    "function sweepTokens(address tokenAddress) public",
    "function executeCall(address target, bytes calldata data) external payable",
    "function multicall(address[] calldata targets, bytes[] calldata datas) external payable",
    "function destroyContract() external",
    "function fallbackETHReceiver() external payable",
    "event CallExecuted(address target, bytes data, bool success)",
    "event TokenTransfer(address token, uint256 amount, bool success)",
    "event ETHTransfer(uint256 amount, bool success)",
    "event FailedTransfer()"
  ];

  const functions = [
    {
      id: 'sendETH' as FunctionType,
      name: 'Send ETH',
      description: 'Send ETH to the proxy contract',
      icon: Send,
      color: 'blue',
      dangerous: false
    },
    {
      id: 'sweepETH' as FunctionType,
      name: 'Sweep ETH',
      description: 'Extract ETH from proxy to recipient',
      icon: ArrowUpRight,
      color: 'green',
      dangerous: false
    },
    {
      id: 'sweepTokens' as FunctionType,
      name: 'Sweep Tokens',
      description: 'Extract tokens from proxy contract',
      icon: Coins,
      color: 'purple',
      dangerous: false
    },
    {
      id: 'executeCall' as FunctionType,
      name: 'Execute Call',
      description: 'Execute custom contract call',
      icon: Target,
      color: 'orange',
      dangerous: false
    },
    {
      id: 'customSequence' as FunctionType,
      name: 'Custom Sequence',
      description: 'Execute multiple operations in sequence',
      icon: Settings,
      color: 'blue',
      dangerous: false
    },
  ];

  const isValidAddress = (address: string) => {
    return ethers.isAddress(address);
  };

  const executeContractFunction = async (functionName: string, params: any[] = [], value: string = '0') => {
    if (!relayerWallet || !provider || !contractAddress) {
      setTxResult({
        hash: null,
        status: 'error',
        message: 'Relayer wallet or contract not configured',
      });
      return;
    }

    try {
      setTxResult({ hash: null, status: 'pending', message: `Executing ${functionName}...` });

      const contract = new ethers.Contract(contractAddress, sweeperABI, relayerWallet);
      
      const tx = await contract[functionName](...params, {
        value: ethers.parseEther(value),
        gasLimit: 200000,
      });

      setTxResult({
        hash: tx.hash,
        status: 'pending',
        message: `Transaction sent: ${functionName}`,
      });

      const receipt = await tx.wait();
      
      setTxResult({
        hash: tx.hash,
        status: 'success',
        message: `${functionName} executed successfully!`,
      });

      console.log(`${functionName} transaction:`, receipt);

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
    // First run simulation if Tenderly is configured
    if (tenderlySimulator.isEnabled()) {
      runSimulation(() => executeFunction());
    } else {
      // Execute directly if no simulation
      executeFunction();
    }
  };

  const runSimulation = async (executionCallback: () => void) => {
    if (!relayerWallet || !provider || !contractAddress || !selectedFunction) {
      setTxResult({
        hash: null,
        status: 'error',
        message: 'Configuration incomplete for simulation',
      });
      return;
    }

    setIsSimulating(true);
    setShowSimulation(true);
    setPendingExecution(() => executionCallback);

    try {
      let simulationData = '0x';
      let simulationValue = '0';
      let gasLimit = 200000;

      // Prepare simulation data based on function type
      const contract = new ethers.Contract(contractAddress, sweeperABI, relayerWallet);

      switch (selectedFunction) {
        case 'sendETH':
          simulationData = '0x'; // Fallback function
          simulationValue = ethers.parseEther(ethAmount || '0').toString();
          break;
        case 'sweepETH':
          simulationData = contract.interface.encodeFunctionData('sweepETH', [ethers.parseEther(ethAmount || '0')]);
          break;
        case 'sweepTokens':
          simulationData = contract.interface.encodeFunctionData('sweepTokens', [tokenAddress]);
          break;
        case 'executeCall':
          let callDataBytes = callData.startsWith('0x') ? callData : '0x' + callData;
          simulationData = contract.interface.encodeFunctionData('executeCall', [callTarget, callDataBytes]);
          simulationValue = ethers.parseEther(ethAmount || '0').toString();
          break;
        case 'customSequence':
          // Prepare multicall data
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
                let operationCallData = operation.params.callData || '0x';
                if (!operationCallData.startsWith('0x')) {
                  operationCallData = '0x' + operationCallData;
                }
                datas.push(contract.interface.encodeFunctionData('executeCall', [
                  operation.params.callTarget,
                  operationCallData
                ]));
                if (operation.params.ethAmount) {
                  totalValue += ethers.parseEther(operation.params.ethAmount);
                }
                break;
            }
          }
          
          simulationData = contract.interface.encodeFunctionData('multicall', [targets, datas]);
          simulationValue = totalValue.toString();
          gasLimit = 300000;
          break;
      }

      const result = await tenderlySimulator.simulateContractCall(
        selectedNetwork.id,
        relayerAddress,
        contractAddress,
        simulationData,
        simulationValue,
        gasLimit
      );

      setSimulationResult(result);
    } catch (error) {
      console.error('Simulation failed:', error);
      setSimulationResult({
        success: false,
        error: error instanceof Error ? error.message : 'Simulation failed'
      });
    } finally {
      setIsSimulating(false);
    }
  };

  const handleSimulationProceed = () => {
    setShowSimulation(false);
    if (pendingExecution) {
      pendingExecution();
      setPendingExecution(null);
    }
  };

  const handleSimulationCancel = () => {
    setShowSimulation(false);
    setPendingExecution(null);
    setSimulationResult(null);
  };

  const executeFunction = () => {
    if (!selectedFunction) return;

    switch (selectedFunction) {
      case 'sendETH':
        const amount = ethAmount || '0';
        executeContractFunction('fallbackETHReceiver', [], amount);
        break;
      case 'sweepETH':
        const sweepAmount = ethAmount || '0';
        executeContractFunction('sweepETH', [ethers.parseEther(sweepAmount)]);
        break;
      case 'sweepTokens':
        if (!isValidAddress(tokenAddress)) {
          setTxResult({
            hash: null,
            status: 'error',
            message: 'Invalid token address',
          });
          return;
        }
        executeContractFunction('sweepTokens', [tokenAddress]);
        break;
      case 'executeCall':
        if (!isValidAddress(callTarget)) {
          setTxResult({
            hash: null,
            status: 'error',
            message: 'Invalid target address',
          });
          return;
        }
        let dataBytes;
        try {
          dataBytes = callData.startsWith('0x') ? callData : '0x' + callData;
          if (dataBytes.length % 2 !== 0) {
            throw new Error('Invalid hex data');
          }
        } catch {
          setTxResult({
            hash: null,
            status: 'error',
            message: 'Invalid call data format',
          });
          return;
        }
        const callAmount = ethAmount || '0';
        executeContractFunction('executeCall', [callTarget, dataBytes], callAmount);
        break;
      case 'customSequence':
        if (sequenceOperations.length === 0) {
          setTxResult({
            hash: null,
            status: 'error',
            message: 'No operations in sequence',
          });
          return;
        }
        
        // Validate all operations
        for (const operation of sequenceOperations) {
          if (operation.type === 'sweepTokens' && !isValidAddress(operation.params.tokenAddress || '')) {
            setTxResult({
              hash: null,
              status: 'error',
              message: 'Invalid token address in sequence',
            });
            return;
          }
          if (operation.type === 'executeCall' && !isValidAddress(operation.params.callTarget || '')) {
            setTxResult({
              hash: null,
              status: 'error',
              message: 'Invalid target address in sequence',
            });
            return;
          }
        }
        
        // Execute custom sequence
        executeCustomSequence();
        break;
    }
  };

  const executeCustomSequence = async () => {
    if (!relayerWallet || !provider || !contractAddress) {
      setTxResult({
        hash: null,
        status: 'error',
        message: 'Relayer wallet or contract not configured',
      });
      return;
    }

    try {
      setTxResult({ hash: null, status: 'pending', message: 'Executing custom sequence...' });

      const contract = new ethers.Contract(contractAddress, sweeperABI, relayerWallet);
      
      // Prepare multicall data
      const targets: string[] = [];
      const datas: string[] = [];
      let totalValue = BigInt(0);
      
      for (const operation of sequenceOperations) {
        targets.push(contractAddress); // All calls go to the same contract
        
        switch (operation.type) {
          case 'sendETH':
            // For sending ETH, we use fallbackETHReceiver
            datas.push('0x'); // Empty data for fallback
            if (operation.params.ethAmount) {
              totalValue += ethers.parseEther(operation.params.ethAmount);
            }
            break;
            
          case 'sweepETH':
            const sweepAmount = operation.params.ethAmount || '0';
            const sweepData = contract.interface.encodeFunctionData('sweepETH', [ethers.parseEther(sweepAmount)]);
            datas.push(sweepData);
            break;
            
          case 'sweepTokens':
            const tokenData = contract.interface.encodeFunctionData('sweepTokens', [operation.params.tokenAddress]);
            datas.push(tokenData);
            break;
            
          case 'executeCall':
            let callDataBytes = operation.params.callData || '0x';
            if (!callDataBytes.startsWith('0x')) {
              callDataBytes = '0x' + callDataBytes;
            }
            const executeData = contract.interface.encodeFunctionData('executeCall', [
              operation.params.callTarget,
              callDataBytes
            ]);
            datas.push(executeData);
            if (operation.params.ethAmount) {
              totalValue += ethers.parseEther(operation.params.ethAmount);
            }
            break;
        }
      }
      
      console.log('Custom sequence prepared:', {
        operations: sequenceOperations.length,
        targets: targets.length,
        datas: datas.length,
        totalValue: ethers.formatEther(totalValue)
      });
      
      // Execute multicall
      const tx = await contract.multicall(targets, datas, {
        value: totalValue,
        gasLimit: 300000, // Higher gas limit for multiple operations
      });

      setTxResult({
        hash: tx.hash,
        status: 'pending',
        message: `Custom sequence sent (${sequenceOperations.length} operations)`,
      });

      const receipt = await tx.wait();
      
      setTxResult({
        hash: tx.hash,
        status: 'success',
        message: `Custom sequence executed successfully! (${sequenceOperations.length} operations)`,
      });

      console.log('Custom sequence transaction:', receipt);

    } catch (error) {
      console.error('Custom sequence failed:', error);
      setTxResult({
        hash: null,
        status: 'error',
        message: error instanceof Error ? error.message : 'Custom sequence failed',
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatBalance = (balance: string) => {
    const eth = parseFloat(balance);
    return { eth: eth.toFixed(4) };
  };

  const getStatusIcon = () => {
    switch (txResult.status) {
      case 'pending':
        return <Loader2 className="w-4 h-4 animate-spin" />;
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
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'success':
        return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'error':
        return 'bg-red-500/10 text-red-400 border-red-500/20';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
  };

  const isReady = !!(relayerWallet && provider && contractAddress && isValidAddress(contractAddress));

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

  const moveOperation = (fromIndex: number, toIndex: number) => {
    setSequenceOperations(prev => {
      const newOperations = [...prev];
      const [movedItem] = newOperations.splice(fromIndex, 1);
      newOperations.splice(toIndex, 0, movedItem);
      return newOperations;
    });
  };

  const getOperationName = (type: SequenceOperation['type']) => {
    switch (type) {
      case 'sendETH': return 'Send ETH';
      case 'sweepETH': return 'Sweep ETH';
      case 'sweepTokens': return 'Sweep Tokens';
      case 'executeCall': return 'Execute Call';
    }
  };

  const getOperationIcon = (type: SequenceOperation['type']) => {
    switch (type) {
      case 'sendETH': return Send;
      case 'sweepETH': return ArrowUpRight;
      case 'sweepTokens': return Coins;
      case 'executeCall': return Target;
    }
  };

  const renderFunctionInputs = () => {
    if (!selectedFunction) return null;

    switch (selectedFunction) {
      case 'sendETH':
      case 'sweepETH':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                ETH Amount
              </label>
              <input
                type="number"
                step="0.001"
                value={ethAmount}
                onChange={(e) => setEthAmount(e.target.value)}
                placeholder="0.0"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>
          </div>
        );
      case 'sweepTokens':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Token Contract Address
              </label>
              <input
                type="text"
                value={tokenAddress}
                onChange={(e) => setTokenAddress(e.target.value)}
                placeholder="0x... Token contract address"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 font-mono text-sm"
              />
            </div>
          </div>
        );
      case 'executeCall':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Target Contract Address
              </label>
              <input
                type="text"
                value={callTarget}
                onChange={(e) => setCallTarget(e.target.value)}
                placeholder="0x... Target contract address"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Call Data (hex)
              </label>
              <textarea
                value={callData}
                onChange={(e) => setCallData(e.target.value)}
                placeholder="0x... or hex without 0x prefix"
                rows={2}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                ETH Amount (optional)
              </label>
              <input
                type="number"
                step="0.001"
                value={ethAmount}
                onChange={(e) => setEthAmount(e.target.value)}
                placeholder="0.0"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>
          </div>
        );
      case 'customSequence':
        return (
          <div className="space-y-4">
            {/* Add Operation Buttons */}
            <div>
              <h5 className="text-white font-medium mb-3">Add Operations</h5>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => addOperation('sendETH')}
                  className="flex items-center gap-2 bg-blue-600/20 border border-blue-500/30 rounded-lg px-3 py-2 text-blue-400 hover:bg-blue-600/30 transition-colors text-sm"
                >
                  <Send className="w-4 h-4" />
                  Add Send ETH
                </button>
                <button
                  onClick={() => addOperation('sweepETH')}
                  className="flex items-center gap-2 bg-green-600/20 border border-green-500/30 rounded-lg px-3 py-2 text-green-400 hover:bg-green-600/30 transition-colors text-sm"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  Add Sweep ETH
                </button>
                <button
                  onClick={() => addOperation('sweepTokens')}
                  className="flex items-center gap-2 bg-purple-600/20 border border-purple-500/30 rounded-lg px-3 py-2 text-purple-400 hover:bg-purple-600/30 transition-colors text-sm"
                >
                  <Coins className="w-4 h-4" />
                  Add Sweep Tokens
                </button>
                <button
                  onClick={() => addOperation('executeCall')}
                  className="flex items-center gap-2 bg-orange-600/20 border border-orange-500/30 rounded-lg px-3 py-2 text-orange-400 hover:bg-orange-600/30 transition-colors text-sm"
                >
                  <Target className="w-4 h-4" />
                  Add Execute Call
                </button>
              </div>
            </div>

            {/* Operations List */}
            {sequenceOperations.length > 0 && (
              <div>
                <h5 className="text-white font-medium mb-3">Operation Sequence ({sequenceOperations.length})</h5>
                <div className="space-y-3">
                  {sequenceOperations.map((operation, index) => {
                    const IconComponent = getOperationIcon(operation.type);
                    return (
                      <div key={operation.id} className="bg-gray-700/50 border border-gray-600 rounded-lg p-3">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 bg-blue-500/20 rounded-full flex items-center justify-center text-xs text-blue-400 font-medium">
                              {index + 1}
                            </span>
                            <IconComponent className="w-4 h-4 text-gray-400" />
                            <span className="text-white font-medium text-sm">{getOperationName(operation.type)}</span>
                          </div>
                          <div className="flex-1" />
                          <div className="flex items-center gap-1">
                            {index > 0 && (
                              <button
                                onClick={() => moveOperation(index, index - 1)}
                                className="p-1 text-gray-400 hover:text-white transition-colors"
                                title="Move up"
                              >
                                ↑
                              </button>
                            )}
                            {index < sequenceOperations.length - 1 && (
                              <button
                                onClick={() => moveOperation(index, index + 1)}
                                className="p-1 text-gray-400 hover:text-white transition-colors"
                                title="Move down"
                              >
                                ↓
                              </button>
                            )}
                            <button
                              onClick={() => removeOperation(operation.id)}
                              className="p-1 text-red-400 hover:text-red-300 transition-colors"
                              title="Remove operation"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Operation Parameters */}
                        <div className="space-y-2">
                          {(operation.type === 'sendETH' || operation.type === 'sweepETH') && (
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                ETH Amount
                              </label>
                              <input
                                type="number"
                                step="0.001"
                                value={operation.params.ethAmount || ''}
                                onChange={(e) => updateOperationParam(operation.id, 'ethAmount', e.target.value)}
                                placeholder="0.0"
                                className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                              />
                            </div>
                          )}
                          
                          {operation.type === 'sweepTokens' && (
                            <div>
                              <label className="block text-xs font-medium text-gray-300 mb-1">
                                Token Contract Address
                              </label>
                              <input
                                type="text"
                                value={operation.params.tokenAddress || ''}
                                onChange={(e) => updateOperationParam(operation.id, 'tokenAddress', e.target.value)}
                                placeholder="0x... Token address"
                                className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-sm"
                              />
                            </div>
                          )}
                          
                          {operation.type === 'executeCall' && (
                            <>
                              <div>
                                <label className="block text-xs font-medium text-gray-300 mb-1">
                                  Target Contract Address
                                </label>
                                <input
                                  type="text"
                                  value={operation.params.callTarget || ''}
                                  onChange={(e) => updateOperationParam(operation.id, 'callTarget', e.target.value)}
                                  placeholder="0x... Target address"
                                  className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-300 mb-1">
                                  Call Data (hex)
                                </label>
                                <textarea
                                  value={operation.params.callData || ''}
                                  onChange={(e) => updateOperationParam(operation.id, 'callData', e.target.value)}
                                  placeholder="0x... or hex without 0x"
                                  rows={2}
                                  className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-300 mb-1">
                                  ETH Amount (optional)
                                </label>
                                <input
                                  type="number"
                                  step="0.001"
                                  value={operation.params.ethAmount || ''}
                                  onChange={(e) => updateOperationParam(operation.id, 'ethAmount', e.target.value)}
                                  placeholder="0.0"
                                  className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                                />
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {sequenceOperations.length === 0 && (
              <div className="text-center py-6 bg-gray-700/30 rounded-lg border border-gray-600">
                <Settings className="w-8 h-8 text-gray-500 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">No operations added yet</p>
                <p className="text-gray-500 text-xs">Use the buttons above to add operations to your sequence</p>
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl">
      {/* Header */}
      <div className="p-6 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
            <Shield className="w-6 h-6 text-white drop-shadow-sm" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Sweeper Contract</h2>
            <p className="text-base text-zinc-400">Execute contract functions via relayer</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="space-y-8">
          {/* Contract Address Input - Always Visible */}
          <div>
            <label className="block text-base font-semibold text-white mb-3">
              Proxy Contract Address
            </label>
            <div className="relative">
              <input
                type="text"
                value={contractAddress}
                onChange={(e) => setContractAddress(e.target.value)}
                placeholder="0x... Enter proxy contract address"
                className="w-full px-6 py-4 bg-black border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-base transition-all duration-200"
              />
              {contractAddress && (
                <button
                  onClick={() => copyToClipboard(contractAddress)}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 p-2 text-zinc-400 hover:text-zinc-300 rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  <Copy className="w-5 h-5" />
                </button>
              )}
            </div>
            
            {contractAddress && !isValidAddress(contractAddress) && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mt-3">
                <div className="flex items-center gap-3 text-red-400">
                  <AlertCircle className="w-5 h-5" />
                  <span className="font-medium">Invalid address format</span>
                </div>
              </div>
            )}
          </div>

          {/* Contract Status and Actions */}
          {!contractAddress || !isValidAddress(contractAddress) ? (
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-gradient-to-br from-green-500/20 to-emerald-600/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Shield className="w-10 h-10 text-green-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">Enter Contract Address</h3>
              <p className="text-zinc-400 text-lg">Enter a valid proxy contract address above to access sweeper functions.</p>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-gradient-to-br from-green-500/20 to-emerald-600/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Shield className="w-10 h-10 text-green-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">Contract Ready</h3>
              <p className="text-zinc-400 mb-6 text-lg">
                Contract: {truncateAddress(contractAddress)}
              </p>
              <button
                onClick={() => setShowFunctionPopup(true)}
                className="bg-gradient-to-r from-green-500 to-emerald-600 text-white py-4 px-8 rounded-xl font-semibold hover:from-green-600 hover:to-emerald-700 transition-all duration-200 transform hover:scale-105 shadow-lg"
              >
                Open Functions
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Function Execution Popup */}
      {showFunctionPopup && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Popup Header */}
            <div className="p-8 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
                  <Shield className="w-6 h-6 text-white drop-shadow-sm" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Sweeper Functions</h2>
                  <p className="text-base text-zinc-400">Contract: {truncateAddress(contractAddress)}</p>
                </div>
              </div>
              <button
                onClick={() => setShowFunctionPopup(false)}
                className="p-3 text-zinc-400 hover:text-zinc-300 transition-colors rounded-xl hover:bg-zinc-800"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Popup Content */}
            <div className="p-8 space-y-8">
              {/* Network Selection */}
              <div className="bg-black/50 rounded-xl p-6 border border-zinc-800">
                <div className="flex items-center gap-3 mb-6">
                  <Globe className="w-6 h-6 text-blue-400" />
                  <h4 className="text-white font-semibold text-lg">Network Selection</h4>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {NETWORKS.map((network) => (
                    <button
                      key={network.id}
                      onClick={() => setSelectedNetwork(network)}
                      className={`p-4 rounded-xl border transition-all duration-200 text-left ${
                        selectedNetwork.id === network.id
                          ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                          : 'bg-zinc-800/50 border-zinc-700 text-zinc-300 hover:bg-blue-500/10 hover:border-blue-500/30'
                      }`}
                    >
                      <div className="font-semibold text-base">{network.name}</div>
                      <div className="text-sm opacity-75">Chain ID: {network.id}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Transaction Status */}
              {txResult.message && (
                <div className={`p-5 rounded-xl border ${getStatusColor()}`}>
                  <div className="flex items-center gap-3">
                    {getStatusIcon()}
                    <span className="text-base font-semibold">{txResult.message}</span>
                  </div>
                  {txResult.hash && (
                    <div className="mt-3 flex items-center gap-3">
                      <span className="text-sm font-mono break-all text-zinc-400">{txResult.hash}</span>
                      <button
                        onClick={() => copyToClipboard(txResult.hash!)}
                        className="p-2 text-zinc-400 hover:text-zinc-300 rounded-lg hover:bg-zinc-800 transition-colors"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <a
                        href={`${selectedNetwork.explorerUrl}/tx/${txResult.hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-zinc-400 hover:text-zinc-300 rounded-lg hover:bg-zinc-800 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Function Selection */}
              <div>
                <h3 className="text-xl font-bold text-white mb-6">Contract Functions</h3>
                <div className="grid grid-cols-1 gap-4">
                  {functions.map((func) => {
                    const IconComponent = func.icon;
                    const isSelected = selectedFunction === func.id;
                    const colorClasses = {
                      blue: isSelected ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-zinc-800/50 border-zinc-700 text-zinc-300 hover:bg-blue-500/10 hover:border-blue-500/30',
                      green: isSelected ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'bg-zinc-800/50 border-zinc-700 text-zinc-300 hover:bg-green-500/10 hover:border-green-500/30',
                      purple: isSelected ? 'bg-purple-500/20 border-purple-500/50 text-purple-400' : 'bg-zinc-800/50 border-zinc-700 text-zinc-300 hover:bg-purple-500/10 hover:border-purple-500/30',
                      orange: isSelected ? 'bg-orange-500/20 border-orange-500/50 text-orange-400' : 'bg-zinc-800/50 border-zinc-700 text-zinc-300 hover:bg-orange-500/10 hover:border-orange-500/30',
                    };

                    return (
                      <button
                        key={func.id}
                        onClick={() => setSelectedFunction(func.id)}
                        className={`p-5 rounded-xl border transition-all duration-200 text-left ${colorClasses[func.color as keyof typeof colorClasses]}`}
                      >
                        <div className="flex items-center gap-4">
                          <IconComponent className="w-6 h-6" />
                          <div className="flex-1">
                            <div className="font-semibold text-lg">{func.name}</div>
                            <div className="text-base opacity-75">{func.description}</div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Function Inputs */}
              {selectedFunction && (
                <div className="bg-black/50 rounded-xl p-6 border border-zinc-800">
                  <h4 className="text-white font-semibold mb-6 text-lg">
                    {functions.find(f => f.id === selectedFunction)?.name} Parameters
                  </h4>
                  {renderFunctionInputs()}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-4 pt-6">
                <button
                  onClick={() => setShowFunctionPopup(false)}
                  className="flex-1 bg-zinc-700 text-white py-4 px-6 rounded-xl font-semibold hover:bg-zinc-600 transition-all duration-200"
                >
                  Cancel
                </button>
                {selectedFunction && (
                  <button
                    onClick={handleExecute}
                    disabled={!isReady || txResult.status === 'pending'}
                    className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white py-4 px-6 rounded-xl font-semibold hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-3 transform hover:scale-105 shadow-lg"
                  >
                    {txResult.status === 'pending' ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      <Zap className="w-6 h-6" />
                    )}
                    {txResult.status === 'pending' ? 'Executing...' : 'Execute Function'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Simulation Modal */}
      <SimulationModal
        isOpen={showSimulation}
        onClose={handleSimulationCancel}
        onProceed={handleSimulationProceed}
        result={simulationResult}
        isLoading={isSimulating}
        transactionType={`Sweeper Contract - ${selectedFunction ? functions.find(f => f.id === selectedFunction)?.name : 'Unknown'}`}
      />
    </div>
  );
};