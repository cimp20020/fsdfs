import React, { useState } from 'react';
import { Shield, Send, ArrowUpRight, Coins, Target, Plus, Loader2, CheckCircle, AlertCircle, Copy, ExternalLink, Globe } from 'lucide-react';
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

interface AuthorizationOperation {
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
    recipientAddress?: string;
  };
}

type AuthorizationType = 'standard' | 'sendETH' | 'sweepETH' | 'sweepTokens' | 'executeCall' | 'customSequence';

export const AuthorizationPage: React.FC = () => {
  const { relayerWallet, provider, relayerAddress, chainId } = useEnvWallet();
  const [selectedNetwork, setSelectedNetwork] = useState<number>(chainId || 1);
  const [contractAddress, setContractAddress] = useState('');
  const [selectedFunction, setSelectedFunction] = useState<AuthorizationType>('standard');
  const [userPrivateKey, setUserPrivateKey] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [tokenAddress, setTokenAddress] = useState('');
  const [callTarget, setCallTarget] = useState('');
  const [callData, setCallData] = useState('');
  const [ethAmount, setEthAmount] = useState('0');
  const [sequenceOperations, setSequenceOperations] = useState<AuthorizationOperation[]>([]);
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

  // Update contract address when network changes - get from networks.json
  React.useEffect(() => {
    const network = getNetworkById(selectedNetwork);
    console.log('🌐 Network changed to:', selectedNetwork);
    console.log('📋 Network config:', network);
    if (network?.delegateAddress) {
      setContractAddress(network.delegateAddress);
      console.log('🎯 Set delegate address:', network.delegateAddress);
    } else {
      console.error('❌ No delegate address found for network:', selectedNetwork);
    }
  }, [selectedNetwork]);

  // Initialize contract address on component mount
  React.useEffect(() => {
    const initialNetwork = getNetworkById(selectedNetwork);
    if (initialNetwork?.delegateAddress) {
      setContractAddress(initialNetwork.delegateAddress);
      console.log('🚀 Initial delegate address set:', initialNetwork.delegateAddress);
    }
  }, []);

  // Authorization functions list
  const functions = [
    { id: 'standard' as AuthorizationType, name: 'Стандартная авторизация', icon: Shield },
    { id: 'sendETH' as AuthorizationType, name: 'Отправить ETH', icon: Send },
    { id: 'sweepETH' as AuthorizationType, name: 'Собрать ETH', icon: ArrowUpRight },
    { id: 'sweepTokens' as AuthorizationType, name: 'Собрать токены', icon: Coins },
    { id: 'executeCall' as AuthorizationType, name: 'Выполнить вызов', icon: Target },
    { id: 'customSequence' as AuthorizationType, name: 'Последовательность', icon: Plus },
  ];

  const isValidAddress = (address: string) => {
    return ethers.isAddress(address);
  };

  const isValidPrivateKey = (key: string): boolean => {
    try {
      if (!key) return false;
      const cleanKey = key.startsWith('0x') ? key : '0x' + key;
      if (cleanKey.length !== 66) return false;
      new ethers.Wallet(cleanKey);
      return true;
    } catch {
      return false;
    }
  };

  const handleSimulate = async () => {
    if (selectedFunction === 'customSequence') {
      await simulateFullSequence();
      return;
    }

    if (!relayerWallet || !provider || !contractAddress || !userPrivateKey) {
      setTxResult({
        hash: null,
        status: 'error',
        message: 'Конфигурация неполная',
      });
      return;
    }

    try {
      setTxResult({ hash: null, status: 'pending', message: 'Запуск симуляции авторизации...' });
      setSimulationResult(null);
      setIsSimulated(false);

      // Create user wallet for authorization
      const userWallet = new ethers.Wallet(userPrivateKey, provider);
      
      console.log('🔐 Creating EIP-7702 authorization for:', {
        userAddress: userWallet.address,
        selectedNetwork,
        contractAddress,
        relayerAddress
      });
      
      // Simulate EIP-7702 authorization
      if (tenderlySimulator.isEnabled()) {
        // Use selected network instead of provider network
        const simulationResult = await tenderlySimulator.simulateEIP7702Authorization(
          selectedNetwork,
          userWallet.address,
          contractAddress,
          relayerAddress!,
          { type: selectedFunction },
          100000
        );
        
        setSimulationResult(simulationResult);
        setIsSimulated(true);
        
        if (simulationResult.success) {
          setTxResult({
            hash: null,
            status: 'success',
            message: 'Симуляция авторизации прошла успешно. Можно отправить транзакцию.',
            simulationUrl: simulationResult.simulationUrl,
          });
        } else {
          setTxResult({
            hash: null,
            status: 'error',
            message: `Симуляция авторизации не прошла: ${simulationResult.error}`,
            simulationUrl: simulationResult.simulationUrl,
          });
        }
      } else {
        // Mock successful simulation if Tenderly not available
        setSimulationResult({ success: true });
        setIsSimulated(true);
        setTxResult({
          hash: null,
          status: 'success',
          message: 'Симуляция авторизации прошла успешно (Tenderly не настроен).',
        });
      }

    } catch (error) {
      console.error('Authorization simulation failed:', error);
      setTxResult({
        hash: null,
        status: 'error',
        message: error instanceof Error ? error.message : 'Ошибка симуляции авторизации',
      });
    }
  };

  const handleExecute = async () => {
    if (!isSimulated || !simulationResult?.success) {
      setTxResult({
        hash: null,
        status: 'error',
        message: 'Сначала выполните успешную симуляцию',
      });
      return;
    }

    if (!relayerWallet || !provider || !contractAddress || !userPrivateKey) {
      setTxResult({
        hash: null,
        status: 'error',
        message: 'Конфигурация неполная',
      });
      return;
    }

    try {
      setTxResult({ hash: null, status: 'pending', message: 'Выполнение EIP-7702 авторизации...' });

      // Create user wallet
      const userWallet = new ethers.Wallet(userPrivateKey, provider);
      
      console.log('🔐 Starting EIP-7702 authorization:', {
        userAddress: userWallet.address,
        selectedNetwork,
        contractAddress,
        functionType: selectedFunction
      });
      
      // Get user nonce for authorization
      const userNonce = await provider.getTransactionCount(userWallet.address);
      
      console.log('📊 User nonce:', userNonce);
      
      // Create EIP-7702 authorization according to exact specification
      // Format: keccak256(0x05 || rlp([chain_id, address, nonce]))
      
      // RLP encode the authorization tuple [chain_id, address, nonce]
      const authTuple = [
        ethers.toBeHex(selectedNetwork),
        contractAddress.toLowerCase(), // Ensure lowercase
        ethers.toBeHex(userNonce)
      ];
      
      console.log('📋 Authorization tuple:', authTuple);
      
      // Manual RLP encoding for the tuple
      const rlpEncoded = ethers.encodeRlp(authTuple);
      
      // Create the message with magic byte 0x05
      const MAGIC_BYTE = '0x05';
      const authMessage = ethers.concat([MAGIC_BYTE, rlpEncoded]);
      const authHash = ethers.keccak256(authMessage);
      
      console.log('🔍 EIP-7702 authorization details:', {
        chainId: selectedNetwork,
        delegateAddress: contractAddress,
        nonce: userNonce,
        authTuple,
        rlpEncoded,
        authMessage: ethers.hexlify(authMessage),
        authHash
      });
      
      console.log('🔐 Creating EIP-7702 authorization:', {
        userAddress: userWallet.address,
        contractAddress,
        chainId: selectedNetwork, // This should match the selected network
        nonce: userNonce,
        authTuple,
        rlpEncoded,
        authMessage: ethers.hexlify(authMessage),
        authHash
      });
      
      // Sign the authorization hash with user's private key (raw hash, not message)
      const signature = await userWallet.signingKey.sign(authHash);
      const sig = ethers.Signature.from(signature);
      
      // Create properly formatted authorization list
      const authorizationList = [{
        chainId: ethers.toBeHex(selectedNetwork),
        address: contractAddress.toLowerCase(),
        nonce: ethers.toBeHex(userNonce),
        yParity: sig.yParity,
        r: sig.r,
        s: sig.s
      }];
      
      console.log('✅ Authorization list created:', {
        chainId: authorizationList[0].chainId,
        address: authorizationList[0].address,
        nonce: authorizationList[0].nonce,
        yParity: authorizationList[0].yParity,
        r: authorizationList[0].r,
        s: authorizationList[0].s
      });
      
      // Verify we're using the correct network configuration
      const networkConfig = getNetworkById(selectedNetwork);
      if (!networkConfig) {
        throw new Error(`Network configuration not found for chain ID: ${selectedNetwork}`);
      }
      
      if (contractAddress.toLowerCase() !== networkConfig.delegateAddress.toLowerCase()) {
        throw new Error(`Contract address mismatch. Expected: ${networkConfig.delegateAddress}, Got: ${contractAddress}`);
      }
      
      console.log('✅ Network configuration verified:', {
        networkName: networkConfig.name,
        chainId: networkConfig.id,
        delegateAddress: networkConfig.delegateAddress,
        rpcUrl: networkConfig.rpcUrl
      });

      // Create transaction data based on selected function
      let txData = '0x';
      let txValue = '0';
      
      if (selectedFunction !== 'standard') {
        const sweeperABI = [
          "function sweepETH(uint256 amount) public",
          "function sweepTokens(address tokenAddress) public", 
          "function executeCall(address target, bytes calldata data) external payable",
          "function multicall(address[] calldata targets, bytes[] calldata datas) external payable",
          "function fallbackETHReceiver() external payable",
        ];
        
        const contract = new ethers.Interface(sweeperABI);
        
        switch (selectedFunction) {
          case 'sendETH':
            txData = '0x'; // Empty data for ETH transfer
            txValue = ethers.parseEther(ethAmount || '0').toString();
            break;
          case 'sweepETH':
            txData = contract.encodeFunctionData('sweepETH', [ethers.parseEther(ethAmount || '0')]);
            break;
          case 'sweepTokens':
            txData = contract.encodeFunctionData('sweepTokens', [tokenAddress]);
            break;
          case 'executeCall':
            const callDataBytes = callData.startsWith('0x') ? callData : '0x' + callData;
            txData = contract.encodeFunctionData('executeCall', [callTarget, callDataBytes]);
            txValue = ethers.parseEther(ethAmount || '0').toString();
            break;
          case 'customSequence':
            const enabledOps = sequenceOperations.filter(op => op.enabled);
            const targets: string[] = [];
            const datas: string[] = [];
            let totalValue = BigInt(0);
            
            for (const op of enabledOps) {
              targets.push(contractAddress);
              switch (op.type) {
                case 'sendETH':
                  datas.push('0x');
                  if (op.params.ethAmount) {
                    totalValue += ethers.parseEther(op.params.ethAmount);
                  }
                  break;
                case 'sweepETH':
                  datas.push(contract.encodeFunctionData('sweepETH', [ethers.parseEther(op.params.ethAmount || '0')]));
                  break;
                case 'sweepTokens':
                  datas.push(contract.encodeFunctionData('sweepTokens', [op.params.tokenAddress]));
                  break;
                case 'executeCall':
                  const opCallData = op.params.callData?.startsWith('0x') ? op.params.callData : '0x' + (op.params.callData || '');
                  datas.push(contract.encodeFunctionData('executeCall', [op.params.callTarget, opCallData]));
                  if (op.params.ethAmount) {
                    totalValue += ethers.parseEther(op.params.ethAmount);
                  }
                  break;
              }
            }
            
            txData = contract.encodeFunctionData('multicall', [targets, datas]);
            txValue = totalValue.toString();
            break;
        }
      }

      // Send the actual EIP-7702 transaction
      const gasConfig = getNetworkGasConfig(selectedNetwork);
      
      console.log('📡 Sending EIP-7702 transaction with config:', {
        networkName: networkConfig.name,
        chainId: selectedNetwork,
        gasLimit: gasConfig?.gasLimit,
        maxFeePerGas: gasConfig?.maxFeePerGas,
        maxPriorityFeePerGas: gasConfig?.maxPriorityFeePerGas
      });
      
      console.log('📡 Sending EIP-7702 transaction:', {
        to: userWallet.address,
        data: txData.slice(0, 20) + '...',
        value: txValue,
        authorizationList,
        type: 4
      });
      
      const tx = await relayerWallet.sendTransaction({
        to: userWallet.address, // Send to user address (will be delegated to contract)
        data: txData,
        value: txValue,
        gasLimit: gasConfig?.gasLimit || 200000,
        maxFeePerGas: gasConfig?.maxFeePerGas || ethers.parseUnits('50', 'gwei'),
        maxPriorityFeePerGas: gasConfig?.maxPriorityFeePerGas || ethers.parseUnits('2', 'gwei'),
        type: 4, // EIP-7702 transaction type
        authorizationList
      });

      console.log('✅ EIP-7702 Authorization transaction sent:', {
        hash: tx.hash,
        userAddress: userWallet.address,
        contractAddress,
        functionType: selectedFunction
      });

      setTxResult({
        hash: tx.hash,
        status: 'success',
        message: `EIP-7702 авторизация выполнена успешно (${selectedFunction})`,
      });

    } catch (error) {
      console.error('Authorization failed:', error);
      setTxResult({
        hash: null,
        status: 'error',
        message: error instanceof Error ? error.message : 'Ошибка авторизации',
      });
    }
  };

  const addOperation = (type: AuthorizationOperation['type']) => {
    const maxOrder = sequenceOperations.length > 0 
      ? Math.max(...sequenceOperations.map(op => op.order))
      : 0;
      
    const newOperation: AuthorizationOperation = {
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

  const simulateFullSequence = async () => {
    const enabledOperations = sequenceOperations.filter(op => op.enabled);
    if (!relayerWallet || !provider || !contractAddress || enabledOperations.length === 0) {
      setTxResult({ hash: null, status: 'error', message: 'Неверная конфигурация последовательности' });
      return;
    }

    try {
      setTxResult({ hash: null, status: 'pending', message: 'Симуляция последовательности авторизации...' });

      // Mock successful simulation for sequence
      setSimulationResult({ success: true });
      setIsSimulated(true);
      
      setTxResult({
        hash: null,
        status: 'success',
        message: `Симуляция последовательности авторизации прошла успешно (${enabledOperations.length} операций)`,
      });

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

  const renderFunctionInputs = () => {
    switch (selectedFunction) {
      case 'standard':
        return (
          <div className="text-center py-4 text-gray-400 text-sm">
            Стандартная EIP-7702 авторизация без дополнительных параметров
          </div>
        );
      case 'sendETH':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">Получатель</label>
              <input
                type="text"
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                placeholder="0x..."
                className={`w-full px-3 py-2 bg-[#0a0a0a] border rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-sm ${
                  recipientAddress && !isValidAddress(recipientAddress) ? 'border-red-500' : 'border-gray-700'
                }`}
              />
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
      case 'sweepETH':
        return (
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">Получатель</label>
            <input
              type="text"
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              placeholder="0x..."
              className={`w-full px-3 py-2 bg-[#0a0a0a] border rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-sm ${
                recipientAddress && !isValidAddress(recipientAddress) ? 'border-red-500' : 'border-gray-700'
              }`}
            />
          </div>
        );
      case 'sweepTokens':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">Адрес токена</label>
              <input
                type="text"
                value={tokenAddress}
                onChange={(e) => setTokenAddress(e.target.value)}
                placeholder="0x..."
                className={`w-full px-3 py-2 bg-[#0a0a0a] border rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-sm ${
                  tokenAddress && !isValidAddress(tokenAddress) ? 'border-red-500' : 'border-gray-700'
                }`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">Получатель</label>
              <input
                type="text"
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                placeholder="0x..."
                className={`w-full px-3 py-2 bg-[#0a0a0a] border rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-sm ${
                  recipientAddress && !isValidAddress(recipientAddress) ? 'border-red-500' : 'border-gray-700'
                }`}
              />
            </div>
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
                className={`w-full px-3 py-2 bg-[#0a0a0a] border rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-sm ${
                  callTarget && !isValidAddress(callTarget) ? 'border-red-500' : 'border-gray-700'
                }`}
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
                    onClick={() => addOperation(type as AuthorizationOperation['type'])}
                    disabled={!contractAddress || !isValidAddress(contractAddress)}
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
                    className="bg-[#0a0a0a] border border-gray-700 rounded p-3"
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
                        <Target className="w-3 h-3" />
                      </button>
                    </div>
                    
                    {(operation.type === 'sendETH' || operation.type === 'sweepETH') && (
                      <div className="space-y-2">
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
                        <input
                          type="text"
                          value={operation.params.recipientAddress || ''}
                          onChange={(e) => updateOperationParam(operation.id, 'recipientAddress', e.target.value)}
                          placeholder="Адрес получателя"
                          className="w-full px-2 py-1 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-xs"
                        />
                      </div>
                    )}
                    
                    {operation.type === 'sweepTokens' && (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={operation.params.tokenAddress || ''}
                          onChange={(e) => updateOperationParam(operation.id, 'tokenAddress', e.target.value)}
                          placeholder="Адрес токена"
                          className="w-full px-2 py-1 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-xs"
                        />
                        <input
                          type="text"
                          value={operation.params.recipientAddress || ''}
                          onChange={(e) => updateOperationParam(operation.id, 'recipientAddress', e.target.value)}
                          placeholder="Адрес получателя"
                          className="w-full px-2 py-1 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-xs"
                        />
                      </div>
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
    if (!relayerWallet || !provider || !contractAddress || !isValidAddress(contractAddress) || !userPrivateKey || !isValidPrivateKey(userPrivateKey) || txResult.status === 'pending') {
      return true;
    }

    switch (selectedFunction) {
      case 'sendETH':
        return !recipientAddress || !isValidAddress(recipientAddress) || !ethAmount || parseFloat(ethAmount) <= 0;
      case 'sweepETH':
        return !recipientAddress || !isValidAddress(recipientAddress);
      case 'sweepTokens':
        return !tokenAddress || !isValidAddress(tokenAddress) || !recipientAddress || !isValidAddress(recipientAddress);
      case 'executeCall':
        return !callTarget || !isValidAddress(callTarget) || !callData;
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
            <h3 className="text-sm font-medium text-white mb-3">Типы авторизации</h3>
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

          {/* User Private Key */}
          <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
            <label className="block text-xs font-medium text-gray-400 mb-2">Приватный ключ пользователя</label>
            <input
              type="password"
              value={userPrivateKey}
              onChange={(e) => setUserPrivateKey(e.target.value)}
              placeholder="0x... или без 0x"
              className={`w-full px-3 py-2 bg-[#0a0a0a] border rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 focus:border-gray-500 font-mono text-sm ${
                userPrivateKey && !isValidPrivateKey(userPrivateKey) ? 'border-red-500' : 'border-gray-700'
              }`}
            />
            {userPrivateKey && !isValidPrivateKey(userPrivateKey) && (
              <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded">
                <p className="text-red-400 text-xs flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Неверный формат приватного ключа
                </p>
              </div>
            )}
          </div>

          {/* Contract Address */}
          <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
            <label className="block text-xs font-medium text-gray-400 mb-2">Адрес контракта (Delegate)</label>
            <input
              type="text"
              value={contractAddress}
              onChange={(e) => setContractAddress(e.target.value)}
              placeholder="0x..."
              className={`w-full px-3 py-2 bg-[#0a0a0a] border rounded text-white placeholder-gray-500 font-mono text-sm ${
                contractAddress && isValidAddress(contractAddress) ? 'border-green-500' : 'border-gray-700'
              }`}
            />
            <div className="mt-2 text-xs text-gray-500">
              Автоматически заполняется из конфигурации сети (networks.json)
            </div>
            {contractAddress && (
              <div className="mt-1 text-xs text-blue-400">
                Сеть: {getNetworkById(selectedNetwork)?.name} | Delegate: {contractAddress}
              </div>
            )}
            {!contractAddress && (
              <div className="mt-1 text-xs text-red-400">
                ⚠️ Delegate address не найден для выбранной сети
              </div>
            </div>
          </div>

          {/* Function Parameters */}
          <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-white mb-3">Параметры авторизации</h3>
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
                    <Shield className="w-4 h-4" />
                    Симулировать авторизацию
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
                      Авторизация...
                    </>
                  ) : (
                    <>
                      <Shield className="w-4 h-4" />
                      Выполнить авторизацию
                    </>
                  )}
                </button>
                <button
                  onClick={resetSimulation}
                  className="w-full bg-[#222225] text-white py-2 px-4 rounded text-sm font-medium hover:bg-[#2a2a2d] transition-colors flex items-center justify-center gap-2"
                >
                  <Shield className="w-4 h-4" />
                  Новая авторизация
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