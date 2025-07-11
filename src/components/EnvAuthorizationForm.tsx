import React, { useState, useEffect } from 'react';
import { Send, Loader2, CheckCircle, AlertCircle, Shield, Copy, ExternalLink, DollarSign, Key, User, Zap, Eye, EyeOff, ArrowUpRight, Coins, Target, Trash2, Settings, Globe } from 'lucide-react';
import { ethers } from 'ethers';
import { useEnvWallet } from '../hooks/useEnvWallet';
import { tenderlySimulator } from '../utils/tenderly';
import { SimulationModal } from './SimulationModal';
import { TransactionStatus } from '../types';
import { fetchGasPrice, formatGasPrice } from '../utils/gasPrice';

// Utility functions
const truncateAddress = (address: string): string => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const formatBalance = (balance: string) => {
  const ethValue = parseFloat(balance);
  const ethPrice = 2945; // Approximate ETH price, you might want to fetch this dynamically
  const usdValue = ethValue * ethPrice;
  
  return {
    eth: ethValue.toFixed(4),
    usd: usdValue.toFixed(2)
  };
};

// Helper function to ensure canonical RLP encoding for zero values
const toCanonicalHex = (value: number | bigint | string): string => {
  if (value === 0 || value === 0n || value === '0x0') {
    return '0x'; // Empty byte string for canonical RLP encoding of zero
  }
  return ethers.toBeHex(value);
};

type SweeperFunction = 'none' | 'sweepETH' | 'sweepTokens' | 'executeCall' | 'customSequence';

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

interface NetworkConfig {
  id: number;
  name: string;
  rpcUrl: string;
  delegateAddress: string;
  explorerUrl: string;
  nativeCurrency: string;
}

const NETWORKS: NetworkConfig[] = [
  {
    id: 56,
    name: 'BSC Mainnet',
    rpcUrl: import.meta.env.VITE_RPC_URL || 'https://bsc-dataseed1.binance.org',
    delegateAddress: import.meta.env.VITE_DELEGATE_CONTRACT_ADDRESS || '',
    explorerUrl: 'https://bscscan.com',
    nativeCurrency: 'BNB'
  },
  {
    id: 1,
    name: 'Ethereum Mainnet',
    rpcUrl: import.meta.env.VITE_ETHEREUM_RPC_URL || 'https://eth.llamarpc.com',
    delegateAddress: import.meta.env.VITE_ETHEREUM_DELEGATE_ADDRESS || '',
    explorerUrl: 'https://etherscan.io',
    nativeCurrency: 'ETH'
  },
  {
    id: 11155111,
    name: 'Sepolia Testnet',
    rpcUrl: import.meta.env.VITE_SEPOLIA_RPC_URL || 'https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
    delegateAddress: import.meta.env.VITE_SEPOLIA_DELEGATE_ADDRESS || '',
    explorerUrl: 'https://sepolia.etherscan.io',
    nativeCurrency: 'ETH'
  },
  {
    id: 42161,
    name: 'Arbitrum One',
    rpcUrl: import.meta.env.VITE_ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    delegateAddress: import.meta.env.VITE_ARBITRUM_DELEGATE_ADDRESS || '',
    explorerUrl: 'https://arbiscan.io',
    nativeCurrency: 'ETH'
  },
  {
    id: 8453,
    name: 'Base Mainnet',
    rpcUrl: import.meta.env.VITE_BASE_RPC_URL || 'https://mainnet.base.org',
    delegateAddress: import.meta.env.VITE_BASE_DELEGATE_ADDRESS || '',
    explorerUrl: 'https://basescan.org',
    nativeCurrency: 'ETH'
  },
  {
    id: 137,
    name: 'Polygon Mainnet',
    rpcUrl: import.meta.env.VITE_POLYGON_RPC_URL || 'https://polygon-rpc.com',
    delegateAddress: import.meta.env.VITE_POLYGON_DELEGATE_ADDRESS || '',
    explorerUrl: 'https://polygonscan.com',
    nativeCurrency: 'MATIC'
  },
  {
    id: 10,
    name: 'Optimism Mainnet',
    rpcUrl: import.meta.env.VITE_OPTIMISM_RPC_URL || 'https://mainnet.optimism.io',
    delegateAddress: import.meta.env.VITE_OPTIMISM_DELEGATE_ADDRESS || '',
    explorerUrl: 'https://optimistic.etherscan.io',
    nativeCurrency: 'ETH'
  }
];

export const EnvAuthorizationForm: React.FC = () => {
  const { userWallet, relayerWallet, provider, userAddress, currentUserPrivateKey, updateUserPrivateKey, userBalance, relayerAddress, relayerBalance } = useEnvWallet();
  const [privateKey, setPrivateKey] = useState(currentUserPrivateKey || '');
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkConfig>(NETWORKS[0]);
  const [showNetworkDropdown, setShowNetworkDropdown] = useState(false);
  const [delegateAddress, setDelegateAddress] = useState(
    NETWORKS[0].delegateAddress
  );
  const [gasLimit, setGasLimit] = useState('150000');
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const [selectedFunction, setSelectedFunction] = useState<SweeperFunction>('none');
  const [functionParams, setFunctionParams] = useState({
    ethAmount: '0',
    tokenAddress: '',
    callTarget: '',
    callData: ''
  });
  const [sequenceOperations, setSequenceOperations] = useState<SequenceOperation[]>([]);
  const [showSimulation, setShowSimulation] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [pendingExecution, setPendingExecution] = useState<(() => void) | null>(null);
  const [txStatus, setTxStatus] = useState<TransactionStatus>({
    hash: null,
    status: 'idle',
    message: '',
  });

  const [showAuthPopup, setShowAuthPopup] = useState(false);

  // Fetch ETH price
  useEffect(() => {
    const fetchEthPrice = async () => {
      try {
        const response = await fetch('/coingecko-api/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
        const data = await response.json();
        if (data && data.ethereum && data.ethereum.usd) {
          setEthPrice(data.ethereum.usd);
        } else {
          console.warn('ETH price data not available in expected format');
          setEthPrice(null);
        }
      } catch (error) {
        console.error('Failed to fetch ETH price:', error);
        setEthPrice(null);
      }
    };
    fetchEthPrice();
  }, []);

  // Sync private key with parent state
  useEffect(() => {
    if (currentUserPrivateKey !== privateKey) {
      setPrivateKey(currentUserPrivateKey || '');
    }
  }, [currentUserPrivateKey]);

  // Update delegate address when network changes
  useEffect(() => {
    setDelegateAddress(selectedNetwork.delegateAddress);
  }, [selectedNetwork]);

  const normalizePrivateKey = (key: string): string => {
    const trimmed = key.trim();
    if (trimmed.startsWith('0x')) {
      return trimmed;
    }
    return '0x' + trimmed;
  };

  const isValidPrivateKey = (key: string): boolean => {
    try {
      const normalized = normalizePrivateKey(key);
      return /^0x[a-fA-F0-9]{64}$/.test(normalized);
    } catch {
      return false;
    }
  };

  const getAddressFromPrivateKey = (privateKey: string): string => {
    try {
      const wallet = new ethers.Wallet(normalizePrivateKey(privateKey));
      return wallet.address;
    } catch {
      return 'Invalid Key';
    }
  };

  const handlePrivateKeyChange = (key: string) => {
    setPrivateKey(key);
    console.log('🔑 Private key input changed:', key ? `key provided (${key.length} chars)` : 'empty');
    
    if (key.trim() === '') {
      console.log('🧹 Clearing private key');
      updateUserPrivateKey('');
    } else if (isValidPrivateKey(key)) {
      const normalizedKey = normalizePrivateKey(key);
      console.log('✅ Valid private key, updating:', normalizedKey.slice(0, 10) + '...');
      updateUserPrivateKey(normalizedKey);
    } else {
      console.log('❌ Invalid private key format');
    }
  };

  const sweeperFunctions = [
    {
      id: 'none' as SweeperFunction,
      name: 'Authorization Only',
      description: 'Just authorize delegation (empty data)',
      icon: Shield,
      color: 'gray'
    },
    {
      id: 'sweepETH' as SweeperFunction,
      name: 'Sweep ETH',
      description: 'Authorize + Extract ETH from proxy',
      icon: ArrowUpRight,
      color: 'green'
    },
    {
      id: 'sweepTokens' as SweeperFunction,
      name: 'Sweep Tokens',
      description: 'Authorize + Extract tokens from proxy',
      icon: Coins,
      color: 'purple'
    },
    {
      id: 'executeCall' as SweeperFunction,
      name: 'Execute Call',
      description: 'Authorize + Execute custom contract call',
      icon: Target,
      color: 'orange'
    },
    {
      id: 'customSequence' as SweeperFunction,
      name: 'Custom Sequence',
      description: 'Authorize + Execute multiple operations in sequence',
      icon: Settings,
      color: 'blue'
    },
  ];

  const generateFunctionCallData = (): string => {
    if (selectedFunction === 'none') {
      return '0x';
    }

    const sweeperABI = [
      "function sweepETH(uint256 amount) public",
      "function sweepTokens(address tokenAddress) public",
      "function executeCall(address target, bytes calldata data) external payable",
      "function multicall(address[] calldata targets, bytes[] calldata datas) external payable",
      "function destroyContract() external"
    ];

    const iface = new ethers.Interface(sweeperABI);

    try {
      switch (selectedFunction) {
        case 'sweepETH':
          return iface.encodeFunctionData('sweepETH', [ethers.parseEther(functionParams.ethAmount || '0')]);
        case 'sweepTokens':
          if (!isValidAddress(functionParams.tokenAddress)) {
            throw new Error('Invalid token address');
          }
          return iface.encodeFunctionData('sweepTokens', [functionParams.tokenAddress]);
        case 'executeCall':
          if (!isValidAddress(functionParams.callTarget)) {
            throw new Error('Invalid target address');
          }
          let dataBytes = functionParams.callData;
          if (!dataBytes.startsWith('0x')) {
            dataBytes = '0x' + dataBytes;
          }
          return iface.encodeFunctionData('executeCall', [functionParams.callTarget, dataBytes]);
        case 'customSequence':
          if (sequenceOperations.length === 0) {
            throw new Error('No operations in sequence');
          }
          
          // Prepare multicall data
          const targets: string[] = [];
          const datas: string[] = [];
          
          for (const operation of sequenceOperations) {
            targets.push(delegateAddress); // All calls go to the delegate contract
            
            switch (operation.type) {
              case 'sendETH':
                // For sending ETH, we use fallbackETHReceiver
                datas.push('0x'); // Empty data for fallback
                break;
                
              case 'sweepETH':
                const sweepAmount = operation.params.ethAmount || '0';
                const sweepData = iface.encodeFunctionData('sweepETH', [ethers.parseEther(sweepAmount)]);
                datas.push(sweepData);
                break;
                
              case 'sweepTokens':
                if (!isValidAddress(operation.params.tokenAddress || '')) {
                  throw new Error('Invalid token address in sequence');
                }
                const tokenData = iface.encodeFunctionData('sweepTokens', [operation.params.tokenAddress]);
                datas.push(tokenData);
                break;
                
              case 'executeCall':
                if (!isValidAddress(operation.params.callTarget || '')) {
                  throw new Error('Invalid target address in sequence');
                }
                let callDataBytes = operation.params.callData || '0x';
                if (!callDataBytes.startsWith('0x')) {
                  callDataBytes = '0x' + callDataBytes;
                }
                const executeData = iface.encodeFunctionData('executeCall', [
                  operation.params.callTarget,
                  callDataBytes
                ]);
                datas.push(executeData);
                break;
            }
          }
          
          return iface.encodeFunctionData('multicall', [targets, datas]);
        default:
          return '0x';
      }
    } catch (error) {
      console.error('Error generating function call data:', error);
      throw error;
    }
  };

  // Helper function to validate Ethereum addresses
  const isValidAddress = (address: string) => {
    return ethers.isAddress(address);
  };

  // Custom Sequence operation management functions
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

  // Check if form is ready
  const hasValidPrivateKey = !!(privateKey && isValidPrivateKey(privateKey) && userWallet && userAddress);
  const hasValidDelegate = !!(delegateAddress && isValidAddress(delegateAddress));
  const hasRelayer = !!(relayerWallet && provider);
  
  const isFormReady = hasValidPrivateKey && hasValidDelegate && hasRelayer;

  console.log('🎯 EnvAuthorizationForm state:', { 
    privateKey: privateKey ? 'set' : 'not set',
    isValidPrivateKey: isValidPrivateKey(privateKey),
    hasUserWallet: !!userWallet, 
    userAddress,
    hasValidPrivateKey,
    hasValidDelegate,
    hasRelayer,
    isFormReady,
    delegateAddress,
    txStatus: txStatus.status
  });

  const executeCustomSequenceAuth = async () => {
    if (!userWallet || !provider || !selectedNetwork) {
      setTxStatus({
        hash: null,
        status: 'error',
        message: 'User wallet, provider or network not configured',
      });
      return;
    }

    if (sequenceOperations.length === 0) {
      setTxStatus({
        hash: null,
        status: 'error',
        message: 'No operations in sequence',
      });
      return;
    }

    // Validate all operations
    for (const operation of sequenceOperations) {
      if (operation.type === 'sweepTokens' && !isValidAddress(operation.params.tokenAddress || '')) {
        setTxStatus({
          hash: null,
          status: 'error',
          message: 'Invalid token address in sequence',
        });
        return;
      }
      if (operation.type === 'executeCall' && !isValidAddress(operation.params.callTarget || '')) {
        setTxStatus({
          hash: null,
          status: 'error',
          message: 'Invalid target address in sequence',
        });
        return;
      }
    }

    try {
      setTxStatus({ hash: null, status: 'pending', message: 'Preparing custom sequence authorization...' });

      const signer = userWallet;
      const userNonce = await provider.getTransactionCount(userWallet.address);
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);

      // Get delegate address for current network
      const delegateAddress = getDelegateAddress(selectedNetwork.id);
      if (!delegateAddress) {
        throw new Error(`Delegate address not configured for ${selectedNetwork.name}`);
      }

      // Prepare EIP-7702 authorization data
      const authData = {
        chainId,
        address: delegateAddress,
        nonce: ethers.toBeHex(userNonce),
      };

      setTxStatus({ hash: null, status: 'pending', message: 'Creating authorization signature...' });

      // Create authorization signature
      const encodedAuth = ethers.concat([
        '0x05',
        ethers.encodeRlp([
          ethers.toBeHex(authData.chainId),
          authData.address,
          authData.nonce,
        ]),
      ]);

      const authHash = ethers.keccak256(encodedAuth);
      const authSig = await signer.signMessage(ethers.getBytes(authHash));
      const signature = ethers.Signature.from(authSig);

      const authWithSig = {
        ...authData,
        yParity: signature.yParity === 0 ? '0x' : '0x01',
        r: signature.r,
        s: signature.s,
      };

      setTxStatus({ hash: null, status: 'pending', message: 'Preparing sequence transaction...' });

      // Get relayer configuration
      const relayerPrivateKey = getRelayerPrivateKey(selectedNetwork.id);
      if (!relayerPrivateKey) {
        throw new Error(`Relayer private key not configured for ${selectedNetwork.name}`);
      }

      const relayerWallet = new ethers.Wallet(relayerPrivateKey, provider);
      const relayerNonce = await provider.getTransactionCount(relayerWallet.address);

      // Prepare multicall data for sequence
      const sweeperABI = [
        "function sweepETH(uint256 amount) public",
        "function sweepTokens(address tokenAddress) public",
        "function executeCall(address target, bytes calldata data) external payable",
        "function multicall(address[] calldata targets, bytes[] calldata datas) external payable",
        "function fallbackETHReceiver() external payable"
      ];

      const contractInterface = new ethers.Interface(sweeperABI);
      const targets: string[] = [];
      const datas: string[] = [];
      let totalValue = BigInt(0);
      
      for (const operation of sequenceOperations) {
        targets.push(userWallet.address); // All calls go to the user's address (now delegated)
        
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
            const sweepData = contractInterface.encodeFunctionData('sweepETH', [ethers.parseEther(sweepAmount)]);
            datas.push(sweepData);
            break;
            
          case 'sweepTokens':
            const tokenData = contractInterface.encodeFunctionData('sweepTokens', [operation.params.tokenAddress]);
            datas.push(tokenData);
            break;
            
          case 'executeCall':
            let callDataBytes = operation.params.callData || '0x';
            if (!callDataBytes.startsWith('0x')) {
              callDataBytes = '0x' + callDataBytes;
            }
            const executeData = contractInterface.encodeFunctionData('executeCall', [
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

      // Prepare multicall transaction data
      const multicallData = contractInterface.encodeFunctionData('multicall', [targets, datas]);

      // Get gas configuration
      const gasConfig = getManualGasConfig(selectedNetwork.id);
      const maxFeePerGas = ethers.parseUnits(gasConfig.maxFeeGwei, 'gwei');
      const maxPriorityFeePerGas = ethers.parseUnits(gasConfig.priorityFeeGwei, 'gwei');

      // Prepare EIP-7702 transaction
      const txData = {
        type: 4, // EIP-7702 transaction type
        chainId,
        nonce: relayerNonce,
        maxPriorityFeePerGas,
        maxFeePerGas,
        gasLimit: 500000, // Higher gas limit for sequence
        to: userWallet.address, // The user's address (will be delegated)
        value: totalValue,
        data: multicallData,
        accessList: [],
        authorizationList: [authWithSig],
      };

      setTxStatus({
        hash: null,
        status: 'pending',
        message: `Sending custom sequence authorization (${sequenceOperations.length} operations)...`,
      });

      // For demo purposes, we'll show the authorization data
      // In a real implementation, the relayer would sign and send this
      const demoTxHash = 'demo-sequence-' + Date.now();
      
      setTxStatus({
        hash: demoTxHash,
        status: 'success',
        message: `Custom sequence authorization prepared successfully! (${sequenceOperations.length} operations)`,
      });

      // Log the authorization data for development
      console.log('EIP-7702 Custom Sequence Authorization Data:', {
        authData: authWithSig,
        transactionData: txData,
        operations: sequenceOperations,
        totalValue: ethers.formatEther(totalValue)
      });

    } catch (error) {
      console.error('Custom sequence authorization failed:', error);
      setTxStatus({
        hash: null,
        status: 'error',
        message: error instanceof Error ? error.message : 'Custom sequence authorization failed',
      });
    }
  };

  const handleAuthorize = async () => {
    // First run simulation if Tenderly is configured
    if (tenderlySimulator.isEnabled()) {
      await runSimulation(() => executeAuthorization());
    } else {
      // Execute directly if no simulation
      await executeAuthorization();
    }
  };

  const runSimulation = async (executionCallback: () => void) => {
    if (!userWallet || !relayerWallet || !provider || !userAddress || !relayerAddress) {
      setTxStatus({
        hash: null,
        status: 'error',
        message: 'Wallet configuration incomplete',
      });
      return;
    }

    setIsSimulating(true);
    setShowSimulation(true);
    setPendingExecution(() => executionCallback);

    try {
      let simulationResult;

      if (selectedFunction === 'customSequence') {
        // Simulate custom sequence
        simulationResult = await tenderlySimulator.simulateTransaction(
          selectedNetwork.id,
          relayerAddress,
          userAddress,
          '0x', // Will be multicall data
          '0',
          300000
        );
      } else {
        // Simulate regular authorization
        simulationResult = await tenderlySimulator.simulateEIP7702Authorization(
          selectedNetwork.id,
          userAddress,
          delegateAddress,
          relayerAddress,
          {},
          parseInt(gasLimit)
        );
      }

      setSimulationResult(simulationResult);
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

  const executeAuthorization = async () => {
    if (!userWallet || !userAddress || !selectedNetwork) {
      setTxStatus({
        hash: null,
        status: 'error',
        message: 'Please provide a user private key and select a network',
      });
      return;
    }

    // Create network-specific provider and relayer
    let networkProvider: ethers.JsonRpcProvider;
    let networkRelayerWallet: ethers.Wallet;
    
    try {
      // Get network-specific relayer private key
      let relayerPrivateKey: string;
      
      switch (selectedNetwork.id) {
        case 1: // Ethereum
          relayerPrivateKey = import.meta.env.VITE_ETHEREUM_RELAYER_PRIVATE_KEY || import.meta.env.VITE_RELAYER_PRIVATE_KEY;
          break;
        case 11155111: // Sepolia
          relayerPrivateKey = import.meta.env.VITE_SEPOLIA_RELAYER_PRIVATE_KEY || import.meta.env.VITE_RELAYER_PRIVATE_KEY;
          break;
        case 42161: // Arbitrum
          relayerPrivateKey = import.meta.env.VITE_ARBITRUM_RELAYER_PRIVATE_KEY || import.meta.env.VITE_RELAYER_PRIVATE_KEY;
          break;
        case 8453: // Base
          relayerPrivateKey = import.meta.env.VITE_BASE_RELAYER_PRIVATE_KEY || import.meta.env.VITE_RELAYER_PRIVATE_KEY;
          break;
        case 137: // Polygon
          relayerPrivateKey = import.meta.env.VITE_POLYGON_RELAYER_PRIVATE_KEY || import.meta.env.VITE_RELAYER_PRIVATE_KEY;
          break;
        case 10: // Optimism
          relayerPrivateKey = import.meta.env.VITE_OPTIMISM_RELAYER_PRIVATE_KEY || import.meta.env.VITE_RELAYER_PRIVATE_KEY;
          break;
        case 56: // BSC
        default:
          relayerPrivateKey = import.meta.env.VITE_RELAYER_PRIVATE_KEY;
          break;
      }
      
      if (!relayerPrivateKey) {
        throw new Error(`Relayer private key not configured for ${selectedNetwork.name}`);
      }
      
      networkProvider = new ethers.JsonRpcProvider(selectedNetwork.rpcUrl);
      networkRelayerWallet = new ethers.Wallet(relayerPrivateKey, networkProvider);
      
      // Verify network connection
      const network = await networkProvider.getNetwork();
      if (Number(network.chainId) !== selectedNetwork.id) {
        throw new Error(`Network mismatch: expected ${selectedNetwork.id}, got ${Number(network.chainId)}`);
      }
      
    } catch (error) {
      setTxStatus({
        hash: null,
        status: 'error',
        message: error instanceof Error ? error.message : `Failed to connect to ${selectedNetwork.name}`,
      });
      return;
    }

    if (!isValidAddress(delegateAddress)) {
      setTxStatus({
        hash: null,
        status: 'error',
        message: 'Invalid delegate address',
      });
      return;
    }

    try {
      setTxStatus({ hash: null, status: 'pending', message: 'Preparing EIP-7702 authorization...' });

      // Get network data
      const network = await networkProvider.getNetwork();
      const chainId = Number(network.chainId);
      const userNonce = await networkProvider.getTransactionCount(userWallet.address);
      const relayerNonce = await networkProvider.getTransactionCount(networkRelayerWallet.address);

      console.log(`Network: ${selectedNetwork.name} (${chainId})`);
      console.log(`User EOA: ${userWallet.address}`);
      console.log(`Relayer: ${networkRelayerWallet.address}`);
      console.log(`Delegate Address: ${delegateAddress}`);
      console.log(`RPC URL: ${selectedNetwork.rpcUrl}`);

      setTxStatus({ hash: null, status: 'pending', message: 'Fetching current gas prices...' });

      setTxStatus({ hash: null, status: 'pending', message: 'Configuring gas prices...' });
      
      // Get manual gas configuration from environment variables
      const getManualGasConfig = (chainId: number) => {
        let maxFeeGwei: string | undefined;
        let priorityFeeGwei: string | undefined;
        
        switch (chainId) {
          case 1: // Ethereum
            maxFeeGwei = import.meta.env.VITE_ETHEREUM_MAX_FEE_GWEI;
            priorityFeeGwei = import.meta.env.VITE_ETHEREUM_PRIORITY_FEE_GWEI;
            break;
          case 11155111: // Sepolia
            maxFeeGwei = import.meta.env.VITE_SEPOLIA_MAX_FEE_GWEI;
            priorityFeeGwei = import.meta.env.VITE_SEPOLIA_PRIORITY_FEE_GWEI;
            break;
          case 56: // BSC
            maxFeeGwei = import.meta.env.VITE_BSC_MAX_FEE_GWEI;
            priorityFeeGwei = import.meta.env.VITE_BSC_PRIORITY_FEE_GWEI;
            break;
          case 42161: // Arbitrum
            maxFeeGwei = import.meta.env.VITE_ARBITRUM_MAX_FEE_GWEI;
            priorityFeeGwei = import.meta.env.VITE_ARBITRUM_PRIORITY_FEE_GWEI;
            break;
        }
        
        if (maxFeeGwei && priorityFeeGwei) {
          return {
            maxFeePerGas: BigInt(parseFloat(maxFeeGwei) * 1000000000), // Convert gwei to wei
            maxPriorityFeePerGas: BigInt(parseFloat(priorityFeeGwei) * 1000000000),
          };
        }
        
        return null;
      };
      
      // Use manual gas config if available, otherwise fetch from API
      const manualGasConfig = getManualGasConfig(chainId);
      let adjustedGasData;
      
      if (manualGasConfig) {
        adjustedGasData = manualGasConfig;
        console.log('Using manual gas configuration:', {
          maxFeePerGas: formatGasPrice(adjustedGasData.maxFeePerGas),
          maxPriorityFeePerGas: formatGasPrice(adjustedGasData.maxPriorityFeePerGas),
          source: 'Environment Variables'
        });
      } else {
        // Fetch current gas prices for the network
        const gasData = await fetchGasPrice(chainId, networkProvider);
        console.log('Gas data fetched:', gasData);
        
        // Multiply gas prices by 1.5 for better transaction success rate
        adjustedGasData = {
          maxFeePerGas: BigInt(Math.floor(Number(gasData.maxFeePerGas) * 1.5)),
          maxPriorityFeePerGas: BigInt(Math.floor(Number(gasData.maxPriorityFeePerGas) * 1.5)),
          gasPrice: gasData.gasPrice ? BigInt(Math.floor(Number(gasData.gasPrice) * 1.5)) : undefined
        };
        
        console.log('Using dynamic gas data (x1.5):', {
          original: {
            maxFeePerGas: formatGasPrice(gasData.maxFeePerGas),
            maxPriorityFeePerGas: formatGasPrice(gasData.maxPriorityFeePerGas)
          },
          adjusted: {
            maxFeePerGas: formatGasPrice(adjustedGasData.maxFeePerGas),
            maxPriorityFeePerGas: formatGasPrice(adjustedGasData.maxPriorityFeePerGas)
          },
          source: 'API + Multiplier'
        });
      }
      

      setTxStatus({ hash: null, status: 'pending', message: 'Creating EIP-7702 authorization...' });

      // Step 1: Create EIP-7702 authorization
      const authData = {
        chainId: toCanonicalHex(chainId),
        address: delegateAddress.toLowerCase(),
        nonce: toCanonicalHex(userNonce),
      };

      // Create the authorization hash according to EIP-7702
      const authMessage = ethers.concat([
        '0x05', // EIP-7702 magic byte
        ethers.encodeRlp([
          authData.chainId,
          authData.address,
          authData.nonce,
        ]),
      ]);

      const authHash = ethers.keccak256(authMessage);
      
      setTxStatus({ hash: null, status: 'pending', message: 'Signing authorization with user wallet...' });

      // Sign the authorization with user's private key
      const authSignature = userWallet.signingKey.sign(authHash);

      const authorization = {
        chainId: chainId,
        address: authData.address,
        nonce: userNonce,
        yParity: toCanonicalHex(authSignature.yParity),
        r: authSignature.r,
        s: authSignature.s,
      };

      console.log('Authorization created:', authorization);

      setTxStatus({ hash: null, status: 'pending', message: 'Preparing EIP-7702 transaction...' });

      // Step 2: Create EIP-7702 transaction (Type 4)
      let transactionData = '0x';
      let transactionValue = 0;
      
      // Generate function call data if a function is selected
      if (selectedFunction !== 'none') {
        try {
          transactionData = generateFunctionCallData();
          if (selectedFunction === 'executeCall' && functionParams.ethAmount) {
            transactionValue = ethers.parseEther(functionParams.ethAmount);
          } else if (selectedFunction === 'customSequence') {
            // Calculate total ETH value for custom sequence
            let totalValue = BigInt(0);
            for (const operation of sequenceOperations) {
              if ((operation.type === 'sendETH' || operation.type === 'executeCall') && operation.params.ethAmount) {
                totalValue += ethers.parseEther(operation.params.ethAmount);
              }
            }
            transactionValue = totalValue;
          }
          console.log(`Function call data generated for ${selectedFunction}:`, transactionData);
        } catch (error) {
          setTxStatus({
            hash: null,
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to generate function call data',
          });
          return;
        }
      }
      
      const transaction = {
        type: 4, // EIP-7702 transaction type
        chainId: chainId,
        nonce: relayerNonce,
        maxPriorityFeePerGas: adjustedGasData.maxPriorityFeePerGas,
        maxFeePerGas: adjustedGasData.maxFeePerGas,
        gasLimit: parseInt(gasLimit),
        to: userWallet.address, // Target the user's account
        value: transactionValue,
        data: transactionData,
        accessList: [],
        authorizationList: [authorization],
      };

      console.log('Transaction prepared:', transaction);

      setTxStatus({ hash: null, status: 'pending', message: 'Signing transaction with relayer...' });

      // Step 3: Create transaction payload for signing
      const txPayload = [
        toCanonicalHex(transaction.chainId),
        toCanonicalHex(transaction.nonce),
        toCanonicalHex(transaction.maxPriorityFeePerGas),
        toCanonicalHex(transaction.maxFeePerGas),
        toCanonicalHex(transaction.gasLimit),
        transaction.to,
        toCanonicalHex(transaction.value),
        transaction.data,
        transaction.accessList,
        [[
          toCanonicalHex(authorization.chainId),
          authorization.address,
          toCanonicalHex(authorization.nonce),
          authorization.yParity,
          ethers.getBytes(authorization.r),
          ethers.getBytes(authorization.s),
        ]],
      ];

      // Create transaction hash for signing
      const txForSigning = ethers.concat([
        '0x04', // EIP-7702 transaction type
        ethers.encodeRlp(txPayload),
      ]);

      const txHash = ethers.keccak256(txForSigning);
      
      // Sign with relayer's private key
      const relayerSignature = networkRelayerWallet.signingKey.sign(txHash);

      // Create final signed transaction
      const signedTxPayload = [
        ...txPayload,
        toCanonicalHex(relayerSignature.yParity),
        ethers.getBytes(relayerSignature.r),
        ethers.getBytes(relayerSignature.s),
      ];

      const signedTransaction = ethers.concat([
        '0x04', // EIP-7702 transaction type
        ethers.encodeRlp(signedTxPayload),
      ]);

      console.log('Signed transaction:', ethers.hexlify(signedTransaction));

      setTxStatus({ hash: null, status: 'pending', message: 'Sending EIP-7702 transaction to network...' });

      // Step 4: Send the transaction
      const transactionHash = await networkProvider.send('eth_sendRawTransaction', [
        ethers.hexlify(signedTransaction)
      ]);

      console.log('Transaction sent:', transactionHash);

      setTxStatus({
        hash: transactionHash,
        status: 'success',
        message: selectedFunction === 'none' 
          ? 'EIP-7702 authorization transaction sent successfully!'
          : `EIP-7702 authorization + ${sweeperFunctions.find(f => f.id === selectedFunction)?.name} sent successfully!`,
      });

      // Log complete transaction details
      console.log('Complete EIP-7702 Transaction:', {
        transactionHash,
        network: selectedNetwork.name,
        chainId,
        userAddress: userWallet.address,
        relayerAddress: networkRelayerWallet.address,
        delegateAddress: delegateAddress,
        authorization,
        transaction,
      });

    } catch (error) {
      console.error('Authorization failed:', error);
      
      let errorMessage = 'Authorization failed';
      if (error instanceof Error) {
        errorMessage = error.message;
        
        // Handle specific error cases
        if (error.message.includes('insufficient funds')) {
          errorMessage = 'Insufficient funds in relayer wallet for gas fees';
        } else if (error.message.includes('gas required exceeds allowance') || error.message.includes('out of gas')) {
          errorMessage = 'Gas limit too low - try increasing the gas limit to 200000 or higher';
        } else if (error.message.includes('max fee per gas less than block base fee')) {
          errorMessage = 'Gas price too low for current network conditions - please try again';
        } else if (error.message.includes('replacement transaction underpriced')) {
          errorMessage = 'Transaction underpriced - please wait and try again with higher gas';
        } else if (error.message.includes('nonce')) {
          errorMessage = 'Nonce error - please try again';
        } else if (error.message.includes('network')) {
          errorMessage = 'Network error - check RPC connection';
        } else if (error.message.includes('unsupported transaction type')) {
          errorMessage = 'EIP-7702 not supported by this RPC provider';
        }
      }
      
      setTxStatus({
        hash: null,
        status: 'error',
        message: errorMessage,
      });
    }
  };

  const getStatusIcon = () => {
    switch (txStatus.status) {
      case 'pending':
        return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      default:
        return <Send className="w-4 h-4" />;
    }
  };

  const getStatusColor = () => {
    switch (txStatus.status) {
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const renderFunctionInputs = () => {
    switch (selectedFunction) {
      case 'sweepETH':
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                ETH Amount to Sweep
              </label>
              <input
                type="number"
                step="0.001"
                value={functionParams.ethAmount}
                onChange={(e) => setFunctionParams(prev => ({ ...prev, ethAmount: e.target.value }))}
                placeholder="0.0"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
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
                value={functionParams.tokenAddress}
                onChange={(e) => setFunctionParams(prev => ({ ...prev, tokenAddress: e.target.value }))}
                placeholder="0x... Token contract address"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 font-mono text-sm"
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
                value={functionParams.callTarget}
                onChange={(e) => setFunctionParams(prev => ({ ...prev, callTarget: e.target.value }))}
                placeholder="0x... Target contract address"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Call Data (hex)
              </label>
              <textarea
                value={functionParams.callData}
                onChange={(e) => setFunctionParams(prev => ({ ...prev, callData: e.target.value }))}
                placeholder="0x... or hex without 0x prefix"
                rows={2}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                ETH Amount (optional)
              </label>
              <input
                type="number"
                step="0.001"
                value={functionParams.ethAmount}
                onChange={(e) => setFunctionParams(prev => ({ ...prev, ethAmount: e.target.value }))}
                placeholder="0.0"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>
          </div>
        );
      case 'customSequence':
        return (
          <div className="space-y-6">
            {/* Add Operation Buttons */}
            <div>
              <h5 className="text-white font-semibold mb-4 text-lg">Add Operations</h5>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => addOperation('sendETH')}
                  className="flex items-center gap-3 bg-blue-600/20 border border-blue-500/30 rounded-xl px-4 py-3 text-blue-400 hover:bg-blue-600/30 transition-all duration-200 text-base font-medium"
                >
                  <Send className="w-5 h-5" />
                  Add Send ETH
                </button>
                <button
                  onClick={() => addOperation('sweepETH')}
                  className="flex items-center gap-3 bg-green-600/20 border border-green-500/30 rounded-xl px-4 py-3 text-green-400 hover:bg-green-600/30 transition-all duration-200 text-base font-medium"
                >
                  <ArrowUpRight className="w-5 h-5" />
                  Add Sweep ETH
                </button>
                <button
                  onClick={() => addOperation('sweepTokens')}
                  className="flex items-center gap-3 bg-purple-600/20 border border-purple-500/30 rounded-xl px-4 py-3 text-purple-400 hover:bg-purple-600/30 transition-all duration-200 text-base font-medium"
                >
                  <Coins className="w-5 h-5" />
                  Add Sweep Tokens
                </button>
                <button
                  onClick={() => addOperation('executeCall')}
                  className="flex items-center gap-3 bg-orange-600/20 border border-orange-500/30 rounded-xl px-4 py-3 text-orange-400 hover:bg-orange-600/30 transition-all duration-200 text-base font-medium"
                >
                  <Target className="w-5 h-5" />
                  Add Execute Call
                </button>
              </div>
            </div>

            {/* Operations List */}
            {sequenceOperations.length > 0 && (
              <div>
                <h5 className="text-white font-semibold mb-4 text-lg">Operation Sequence ({sequenceOperations.length})</h5>
                <div className="space-y-4">
                  {sequenceOperations.map((operation, index) => {
                    const IconComponent = getOperationIcon(operation.type);
                    return (
                      <div key={operation.id} className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4">
                        <div className="flex items-center gap-4 mb-4">
                          <div className="flex items-center gap-3">
                            <span className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center text-sm text-blue-400 font-semibold">
                              {index + 1}
                            </span>
                            <IconComponent className="w-5 h-5 text-zinc-400" />
                            <span className="text-white font-semibold text-base">{getOperationName(operation.type)}</span>
                          </div>
                          <div className="flex-1" />
                          <div className="flex items-center gap-2">
                            {index > 0 && (
                              <button
                                onClick={() => moveOperation(index, index - 1)}
                                className="p-2 text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-zinc-700"
                                title="Move up"
                              >
                                ↑
                              </button>
                            )}
                            {index < sequenceOperations.length - 1 && (
                              <button
                                onClick={() => moveOperation(index, index + 1)}
                                className="p-2 text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-zinc-700"
                                title="Move down"
                              >
                                ↓
                              </button>
                            )}
                            <button
                              onClick={() => removeOperation(operation.id)}
                              className="p-2 text-red-400 hover:text-red-300 transition-colors rounded-lg hover:bg-red-500/10"
                              title="Remove operation"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </div>

                        {/* Operation Parameters */}
                        <div className="space-y-3">
                          {(operation.type === 'sendETH' || operation.type === 'sweepETH') && (
                            <div>
                              <label className="block text-sm font-medium text-zinc-300 mb-2">
                                ETH Amount
                              </label>
                              <input
                                type="number"
                                step="0.001"
                                value={operation.params.ethAmount || ''}
                                onChange={(e) => updateOperationParam(operation.id, 'ethAmount', e.target.value)}
                                placeholder="0.0"
                                className="w-full px-4 py-3 bg-black border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base transition-all duration-200"
                              />
                            </div>
                          )}
                          
                          {operation.type === 'sweepTokens' && (
                            <div>
                              <label className="block text-sm font-medium text-zinc-300 mb-2">
                                Token Contract Address
                              </label>
                              <input
                                type="text"
                                value={operation.params.tokenAddress || ''}
                                onChange={(e) => updateOperationParam(operation.id, 'tokenAddress', e.target.value)}
                                placeholder="0x... Token address"
                                className="w-full px-4 py-3 bg-black border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-base transition-all duration-200"
                              />
                            </div>
                          )}
                          
                          {operation.type === 'executeCall' && (
                            <>
                              <div>
                                <label className="block text-sm font-medium text-zinc-300 mb-2">
                                  Target Contract Address
                                </label>
                                <input
                                  type="text"
                                  value={operation.params.callTarget || ''}
                                  onChange={(e) => updateOperationParam(operation.id, 'callTarget', e.target.value)}
                                  placeholder="0x... Target address"
                                  className="w-full px-4 py-3 bg-black border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-base transition-all duration-200"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-zinc-300 mb-2">
                                  Call Data (hex)
                                </label>
                                <textarea
                                  value={operation.params.callData || ''}
                                  onChange={(e) => updateOperationParam(operation.id, 'callData', e.target.value)}
                                  placeholder="0x... or hex without 0x"
                                  rows={3}
                                  className="w-full px-4 py-3 bg-black border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-base transition-all duration-200"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-zinc-300 mb-2">
                                  ETH Amount (optional)
                                </label>
                                <input
                                  type="number"
                                  step="0.001"
                                  value={operation.params.ethAmount || ''}
                                  onChange={(e) => updateOperationParam(operation.id, 'ethAmount', e.target.value)}
                                  placeholder="0.0"
                                  className="w-full px-4 py-3 bg-black border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base transition-all duration-200"
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
              <div className="text-center py-12 bg-zinc-800/30 rounded-xl border border-zinc-700">
                <Settings className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
                <p className="text-zinc-400 text-lg font-medium mb-2">No operations added yet</p>
                <p className="text-zinc-500 text-base">Use the buttons above to add operations to your sequence</p>
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
      <div className="space-y-6">
        {/* Network Selection */}
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl">
          <div className="p-6 border-b border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl flex items-center justify-center">
                <Globe className="w-6 h-6 text-white drop-shadow-sm" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Network Selection</h2>
                <p className="text-base text-zinc-400">Choose network for EIP-7702 authorization</p>
              </div>
            </div>
          </div>
          
          <div className="p-6">
            <div className="relative">
              <button
                onClick={() => setShowNetworkDropdown(!showNetworkDropdown)}
                className="w-full bg-black border border-zinc-700 rounded-xl px-6 py-4 text-left hover:border-zinc-600 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                      <span className="text-white font-bold text-sm">{selectedNetwork.nativeCurrency}</span>
                    </div>
                    <div>
                      <div className="text-white font-semibold text-lg">{selectedNetwork.name}</div>
                      <div className="text-zinc-400 text-sm">Chain ID: {selectedNetwork.id}</div>
                    </div>
                  </div>
                  <svg 
                    className={`w-5 h-5 text-zinc-400 transition-transform duration-200 ${showNetworkDropdown ? 'rotate-180' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>
              
              {showNetworkDropdown && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-black border border-zinc-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                  {NETWORKS.map((network) => (
                    <button
                      key={network.id}
                      onClick={() => {
                        setSelectedNetwork(network);
                        setShowNetworkDropdown(false);
                      }}
                      className={`w-full px-6 py-4 text-left hover:bg-zinc-800 transition-colors duration-150 border-b border-zinc-800 last:border-b-0 ${
                        selectedNetwork.id === network.id ? 'bg-blue-500/10 border-blue-500/20' : ''
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                          <span className="text-white font-bold text-xs">{network.nativeCurrency}</span>
                        </div>
                        <div>
                          <div className={`font-semibold ${selectedNetwork.id === network.id ? 'text-blue-400' : 'text-white'}`}>
                            {network.name}
                          </div>
                          <div className="text-zinc-400 text-sm">Chain ID: {network.id}</div>
                        </div>
                        {selectedNetwork.id === network.id && (
                          <div className="ml-auto">
                            <CheckCircle className="w-5 h-5 text-blue-400" />
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {!selectedNetwork.delegateAddress && (
              <div className="mt-6 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                <div className="flex items-center gap-3 text-amber-400">
                  <AlertCircle className="w-4 h-4" />
                  <span className="font-medium">Delegate contract address not configured for {selectedNetwork.name}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Private Key Manager */}
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl">
          {/* Header */}
          <div className="p-6 border-b border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
                <Key className="w-6 h-6 text-white drop-shadow-sm" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Private Key Manager</h2>
                <p className="text-base text-zinc-400">Manage user private keys for EIP-7702 authorization</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            {!hasValidPrivateKey ? (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-gradient-to-br from-purple-500/20 to-pink-600/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Key className="w-10 h-10 text-purple-400" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">Enter Private Key</h3>
                <p className="text-zinc-400 mb-8 text-lg">Enter a valid private key to access EIP-7702 authorization features.</p>
                
                <div className="max-w-lg mx-auto">
                  <div className="relative">
                    <input
                      type={showPrivateKey ? "text" : "password"}
                      value={privateKey}
                      onChange={(e) => handlePrivateKeyChange(e.target.value)}
                      placeholder="0x... or without 0x prefix"
                      className="w-full px-6 py-4 pr-14 bg-black border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-base transition-all duration-200"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPrivateKey(!showPrivateKey)}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 p-2 text-zinc-400 hover:text-zinc-300 transition-colors rounded-lg hover:bg-zinc-800"
                    >
                      {showPrivateKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  
                  {privateKey && !isValidPrivateKey(privateKey) && (
                    <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                      <div className="flex items-center gap-3 text-red-400">
                        <AlertCircle className="w-5 h-5" />
                        <span className="font-medium">Invalid private key format</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-base font-semibold text-white mb-3">
                    Private Key
                  </label>
                  <div className="relative">
                    <input
                      type={showPrivateKey ? "text" : "password"}
                      value={privateKey}
                      onChange={(e) => handlePrivateKeyChange(e.target.value)}
                      placeholder="0x... or without 0x prefix"
                      className="w-full px-6 py-4 pr-14 bg-black border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-base transition-all duration-200"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPrivateKey(!showPrivateKey)}
                      className="absolute right-4 top-1/2 transform -translate-y-1/2 p-2 text-zinc-400 hover:text-zinc-300 transition-colors rounded-lg hover:bg-zinc-800"
                    >
                      {showPrivateKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                
                {/* Show user wallet info when key is valid */}
                {userAddress && (
                  <div className="bg-black/50 rounded-xl p-4 border border-zinc-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl flex items-center justify-center">
                          <User className="w-5 h-5 text-white drop-shadow-sm" />
                        </div>
                        <div>
                          <div className="text-base font-semibold text-white">User Wallet (Signer)</div>
                          <div className="text-sm text-zinc-400 font-mono">{userAddress}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => copyToClipboard(userAddress!)}
                        className="p-2 text-zinc-400 hover:text-zinc-300 rounded-lg hover:bg-zinc-800 transition-colors"
                      >
                        <Copy className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                )}
                
                <div className="text-center pt-6">
                  <div className="w-16 h-16 bg-gradient-to-br from-green-500/20 to-emerald-600/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Shield className="w-8 h-8 text-green-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">Ready for Authorization</h3>
                  <p className="text-zinc-400 mb-6 text-lg">Private key configured. Click to open authorization interface.</p>
                  <button
                    onClick={() => setShowAuthPopup(true)}
                    disabled={!selectedNetwork.delegateAddress}
                    className="bg-gradient-to-r from-green-500 to-emerald-600 text-white py-4 px-8 rounded-xl font-semibold hover:from-green-600 hover:to-emerald-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 shadow-lg"
                  >
                    Open Authorization
                  </button>
                  {!selectedNetwork.delegateAddress && (
                    <p className="text-amber-400 text-base mt-3">Configure delegate address for {selectedNetwork.name}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Simulation Modal */}
      <SimulationModal
        isOpen={showSimulation}
        onClose={handleSimulationCancel}
        onProceed={handleSimulationProceed}
        result={simulationResult}
        isLoading={isSimulating}
        transactionType={`EIP-7702 Authorization${selectedFunction === 'customSequence' ? ' + Custom Sequence' : ''}`}
      />

      {/* Authorization Popup */}
      {showAuthPopup && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Popup Header */}
            <div className="p-8 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
                    <Shield className="w-6 h-6 text-white drop-shadow-sm" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">EIP-7702 Authorization</h2>
                    <p className="text-base text-zinc-400">Network: {selectedNetwork.name}</p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowAuthPopup(false)}
                className="p-3 text-zinc-400 hover:text-zinc-300 transition-colors rounded-xl hover:bg-zinc-800"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Popup Content */}
            <div className="p-8 space-y-6">
              {/* Transaction Status */}
              {txStatus.message && (
                <div className={`p-5 rounded-xl border ${getStatusColor()}`}>
                  <div className="flex items-center gap-3">
                    {getStatusIcon()}
                    <span className="text-base font-semibold">{txStatus.message}</span>
                  </div>
                  {txStatus.hash && (
                    <div className="mt-3 flex items-center gap-3">
                      <span className="text-sm font-mono break-all text-zinc-400">{txStatus.hash}</span>
                      <button
                        onClick={() => copyToClipboard(txStatus.hash!)}
                        className="p-2 text-zinc-400 hover:text-zinc-300 rounded-lg hover:bg-zinc-800 transition-colors"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <a
                        href={`${selectedNetwork.explorerUrl}/tx/${txStatus.hash}`}
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

              <div>
                <label className="block text-base font-semibold text-white mb-3">
                  Delegate Contract Address
                </label>
                <input
                  type="text"
                  value={delegateAddress}
                  onChange={(e) => setDelegateAddress(e.target.value)}
                  placeholder="0x... (delegate contract address)"
                  className="w-full px-6 py-4 bg-black border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-base transition-all duration-200"
                />
                {delegateAddress && !isValidAddress(delegateAddress) && (
                  <p className="text-red-400 text-base mt-2 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    Invalid address format
                  </p>
                )}
              </div>

              <div>
                <label className="block text-base font-semibold text-white mb-3">
                  Gas Limit
                  <span className="text-base text-zinc-500 ml-2 font-normal">
                    (Recommended: 150000+ for mainnet)
                  </span>
                </label>
                <input
                  type="number"
                  value={gasLimit}
                  onChange={(e) => setGasLimit(e.target.value)}
                  placeholder="150000"
                  className="w-full px-6 py-4 bg-black border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-base transition-all duration-200"
                />
              </div>

              {/* Function Selection */}
              <div className="bg-black/50 rounded-xl p-6 border border-zinc-800">
                <div className="flex items-center gap-3 mb-6">
                  <Settings className="w-6 h-6 text-blue-400" />
                  <h4 className="text-white font-semibold text-lg">Optional: Execute Function</h4>
                </div>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3">
                    {sweeperFunctions.map((func) => {
                      const IconComponent = func.icon;
                      const isSelected = selectedFunction === func.id;
                      const colorClasses = {
                        gray: isSelected ? 'bg-zinc-500/20 border-zinc-500/50 text-zinc-300' : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:bg-zinc-500/10',
                        green: isSelected ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:bg-green-500/10',
                        purple: isSelected ? 'bg-purple-500/20 border-purple-500/50 text-purple-400' : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:bg-purple-500/10',
                        orange: isSelected ? 'bg-orange-500/20 border-orange-500/50 text-orange-400' : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:bg-orange-500/10',
                        blue: isSelected ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:bg-blue-500/10',
                      };

                      return (
                        <button
                          key={func.id}
                          onClick={() => setSelectedFunction(func.id)}
                          className={`p-4 rounded-xl border transition-all duration-200 text-left ${colorClasses[func.color as keyof typeof colorClasses]}`}
                        >
                          <div className="flex items-center gap-3">
                            <IconComponent className="w-5 h-5" />
                            <div className="flex-1">
                              <div className="font-semibold text-base">{func.name}</div>
                              <div className="text-sm opacity-75">{func.description}</div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Function Parameters */}
                  {selectedFunction !== 'none' && (
                    <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700">
                      <h5 className="text-white font-semibold mb-4 text-base">
                        {sweeperFunctions.find(f => f.id === selectedFunction)?.name} Parameters
                      </h5>
                      {renderFunctionInputs()}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-4 pt-6">
                <button
                  onClick={() => setShowAuthPopup(false)}
                  className="flex-1 bg-zinc-700 text-white py-4 px-6 rounded-xl font-semibold hover:bg-zinc-600 transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  data-testid="auth-button"
                  onClick={handleAuthorize}
                  disabled={!isFormReady || txStatus.status === 'pending'}
                  className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white py-4 px-6 rounded-xl font-semibold hover:from-green-600 hover:to-emerald-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 transform hover:scale-105 shadow-lg"
                >
                  {getStatusIcon()}
                  {txStatus.status === 'pending' 
                    ? 'Processing...' 
                    : !hasValidPrivateKey 
                      ? 'Enter Valid Private Key'
                      : !hasValidDelegate
                        ? 'Enter Valid Delegate Address'
                      : !hasRelayer
                        ? 'Waiting for Relayer...'
                      : selectedFunction === 'none'
                        ? 'Send EIP-7702 Authorization'
                        : `Authorize + ${sweeperFunctions.find(f => f.id === selectedFunction)?.name}`
                  }
                </button>
              </div>
              
              {/* Show operation count for custom sequence */}
              {selectedFunction === 'customSequence' && sequenceOperations.length > 0 && (
                <div className="mt-4 bg-blue-500/10 rounded-xl p-4 border border-blue-500/20">
                  <div className="text-blue-400 text-base font-medium">
                    Ready to execute {sequenceOperations.length} operation{sequenceOperations.length !== 1 ? 's' : ''} in sequence
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};