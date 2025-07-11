import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { getAllNetworks, getNetworkById, getNetworkRelayerKey } from '../config/networkConfig';

interface EnvWalletState {
  userWallet: ethers.Wallet | null;
  relayerWallet: ethers.Wallet | null;
  provider: ethers.JsonRpcProvider | null;
  isConfigured: boolean;
  userAddress: string | null;
  relayerAddress: string | null;
  userBalance: string | null;
  relayerBalance: string | null;
  multiNetworkBalances: { [networkName: string]: { balance: string; currency: string } } | null;
  chainId: number | null;
  error: string | null;
  currentUserPrivateKey: string | null;
}

export const useEnvWallet = () => {
  const [walletState, setWalletState] = useState<EnvWalletState>({
    userWallet: null,
    relayerWallet: null,
    provider: null,
    isConfigured: false,
    userAddress: null,
    relayerAddress: null,
    userBalance: null,
    relayerBalance: null,
    multiNetworkBalances: null,
    chainId: null,
    error: null,
    currentUserPrivateKey: null,
  });


  // Fetch balances from all networks
  const fetchMultiNetworkBalances = useCallback(async () => {
    console.log('🌐 Fetching multi-network balances...');
    
    const balances: { [networkName: string]: { balance: string; currency: string } } = {};
    const networks = getAllNetworks();
    
    const promises = networks.map(async (network) => {
      const relayerKey = getNetworkRelayerKey(network.id);
      
      if (!relayerKey || relayerKey.trim() === '' || relayerKey === '0x...' || relayerKey === '0x') {
        console.log(`⚠️ No relayer key for ${network.name}, skipping`);
        return;
      }
      
      // Validate private key format (should be 64 hex characters, optionally prefixed with 0x)
      const cleanKey = relayerKey.startsWith('0x') ? relayerKey.slice(2) : relayerKey;
      if (!/^[0-9a-fA-F]{64}$/.test(cleanKey)) {
        console.log(`⚠️ Invalid private key format for ${network.name}, skipping`);
        return;
      }
      
      try {
        const provider = new ethers.JsonRpcProvider(network.rpcUrl);
        const wallet = new ethers.Wallet(relayerKey, provider);
        const balance = await provider.getBalance(wallet.address);
        
        balances[network.name] = {
          balance: ethers.formatEther(balance),
          currency: network.currency
        };
        
        console.log(`✅ ${network.name}: ${ethers.formatEther(balance)} ${network.currency}`);
      } catch (error) {
        console.error(`❌ Failed to fetch balance for ${network.name}:`, error);
        balances[network.name] = {
          balance: '0.0000',
          currency: network.currency
        };
      }
    });
    
    await Promise.all(promises);
    
    setWalletState(prev => ({
      ...prev,
      multiNetworkBalances: balances
    }));
    
    console.log('🌐 Multi-network balances updated:', balances);
  }, []);

  // Initialize provider and relayer wallet once
  useEffect(() => {
    initializeProvider();
    fetchMultiNetworkBalances();
  }, []);

  const initializeProvider = async () => {
    try {
      // Use the first network as default (BSC)
      const defaultNetwork = getNetworkById(56); // BSC
      if (!defaultNetwork) {
        throw new Error('Default network (BSC) not found in configuration');
      }

      const relayerPrivateKey = getNetworkRelayerKey(defaultNetwork.id) || import.meta.env.VITE_RELAYER_PRIVATE_KEY;
      const rpcUrl = defaultNetwork.rpcUrl;

      if (!relayerPrivateKey || !rpcUrl) {
        setWalletState(prev => ({
          ...prev,
          error: `Please configure ${defaultNetwork.relayerKeyEnv} in .env file`,
        }));
        return;
      }

      console.log('🔧 Initializing provider and relayer...');

      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const relayerWallet = new ethers.Wallet(relayerPrivateKey, provider);
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);
      const relayerBalance = await provider.getBalance(relayerWallet.address);

      console.log('✅ Provider initialized:', {
        relayerAddress: relayerWallet.address,
        chainId,
        relayerBalance: ethers.formatEther(relayerBalance)
      });

      setWalletState(prev => ({
        ...prev,
        relayerWallet,
        provider,
        relayerAddress: relayerWallet.address,
        relayerBalance: ethers.formatEther(relayerBalance),
        chainId,
        error: null,
      }));

    } catch (error) {
      console.error('❌ Failed to initialize provider:', error);
      setWalletState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to initialize provider',
      }));
    }
  };

  const updateUserPrivateKey = useCallback(async (newPrivateKey: string) => {
    console.log('🔑 updateUserPrivateKey called:', newPrivateKey ? 'key provided' : 'empty');

    // If empty key, clear user wallet
    if (!newPrivateKey || newPrivateKey.trim() === '') {
      console.log('🧹 Clearing user wallet');
      setWalletState(prev => ({
        ...prev,
        currentUserPrivateKey: '',
        userWallet: null,
        userAddress: null,
        userBalance: null,
        isConfigured: false,
      }));
      return;
    }

    try {
      // Use functional update to get current state
      setWalletState(prev => {
        if (!prev.provider) {
          console.log('❌ Provider not ready, waiting...');
          // Retry after a short delay
          setTimeout(() => updateUserPrivateKey(newPrivateKey), 100);
          return prev;
        }

        console.log('👤 Creating user wallet...');
        const userWallet = new ethers.Wallet(newPrivateKey, prev.provider);
        
        console.log('✅ User wallet created:', userWallet.address);

        // Return new state immediately
        const newState = {
          ...prev,
          currentUserPrivateKey: newPrivateKey,
          userWallet,
          userAddress: userWallet.address,
          isConfigured: !!(prev.relayerWallet && prev.provider && newPrivateKey),
          error: null,
        };

        // Get balance asynchronously without blocking state update
        prev.provider.getBalance(userWallet.address)
          .then(balance => {
            console.log('💰 User balance:', ethers.formatEther(balance));
            setWalletState(current => ({
              ...current,
              userBalance: ethers.formatEther(balance),
            }));
          })
          .catch(error => {
            console.error('❌ Failed to get user balance:', error);
          });

        return newState;
      });

    } catch (error) {
      console.error('❌ Failed to create user wallet:', error);
      setWalletState(prev => ({
        ...prev,
        currentUserPrivateKey: newPrivateKey,
        userWallet: null,
        userAddress: null,
        userBalance: null,
        error: error instanceof Error ? error.message : 'Failed to create user wallet',
      }));
    }
  }, []); // Remove walletState dependency to prevent stale closures

  const refreshBalances = useCallback(async () => {
    setWalletState(prev => {
      if (!prev.provider) {
        console.log('❌ Provider not ready, waiting...');
        return prev;
      }

      try {
        const promises = [];
        
        if (prev.userWallet) {
          promises.push(
            prev.provider.getBalance(prev.userWallet.address)
              .then(balance => ({ type: 'user', balance: ethers.formatEther(balance) }))
          );
        }
        
        if (prev.relayerWallet) {
          promises.push(
            prev.provider.getBalance(prev.relayerWallet.address)
              .then(balance => ({ type: 'relayer', balance: ethers.formatEther(balance) }))
          );
        }

        Promise.all(promises).then(results => {
          setWalletState(current => {
            const updates: Partial<EnvWalletState> = {};
            results.forEach(result => {
              if (result.type === 'user') {
                updates.userBalance = result.balance;
              } else if (result.type === 'relayer') {
                updates.relayerBalance = result.balance;
              }
            });
            return { ...current, ...updates };
          });
          console.log('✅ Balances refreshed');
        }).catch(error => {
          console.error('❌ Failed to refresh balances:', error);
        });

      } catch (error) {
        console.error('❌ Failed to refresh balances:', error);
      }

      return prev;
    });
    
    // Also refresh multi-network balances
    fetchMultiNetworkBalances();
  }, []);

  // Debug logging
  useEffect(() => {
    console.log('🔍 Wallet state updated:', {
      hasUserWallet: !!walletState.userWallet,
      hasRelayerWallet: !!walletState.relayerWallet,
      hasProvider: !!walletState.provider,
      isConfigured: walletState.isConfigured,
      userAddress: walletState.userAddress,
      relayerAddress: walletState.relayerAddress,
      currentUserPrivateKey: walletState.currentUserPrivateKey ? 'set' : 'not set',
    });
  }, [walletState]);

  return {
    ...walletState,
    currentUserPrivateKey: walletState.currentUserPrivateKey,
    refreshBalances,
    reinitialize: initializeProvider,
    updateUserPrivateKey,
    fetchMultiNetworkBalances,
  };
};