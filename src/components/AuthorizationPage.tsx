import React, { useState } from 'react';
import { Send, Loader2, CheckCircle, AlertCircle, ExternalLink, Copy, Key, User, Zap } from 'lucide-react';
import { ethers } from 'ethers';
import { useEnvWallet } from '../hooks/useEnvWallet';
import { tenderlySimulator } from '../utils/tenderly';

interface TransactionStatus {
  hash: string | null;
  status: 'idle' | 'pending' | 'success' | 'error';
  message: string;
  simulationUrl?: string;
}

export const AuthorizationPage: React.FC = () => {
  const { userWallet, relayerWallet, provider, userAddress, relayerAddress, updateUserPrivateKey, currentUserPrivateKey } = useEnvWallet();
  const [privateKey, setPrivateKey] = useState(currentUserPrivateKey || '');
  const [delegateAddress, setDelegateAddress] = useState('');
  const [gasLimit, setGasLimit] = useState('40000');
  const [txStatus, setTxStatus] = useState<TransactionStatus>({
    hash: null,
    status: 'idle',
    message: '',
  });

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
    } else if (isValidPrivateKey(key)) {
      const normalizedKey = key.startsWith('0x') ? key : '0x' + key;
      updateUserPrivateKey(normalizedKey);
    }
  };

  const handleAuthorize = async () => {
    if (!provider || !userWallet || !relayerWallet) {
      setTxStatus({
        hash: null,
        status: 'error',
        message: 'Wallet not configured',
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
      setTxStatus({ hash: null, status: 'pending', message: 'Preparing authorization...' });

      const userNonce = await provider.getTransactionCount(userAddress!);
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);

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
      const authSig = await userWallet.signMessage(ethers.getBytes(authHash));
      const signature = ethers.Signature.from(authSig);

      const authWithSig = {
        ...authData,
        yParity: signature.yParity === 0 ? '0x' : '0x01',
        r: signature.r,
        s: signature.s,
      };

      // Simulate with Tenderly if available
      let simulationResult = null;
      if (tenderlySimulator.isEnabled()) {
        setTxStatus({ hash: null, status: 'pending', message: 'Running simulation...' });
        simulationResult = await tenderlySimulator.simulateEIP7702Authorization(
          chainId,
          userAddress!,
          delegateAddress,
          relayerAddress!,
          authWithSig,
          parseInt(gasLimit)
        );
      }

      // For demo purposes, we'll show the authorization data
      const demoTxHash = 'demo-' + Date.now();
      setTxStatus({
        hash: demoTxHash,
        status: 'success',
        message: 'Authorization prepared successfully',
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
        message: error instanceof Error ? error.message : 'Authorization failed',
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold text-white mb-2">EIP-7702 Authorization</h1>
        <p className="text-gray-400">Delegate account execution to a smart contract</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Private Key Input */}
          <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Key className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-medium text-white">Private Key</h3>
            </div>
            <input
              type="password"
              value={privateKey}
              onChange={(e) => handlePrivateKeyChange(e.target.value)}
              placeholder="0x... or without 0x prefix"
              className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
            />
            {privateKey && !isValidPrivateKey(privateKey) && (
              <p className="text-red-400 text-xs mt-1">Invalid private key format</p>
            )}
          </div>

          {/* Authorization Form */}
          <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-white mb-4">Authorization Parameters</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">
                  Delegate Contract Address
                </label>
                <input
                  type="text"
                  value={delegateAddress}
                  onChange={(e) => setDelegateAddress(e.target.value)}
                  placeholder="0x..."
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                />
                {delegateAddress && !isValidAddress(delegateAddress) && (
                  <p className="text-red-400 text-xs mt-1">Invalid address format</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">
                  Gas Limit
                </label>
                <input
                  type="number"
                  value={gasLimit}
                  onChange={(e) => setGasLimit(e.target.value)}
                  placeholder="40000"
                  className="w-full px-3 py-2 bg-[#0a0a0a] border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>

              <button
                onClick={handleAuthorize}
                disabled={
                  !userWallet ||
                  !delegateAddress ||
                  !isValidAddress(delegateAddress) ||
                  !isValidPrivateKey(privateKey) ||
                  txStatus.status === 'pending'
                }
                className="w-full bg-blue-600 text-white py-2 px-4 rounded text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                data-testid="auth-button"
              >
                {txStatus.status === 'pending' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Authorize
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Transaction Status */}
          {txStatus.message && (
            <div className={`border rounded-lg p-4 ${getStatusColor()}`} data-testid="tx-status">
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
                  View in Tenderly
                </a>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* User Wallet Status */}
          {userAddress && (
            <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-medium text-white">User Wallet</h3>
              </div>
              <div className="text-xs text-gray-400 font-mono">{userAddress}</div>
            </div>
          )}

          {/* Relayer Wallet Status */}
          {relayerAddress && (
            <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-medium text-white">Relayer</h3>
              </div>
              <div className="text-xs text-gray-400 font-mono">{relayerAddress}</div>
            </div>
          )}

          {/* Info */}
          <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-white mb-2">About EIP-7702</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              EIP-7702 allows EOAs to temporarily delegate execution to smart contracts while maintaining ownership.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};