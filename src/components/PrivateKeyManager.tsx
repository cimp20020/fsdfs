import React, { useState } from 'react';
import { Key, Upload, Play, Pause, SkipForward, Trash2, CheckCircle, AlertCircle, Shield } from 'lucide-react';
import { ethers } from 'ethers';

interface PrivateKeyManagerProps {
  onPrivateKeyChange: (privateKey: string) => void;
  currentPrivateKey: string;
  onBulkAuthorize?: (privateKey: string, keyIndex: number) => Promise<{ success: boolean; txHash?: string; error?: string }>;
}

interface KeyProcessingStatus {
  key: string;
  address: string;
  status: 'pending' | 'processing' | 'success' | 'error' | 'skipped';
  message?: string;
  txHash?: string;
}

export const PrivateKeyManager: React.FC<PrivateKeyManagerProps> = ({
  onPrivateKeyChange,
  currentPrivateKey,
  onBulkAuthorize
}) => {
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [singleKey, setSingleKey] = useState(currentPrivateKey);
  const [bulkKeys, setBulkKeys] = useState('');
  const [keyList, setKeyList] = useState<string[]>([]);
  const [processingStatus, setProcessingStatus] = useState<KeyProcessingStatus[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

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

  const handleSingleKeyChange = (key: string) => {
    setSingleKey(key);
    console.log('🔑 Private key input changed:', key ? `key provided (${key.length} chars)` : 'empty');
    
    // Always call onPrivateKeyChange to handle both valid keys and clearing
    if (key.trim() === '') {
      console.log('🧹 Clearing private key');
      onPrivateKeyChange('');
    } else if (isValidPrivateKey(key)) {
      const normalizedKey = normalizePrivateKey(key);
      console.log('✅ Valid private key, updating:', normalizedKey.slice(0, 10) + '...');
      onPrivateKeyChange(normalizedKey);
    } else {
      console.log('❌ Invalid private key format');
      // Don't call onPrivateKeyChange for invalid keys
    }
  };

  const handleBulkKeysChange = (keys: string) => {
    setBulkKeys(keys);
    const keyArray = keys
      .split('\n')
      .map(key => key.trim())
      .filter(key => key.length > 0);
    
    setKeyList(keyArray);
    
    // Initialize processing status
    const statusArray: KeyProcessingStatus[] = keyArray.map(key => ({
      key: normalizePrivateKey(key),
      address: getAddressFromPrivateKey(key),
      status: isValidPrivateKey(key) ? 'pending' : 'error',
      message: isValidPrivateKey(key) ? undefined : 'Invalid private key format'
    }));
    
    setProcessingStatus(statusArray);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setBulkKeys(content);
        handleBulkKeysChange(content);
      };
      reader.readAsText(file);
    }
  };

  const startBulkProcessing = () => {
    setIsProcessing(true);
    setIsPaused(false);
    setCurrentIndex(0);
    processNextKey(0);
  };

  const pauseProcessing = () => {
    setIsPaused(true);
  };

  const resumeProcessing = () => {
    setIsPaused(false);
    processNextKey(currentIndex);
  };

  const skipCurrentKey = () => {
    if (isProcessing && currentIndex < processingStatus.length) {
      setProcessingStatus(prev => prev.map((status, index) => 
        index === currentIndex 
          ? { ...status, status: 'skipped', message: 'Skipped by user' }
          : status
      ));
      
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      
      if (nextIndex < processingStatus.length && !isPaused) {
        processNextKey(nextIndex);
      } else {
        setIsProcessing(false);
      }
    }
  };

  const processNextKey = async (index: number) => {
    if (isPaused || index >= processingStatus.length) {
      if (index >= processingStatus.length) {
        setIsProcessing(false);
      }
      return;
    }

    const currentKey = processingStatus[index];
    if (currentKey.status === 'error') {
      // Skip invalid keys
      const nextIndex = index + 1;
      setCurrentIndex(nextIndex);
      setTimeout(() => processNextKey(nextIndex), 100);
      return;
    }

    // Update status to processing
    setProcessingStatus(prev => prev.map((status, i) => 
      i === index 
        ? { ...status, status: 'processing', message: 'Processing authorization...' }
        : status
    ));

    // Set current private key for processing
    onPrivateKeyChange(currentKey.key);

    try {
      // Wait a moment for the wallet to be created
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (onBulkAuthorize) {
        console.log(`🚀 Processing key ${index + 1}/${processingStatus.length}:`, currentKey.address);
        
        // Wait for the authorization form to be ready
        let retries = 0;
        const maxRetries = 10;
        
        while (retries < maxRetries) {
          const authButton = document.querySelector('[data-testid="auth-button"]') as HTMLButtonElement;
          if (authButton && !authButton.disabled) {
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 500));
          retries++;
        }
        
        const result = await onBulkAuthorize(currentKey.key, index);
        
        if (result.success) {
          setProcessingStatus(prev => prev.map((status, i) => 
            i === index 
              ? { 
                  ...status, 
                  status: 'success', 
                  message: 'Authorization completed successfully!',
                  txHash: result.txHash 
                }
              : status
          ));
        } else {
          setProcessingStatus(prev => prev.map((status, i) => 
            i === index 
              ? { 
                  ...status, 
                  status: 'error', 
                  message: result.error || 'Authorization failed'
                }
              : status
          ));
        }
      } else {
        // Fallback: just mark as success after delay
        await new Promise(resolve => setTimeout(resolve, 2000));
        setProcessingStatus(prev => prev.map((status, i) => 
          i === index 
            ? { ...status, status: 'success', message: 'Key processed (no authorization handler)' }
            : status
        ));
      }
    } catch (error) {
      console.error(`❌ Error processing key ${index + 1}:`, error);
      setProcessingStatus(prev => prev.map((status, i) => 
        i === index 
          ? { 
              ...status, 
              status: 'error', 
              message: error instanceof Error ? error.message : 'Processing failed'
            }
          : status
      ));
    }

    // Move to next key
    const nextIndex = index + 1;
    setCurrentIndex(nextIndex);
    
    if (nextIndex < processingStatus.length && !isPaused) {
      setTimeout(() => processNextKey(nextIndex), 1000); // 1 second delay between keys
    } else {
      setIsProcessing(false);
    }
  };

  const clearBulkKeys = () => {
    setBulkKeys('');
    setKeyList([]);
    setProcessingStatus([]);
    setIsProcessing(false);
    setCurrentIndex(0);
    setIsPaused(false);
  };

  const getStatusIcon = (status: KeyProcessingStatus['status']) => {
    switch (status) {
      case 'processing':
        return <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />;
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      case 'skipped':
        return <SkipForward className="w-4 h-4 text-yellow-400" />;
      default:
        return <div className="w-4 h-4 rounded-full bg-gray-400" />;
    }
  };

  const getStatusColor = (status: KeyProcessingStatus['status']) => {
    switch (status) {
      case 'processing':
        return 'bg-blue-500/20 border-blue-500/30';
      case 'success':
        return 'bg-green-500/20 border-green-500/30';
      case 'error':
        return 'bg-red-500/20 border-red-500/30';
      case 'skipped':
        return 'bg-yellow-500/20 border-yellow-500/30';
      default:
        return 'bg-gray-500/20 border-gray-500/30';
    }
  };

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700">
      {/* Header */}
      <div className="p-6 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
            <Key className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Private Key Manager</h2>
            <p className="text-sm text-gray-400">Manage user private keys for EIP-7702 authorization</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Mode Selection */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setMode('single')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'single'
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Single Key
          </button>
          <button
            onClick={() => setMode('bulk')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'bulk'
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Bulk Processing
          </button>
        </div>

        {mode === 'single' ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Private Key
              </label>
              <input
                type="password"
                value={singleKey}
                onChange={(e) => handleSingleKeyChange(e.target.value)}
                placeholder="0x... or without 0x prefix"
                className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 font-mono text-sm"
              />
              {singleKey && (
                <div className="mt-3">
                  {isValidPrivateKey(singleKey) ? (
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-green-400 mb-2">
                        <CheckCircle className="w-4 h-4" />
                        <span className="font-medium">Valid Private Key</span>
                      </div>
                      <div className="text-sm text-gray-300">
                        <span className="text-gray-400">Address:</span>
                        <span className="font-mono ml-2">{getAddressFromPrivateKey(singleKey)}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-red-400">
                        <AlertCircle className="w-4 h-4" />
                        <span className="font-medium">Invalid private key format</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Private Keys (one per line)
              </label>
              <textarea
                value={bulkKeys}
                onChange={(e) => handleBulkKeysChange(e.target.value)}
                placeholder="0x28a0274f12bd2e268224214cf924283a9ff1a6f3ecebc12b9488d59ef347e988&#10;28a0274f12bd2e268224214cf924283a9ff1a6f3ecebc12b9488d59ef347e988&#10;..."
                rows={4}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 font-mono text-sm"
              />
            </div>

            <div className="flex gap-2">
              <label className="flex-1 cursor-pointer">
                <input
                  type="file"
                  accept=".txt,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <div className="flex items-center justify-center gap-2 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-gray-300 hover:bg-gray-600 transition-colors text-sm">
                  <Upload className="w-4 h-4" />
                  Upload File
                </div>
              </label>
              <button
                onClick={clearBulkKeys}
                className="flex items-center gap-2 bg-red-600/20 border border-red-500/30 rounded-lg px-4 py-2 text-red-400 hover:bg-red-600/30 transition-colors text-sm"
              >
                <Trash2 className="w-4 h-4" />
                Clear
              </button>
            </div>

            {keyList.length > 0 && (
              <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-600">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-white font-medium">
                    Keys to Process ({keyList.length})
                  </h4>
                  <div className="flex gap-2">
                    {!isProcessing ? (
                      <button
                        onClick={startBulkProcessing}
                        disabled={keyList.length === 0}
                        className="flex items-center gap-1 bg-green-600 text-white rounded-lg px-3 py-1 hover:bg-green-700 transition-colors disabled:opacity-50 text-sm"
                      >
                        <Play className="w-4 h-4" />
                        Start
                      </button>
                    ) : (
                      <>
                        {isPaused ? (
                          <button
                            onClick={resumeProcessing}
                            className="flex items-center gap-1 bg-green-600 text-white rounded-lg px-3 py-1 hover:bg-green-700 transition-colors text-sm"
                          >
                            <Play className="w-4 h-4" />
                            Resume
                          </button>
                        ) : (
                          <button
                            onClick={pauseProcessing}
                            className="flex items-center gap-1 bg-yellow-600 text-white rounded-lg px-3 py-1 hover:bg-yellow-700 transition-colors text-sm"
                          >
                            <Pause className="w-4 h-4" />
                            Pause
                          </button>
                        )}
                        <button
                          onClick={skipCurrentKey}
                          className="flex items-center gap-1 bg-blue-600 text-white rounded-lg px-3 py-1 hover:bg-blue-700 transition-colors text-sm"
                        >
                          <SkipForward className="w-4 h-4" />
                          Skip
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {processingStatus.slice(0, 5).map((keyStatus, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg border bg-gray-800 ${getStatusColor(keyStatus.status)} ${
                        index === currentIndex && isProcessing ? 'ring-2 ring-blue-400' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {getStatusIcon(keyStatus.status)}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white font-mono truncate">
                            {keyStatus.address}
                          </div>
                          <div className="text-xs text-gray-400 truncate">
                            {keyStatus.key}
                          </div>
                          {keyStatus.message && (
                            <div className="text-xs text-gray-300 mt-1">
                              {keyStatus.message}
                            </div>
                          )}
                          {keyStatus.txHash && (
                            <div className="text-xs text-blue-400 mt-1 font-mono truncate">
                              TX: {keyStatus.txHash}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">
                          #{index + 1}
                        </div>
                      </div>
                    </div>
                  ))}
                  {processingStatus.length > 5 && (
                    <div className="text-center text-gray-400 text-sm py-2">
                      ... and {processingStatus.length - 5} more keys
                    </div>
                  )}
                </div>

                {isProcessing && (
                  <div className="mt-4 bg-blue-500/10 rounded-lg p-3 border border-blue-500/20">
                    <div className="text-blue-400 text-sm">
                      Processing: {currentIndex + 1} of {processingStatus.length}
                      {isPaused && ' (Paused)'}
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${((currentIndex + 1) / processingStatus.length) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};