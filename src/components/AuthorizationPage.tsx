import React, { useState } from 'react';
import { Shield, Send, Target, Loader2, CheckCircle, AlertCircle, ExternalLink, Copy, Globe, Key, User } from 'lucide-react';
import { ethers } from 'ethers';
import { useEnvWallet } from '../hooks/useEnvWallet';
import { tenderlySimulator } from '../utils/tenderly';
import { getAllNetworks, getNetworkById, getTransactionUrl, getNetworkGasConfig } from '../config/networkConfig';


export const AuthorizationPage: React.FC = () => {
  const { wallet, provider } = useWallet();
  const [delegateAddress, setDelegateAddress] = useState('');
  const [relayerAddress, setRelayerAddress] = useState('');
  const [gasLimit, setGasLimit] = useState('40000');
  const [txStatus, setTxStatus] = useState<TransactionStatus>({
    hash: null,
    status: 'idle',
    message: '',
  });

  const isValidAddress = (address: string) => {
    return ethers.isAddress(address);
  };

  const handleAuthorize = async () => {
    if (!provider || !wallet.isConnected) {
      setTxStatus({
        hash: null,
        status: 'error',
        message: 'Please connect your wallet first',
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

    if (!isValidAddress(relayerAddress)) {
      setTxStatus({
        hash: null,
        status: 'error',
        message: 'Invalid relayer address',
      });
      return;
    }

    try {
      setTxStatus({ hash: null, status: 'pending', message: 'Preparing authorization...' });

      const signer = await provider.getSigner();
      const userNonce = await provider.getTransactionCount(wallet.address!);
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
      const authSig = await signer.signMessage(ethers.getBytes(authHash));
      const signature = ethers.Signature.from(authSig);

      const authWithSig = {
        ...authData,
        yParity: signature.yParity === 0 ? '0x' : '0x01',
        r: signature.r,
        s: signature.s,
      };

      setTxStatus({ hash: null, status: 'pending', message: 'Sending authorization transaction...' });

      // Prepare transaction data
      const feeData = await provider.getFeeData();
      const relayerNonce = await provider.getTransactionCount(relayerAddress);

      const txData = {
        type: 4, // EIP-7702 transaction type
        chainId,
        nonce: relayerNonce,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas!,
        maxFeePerGas: feeData.maxFeePerGas!,
        gasLimit: parseInt(gasLimit),
        to: wallet.address!, // The user's address
        value: 0,
        data: '0x',
        accessList: [],
        authorizationList: [authWithSig],
      };

      // For demo purposes, we'll show the authorization data
      // In a real implementation, the relayer would sign and send this
      setTxStatus({
        hash: 'demo-' + Date.now(),
        status: 'success',
        message: 'Authorization prepared successfully! (Demo mode)',
      });

      // Log the authorization data for development
      console.log('EIP-7702 Authorization Data:', {
        authData: authWithSig,
        transactionData: txData,
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
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'success':
        return 'bg-green-500/20 text-green-300 border-green-500/30';
      case 'error':
        return 'bg-red-500/20 text-red-300 border-red-500/30';
      default:
        return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
      <h2 className="text-2xl font-bold text-white mb-6">EIP-7702 Authorization</h2>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Delegate Contract Address
          </label>
          <input
            type="text"
            value={delegateAddress}
            onChange={(e) => setDelegateAddress(e.target.value)}
            placeholder="0x..."
            className="w-full bg-black/20 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {delegateAddress && !isValidAddress(delegateAddress) && (
            <p className="text-red-400 text-sm mt-1">Invalid address format</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Relayer Address
          </label>
          <input
            type="text"
            value={relayerAddress}
            onChange={(e) => setRelayerAddress(e.target.value)}
            placeholder="0x..."
            className="w-full bg-black/20 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {relayerAddress && !isValidAddress(relayerAddress) && (
            <p className="text-red-400 text-sm mt-1">Invalid address format</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Gas Limit
          </label>
          <input
            type="number"
            value={gasLimit}
            onChange={(e) => setGasLimit(e.target.value)}
            placeholder="40000"
            className="w-full bg-black/20 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <button
          onClick={handleAuthorize}
          disabled={
            !wallet.isConnected ||
            !delegateAddress ||
            !relayerAddress ||
            !isValidAddress(delegateAddress) ||
            !isValidAddress(relayerAddress) ||
            txStatus.status === 'pending'
          }
          className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 px-6 rounded-lg font-medium hover:from-blue-600 hover:to-purple-700 transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
        >
          {getStatusIcon()}
          {txStatus.status === 'pending' ? 'Processing...' : 'Authorize'}
        </button>

        {txStatus.message && (
          <div className={`p-4 rounded-lg border ${getStatusColor()}`}>
            <div className="flex items-center gap-2">
              {getStatusIcon()}
              <span className="text-sm">{txStatus.message}</span>
            </div>
            {txStatus.hash && (
              <div className="mt-2 text-xs font-mono break-all">
                Transaction: {txStatus.hash}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};