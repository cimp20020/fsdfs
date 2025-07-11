import React from 'react';
import { X, CheckCircle, AlertCircle, ExternalLink, Zap, TrendingUp, Activity, Eye, ArrowRight, Code, Database, Coins, Clock, Hash, FileText, BarChart3, Copy, Calendar, User, Target, DollarSign, Fuel, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

interface SimulationResult {
  success: boolean;
  gasUsed?: number;
  gasLimit?: number;
  error?: string;
  logs?: any[];
  balanceChanges?: any[];
  stateChanges?: any[];
  contracts?: any[];
  addresses?: string[];
  method?: string;
  simulationId?: string;
  simulationUrl?: string;
  executionTime?: number;
  blockNumber?: number;
  transaction?: {
    hash?: string;
    from?: string;
    to?: string;
    value?: string;
    gasPrice?: string;
    gasUsed?: number;
    gasLimit?: number;
    nonce?: number;
    input?: string;
    status?: boolean;
    timestamp?: string;
    txType?: string;
    effectiveGasPrice?: string;
  };
  network?: {
    id: number;
    name: string;
    currency: string;
  };
}

interface SimulationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceed: () => void;
  result: SimulationResult | null;
  isLoading: boolean;
  transactionType: string;
}

const NETWORK_LOGOS: { [key: number]: string } = {
  1: '🔷', // Ethereum
  56: '🟡', // BSC
  137: '🟣', // Polygon
  42161: '🔵', // Arbitrum
  8453: '🔵', // Base
  10: '🔴', // Optimism
  11155111: '🔷', // Sepolia
};

export const SimulationModal: React.FC<SimulationModalProps> = ({
  isOpen,
  onClose,
  onProceed,
  result,
  isLoading,
  transactionType
}) => {
  if (!isOpen) return null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return 'a few seconds ago';
    const date = new Date(timestamp);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  };

  const getNetworkInfo = () => {
    if (!result?.network) return { logo: '🔷', name: 'Unknown', currency: 'ETH' };
    return {
      logo: NETWORK_LOGOS[result.network.id] || '🔷',
      name: result.network.name,
      currency: result.network.currency
    };
  };

  const getStatusIcon = () => {
    if (isLoading) {
      return <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />;
    }
    if (result?.success) {
      return <CheckCircle className="w-8 h-8 text-green-400" />;
    }
    return <AlertCircle className="w-8 h-8 text-red-400" />;
  };

  const getStatusColor = () => {
    if (isLoading) return 'border-blue-500/30 bg-blue-500/10';
    if (result?.success) return 'border-green-500/30 bg-green-500/10';
    return 'border-red-500/30 bg-red-500/10';
  };

  const getStatusTitle = () => {
    if (isLoading) return 'Simulating Transaction...';
    if (result?.success) return 'Simulation Successful ✅';
    return 'Simulation Failed ❌';
  };

  const getStatusMessage = () => {
    if (isLoading) return 'Running transaction simulation with Tenderly...';
    if (result?.success) return 'Transaction would execute successfully';
    return result?.error || 'Transaction would fail';
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
              <Eye className="w-6 h-6 text-white drop-shadow-sm" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Transaction Simulation</h2>
              <p className="text-sm text-zinc-400">{transactionType}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-300 transition-colors rounded-lg hover:bg-zinc-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Status Card */}
          <div className={`rounded-xl border p-4 ${getStatusColor()}`}>
            <div className="flex items-center gap-4 mb-4">
              {getStatusIcon()}
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-1">
                  {getStatusTitle()}
                </h3>
                <p className="text-zinc-300">
                  {getStatusMessage()}
                </p>
              </div>
            </div>

            {/* Transaction Overview - Tenderly Style */}
            {result && !isLoading && (
              <div className="space-y-6">
                {/* Transaction Details Card */}
                <div className="bg-black/30 rounded-xl p-6 border border-zinc-700">
                  <div className="flex items-center gap-2 mb-6">
                    <Hash className="w-5 h-5 text-blue-400" />
                    <span className="text-white font-semibold text-lg">📋 Transaction Details</span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Left Column */}
                    <div className="space-y-4">
                      {/* Hash */}
                      {result.simulationId && (
                        <div>
                          <p className="text-zinc-400 text-sm mb-2">Hash</p>
                          <div className="flex items-center gap-2">
                            <p className="text-white font-mono text-sm break-all">{result.simulationId}</p>
                            <button
                              onClick={() => copyToClipboard(result.simulationId!)}
                              className="p-1 text-zinc-400 hover:text-zinc-300 rounded transition-colors"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {/* Network */}
                      <div>
                        <p className="text-zinc-400 text-sm mb-2">Network</p>
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{getNetworkInfo().logo}</span>
                          <span className="text-white font-medium">{getNetworkInfo().name}</span>
                        </div>
                      </div>
                      
                      {/* Status */}
                      <div>
                        <p className="text-zinc-400 text-sm mb-2">Status</p>
                        <div className="flex items-center gap-2">
                          {result.success ? (
                            <>
                              <CheckCircle className="w-4 h-4 text-green-400" />
                              <span className="text-green-400 font-medium">Success</span>
                            </>
                          ) : (
                            <>
                              <AlertCircle className="w-4 h-4 text-red-400" />
                              <span className="text-red-400 font-medium">Failed</span>
                            </>
                          )}
                        </div>
                      </div>
                      
                      {/* Block Number */}
                      {result.blockNumber && (
                        <div>
                          <p className="text-zinc-400 text-sm mb-2">Block</p>
                          <p className="text-white font-mono">#{result.blockNumber.toLocaleString()}</p>
                        </div>
                      )}
                      
                      {/* Timestamp */}
                      <div>
                        <p className="text-zinc-400 text-sm mb-2">Timestamp</p>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-zinc-400" />
                          <div>
                            <p className="text-white text-sm">a few seconds ago</p>
                            <p className="text-zinc-400 text-xs">({formatTimestamp(result.transaction?.timestamp)})</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Right Column */}
                    <div className="space-y-4">
                      {/* From Address */}
                      {result.transaction?.from && (
                        <div>
                          <p className="text-zinc-400 text-sm mb-2">From</p>
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-blue-400" />
                            <div>
                              <p className="text-white font-mono text-sm">{result.transaction.from}</p>
                              <p className="text-zinc-400 text-xs">{truncateAddress(result.transaction.from)} [Sender]</p>
                            </div>
                            <button
                              onClick={() => copyToClipboard(result.transaction!.from!)}
                              className="p-1 text-zinc-400 hover:text-zinc-300 rounded transition-colors"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {/* To Address */}
                      {result.transaction?.to && (
                        <div>
                          <p className="text-zinc-400 text-sm mb-2">To</p>
                          <div className="flex items-center gap-2">
                            <Target className="w-4 h-4 text-green-400" />
                            <div>
                              <p className="text-white font-mono text-sm">{result.transaction.to}</p>
                              <p className="text-zinc-400 text-xs">{truncateAddress(result.transaction.to)} [Receiver]</p>
                            </div>
                            <button
                              onClick={() => copyToClipboard(result.transaction!.to!)}
                              className="p-1 text-zinc-400 hover:text-zinc-300 rounded transition-colors"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {/* Value */}
                      <div>
                        <p className="text-zinc-400 text-sm mb-2">Value</p>
                        <div className="flex items-center gap-2">
                          <Coins className="w-4 h-4 text-yellow-400" />
                          <div>
                            <p className="text-white font-mono">
                              {result.transaction?.value ? 
                                `${parseFloat(result.transaction.value).toFixed(6)} ${getNetworkInfo().currency}` : 
                                `0 ${getNetworkInfo().currency}`
                              }
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Transaction Fee */}
                      {result.gasUsed && result.transaction?.gasPrice && (
                        <div>
                          <p className="text-zinc-400 text-sm mb-2">Tx Fee</p>
                          <div className="flex items-center gap-2">
                            <Fuel className="w-4 h-4 text-orange-400" />
                            <p className="text-white font-mono">
                              {((result.gasUsed * parseFloat(result.transaction.gasPrice)) / 1e18).toFixed(6)} {getNetworkInfo().currency}
                            </p>
                          </div>
                        </div>
                      )}
                      
                      {/* Transaction Type */}
                      <div>
                        <p className="text-zinc-400 text-sm mb-2">Tx Type</p>
                        <p className="text-white">{result.transaction?.txType || 'EIP-7702'}</p>
                      </div>
                      
                      {/* Nonce */}
                      {result.transaction?.nonce !== undefined && (
                        <div>
                          <p className="text-zinc-400 text-sm mb-2">Nonce</p>
                          <p className="text-white font-mono">{result.transaction.nonce}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Gas Analysis */}
                {(result.gasUsed || result.gasLimit) && (
                  <div className="bg-black/30 rounded-xl p-6 border border-zinc-700">
                    <div className="flex items-center gap-2 mb-6">
                      <Fuel className="w-5 h-5 text-yellow-400" />
                      <span className="text-white font-semibold text-lg">⛽ Gas Analysis</span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Gas Price */}
                      {result.transaction?.gasPrice && (
                        <div className="bg-yellow-500/10 rounded-lg p-4 border border-yellow-500/20">
                          <div className="flex items-center gap-2 mb-2">
                            <Zap className="w-4 h-4 text-yellow-400" />
                            <span className="text-yellow-400 font-medium">Gas Price</span>
                          </div>
                          <p className="text-white font-mono text-lg">
                            {(parseFloat(result.transaction.gasPrice) / 1e9).toFixed(0)} Gwei
                          </p>
                          <p className="text-zinc-400 text-xs">
                            ({parseFloat(result.transaction.gasPrice) / 1e18} {getNetworkInfo().currency})
                          </p>
                        </div>
                      )}
                      
                      {/* Gas Used */}
                      {result.gasUsed && (
                        <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/20">
                          <div className="flex items-center gap-2 mb-2">
                            <Activity className="w-4 h-4 text-blue-400" />
                            <span className="text-blue-400 font-medium">Gas Used</span>
                          </div>
                          <p className="text-white font-mono text-lg">{result.gasUsed.toLocaleString()}</p>
                          {result.gasLimit && (
                            <p className="text-zinc-400 text-xs">
                              / {result.gasLimit.toLocaleString()} ({Math.round((result.gasUsed / result.gasLimit) * 100)}%)
                            </p>
                          )}
                        </div>
                      )}
                      
                      {/* Gas Efficiency */}
                      {result.gasUsed && result.gasLimit && (
                        <div className="bg-green-500/10 rounded-lg p-4 border border-green-500/20">
                          <div className="flex items-center gap-2 mb-2">
                            <BarChart3 className="w-4 h-4 text-green-400" />
                            <span className="text-green-400 font-medium">Efficiency</span>
                          </div>
                          <p className="text-white font-mono text-lg">
                            {Math.round((result.gasUsed / result.gasLimit) * 100)}%
                          </p>
                          <div className="w-full bg-zinc-700 rounded-full h-2 mt-2">
                            <div
                              className={`h-2 rounded-full transition-all duration-300 ${
                                (result.gasUsed / result.gasLimit) > 0.8 
                                  ? 'bg-gradient-to-r from-red-500 to-orange-500'
                                  : (result.gasUsed / result.gasLimit) > 0.6
                                  ? 'bg-gradient-to-r from-yellow-500 to-orange-500'
                                  : 'bg-gradient-to-r from-green-500 to-emerald-500'
                              }`}
                              style={{ width: `${Math.min((result.gasUsed / result.gasLimit) * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Raw Input Data */}
                {result.transaction?.input && result.transaction.input !== '0x' && (
                  <div className="bg-black/30 rounded-xl p-6 border border-zinc-700">
                    <div className="flex items-center gap-2 mb-4">
                      <Code className="w-5 h-5 text-purple-400" />
                      <span className="text-white font-semibold text-lg">📝 Raw Input</span>
                    </div>
                    <div className="bg-purple-500/10 rounded-lg p-4 border border-purple-500/20">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-purple-400 font-medium">Transaction Data</span>
                        <button
                          onClick={() => copyToClipboard(result.transaction!.input!)}
                          className="p-1 text-zinc-400 hover:text-zinc-300 rounded transition-colors"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-white font-mono text-sm break-all bg-black/30 p-3 rounded">
                        {result.transaction.input}
                      </p>
                      {result.method && (
                        <p className="text-zinc-400 text-xs mt-2">Method: {result.method}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Events and Logs */}
                {result.logs && result.logs.length > 0 && (
                  <div className="bg-black/30 rounded-xl p-6 border border-zinc-700">
                    <div className="flex items-center gap-2 mb-6">
                      <FileText className="w-5 h-5 text-purple-400" />
                      <span className="text-white font-semibold text-lg">📋 Events ({result.logs.length})</span>
                    </div>
                    <div className="space-y-3 max-h-48 overflow-y-auto">
                      {result.logs.slice(0, 5).map((log: any, index: number) => (
                        <div key={index} className="bg-purple-500/10 rounded-lg p-3 border border-purple-500/20">
                          <div className="flex items-center gap-2 mb-2">
                            <Hash className="w-3 h-3 text-purple-400" />
                            <span className="text-purple-400 font-mono text-sm">
                              {log.name || `Event ${index + 1}`}
                            </span>
                          </div>
                          {log.address && (
                            <p className="text-zinc-400 text-xs">
                              From: <span className="text-white font-mono">{log.address}</span>
                            </p>
                          )}
                          {log.topics && log.topics.length > 0 && (
                            <p className="text-zinc-400 text-xs mt-1">
                              Topics: {log.topics.length}
                            </p>
                          )}
                        </div>
                      ))}
                      {result.logs.length > 5 && (
                        <div className="text-center text-zinc-400 text-sm py-2">
                          ... and {result.logs.length - 5} more events
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Balance Changes */}
                {result.balanceChanges && result.balanceChanges.length > 0 && (
                  <div className="bg-black/30 rounded-xl p-6 border border-zinc-700">
                    <div className="flex items-center gap-2 mb-6">
                      <ArrowUpDown className="w-5 h-5 text-emerald-400" />
                      <span className="text-white font-semibold text-lg">💰 Balance Changes ({result.balanceChanges.length})</span>
                    </div>
                    
                    {/* Table Header */}
                    <div className="grid grid-cols-4 gap-4 mb-4 pb-2 border-b border-zinc-700">
                      <div className="text-zinc-400 text-sm font-medium">Address</div>
                      <div className="text-zinc-400 text-sm font-medium">Token</div>
                      <div className="text-zinc-400 text-sm font-medium">Balance Change</div>
                      <div className="text-zinc-400 text-sm font-medium">Dollar Value</div>
                    </div>
                    
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {result.balanceChanges.slice(0, 5).map((change: any, index: number) => (
                        <div key={index} className="grid grid-cols-4 gap-4 py-3 bg-emerald-500/5 rounded-lg border border-emerald-500/10">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              {change.address && (
                                <>
                                  <span className="text-emerald-400 text-xs">
                                    {getNetworkInfo().id}:
                                  </span>
                                  <span className="text-white font-mono text-sm">
                                    {truncateAddress(change.address)}
                                  </span>
                                  <span className="text-zinc-400 text-xs">
                                    {change.delta && change.delta.startsWith('-') ? '[Sender]' : '[Receiver]'}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center">
                            <div className="flex items-center gap-1">
                              <span className="text-white font-mono text-sm">
                                {change.token_info?.address ? truncateAddress(change.token_info.address) : getNetworkInfo().currency}
                              </span>
                              <span className="text-zinc-400 text-xs">
                                {change.token_info?.symbol || getNetworkInfo().currency}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {change.delta && change.delta.startsWith('-') ? (
                              <ArrowDown className="w-3 h-3 text-red-400" />
                            ) : (
                              <ArrowUp className="w-3 h-3 text-green-400" />
                            )}
                            <span className={`font-mono text-sm ${
                              change.delta && change.delta.startsWith('-') 
                                ? 'text-red-400' 
                                : 'text-green-400'
                            }`}>
                              {change.delta || change.amount || 'N/A'}
                            </span>
                          </div>
                          <div className="flex items-center">
                            <span className="text-zinc-400 text-sm">N/A</span>
                          </div>
                        </div>
                      ))}
                      {result.balanceChanges.length > 5 && (
                        <div className="text-center text-zinc-400 text-sm py-2">
                          ... and {result.balanceChanges.length - 5} more changes
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* State Changes */}
                {result.stateChanges && result.stateChanges.length > 0 && (
                  <div className="bg-black/30 rounded-xl p-6 border border-zinc-700">
                    <div className="flex items-center gap-2 mb-6">
                      <Database className="w-5 h-5 text-blue-400" />
                      <span className="text-white font-semibold text-lg">🔄 State Changes ({result.stateChanges.length})</span>
                    </div>
                    <div className="space-y-3 max-h-48 overflow-y-auto">
                      {result.stateChanges.slice(0, 3).map((change: any, index: number) => (
                        <div key={index} className="bg-blue-500/10 rounded-lg p-3 border border-blue-500/20">
                          <div className="flex items-center gap-2 mb-2">
                            <Hash className="w-3 h-3 text-blue-400" />
                            <span className="text-blue-400 font-mono text-sm">
                              {change.address ? `${change.address.slice(0, 6)}...${change.address.slice(-4)}` : 'Contract'}
                            </span>
                          </div>
                          <div className="text-xs text-zinc-400">
                            <p>Slot: {change.key ? `${change.key.slice(0, 10)}...` : 'N/A'}</p>
                            <p className="mt-1">
                              <span className="text-red-400">Before:</span> {change.original ? `${change.original.slice(0, 10)}...` : '0x0'}
                            </p>
                            <p>
                              <span className="text-green-400">After:</span> {change.new ? `${change.new.slice(0, 10)}...` : '0x0'}
                            </p>
                          </div>
                        </div>
                      ))}
                      {result.stateChanges.length > 3 && (
                        <div className="text-center text-zinc-400 text-sm py-2">
                          ... and {result.stateChanges.length - 3} more changes
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Execution Details */}
                <div className="bg-black/30 rounded-xl p-6 border border-zinc-700">
                  <div className="flex items-center gap-2 mb-6">
                    <BarChart3 className="w-5 h-5 text-cyan-400" />
                    <span className="text-white font-semibold text-lg">📊 Summary</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {result.executionTime && (
                      <div className="bg-cyan-500/10 rounded-lg p-4 border border-cyan-500/20">
                        <div className="flex items-center gap-2 mb-2">
                          <Clock className="w-4 h-4 text-cyan-400" />
                          <span className="text-cyan-400 font-medium">Execution Time</span>
                        </div>
                        <p className="text-white font-mono text-lg">{result.executionTime}ms</p>
                      </div>
                    )}
                    <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Hash className="w-4 h-4 text-blue-400" />
                        <span className="text-blue-400 font-medium">Contracts</span>
                      </div>
                      <p className="text-white font-mono text-lg">{result.contracts?.length || 1}</p>
                    </div>
                    {result.addresses && (
                      <div className="bg-green-500/10 rounded-lg p-4 border border-green-500/20">
                        <div className="flex items-center gap-2 mb-2">
                          <User className="w-4 h-4 text-green-400" />
                          <span className="text-green-400 font-medium">Addresses</span>
                        </div>
                        <p className="text-white font-mono text-lg">{result.addresses.length}</p>
                      </div>
                    )}
                    {(result.logs?.length || 0) > 0 && (
                      <div className="bg-purple-500/10 rounded-lg p-4 border border-purple-500/20">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="w-4 h-4 text-purple-400" />
                          <span className="text-purple-400 font-medium">Events</span>
                        </div>
                        <p className="text-white font-mono text-lg">{result.logs?.length || 0}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tenderly Link */}
                {result.simulationUrl && (
                  <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-xl p-6 border border-purple-500/20">
                    <div className="flex items-center gap-2 mb-6">
                      <TrendingUp className="w-5 h-5 text-purple-400" />
                      <span className="text-white font-semibold text-lg">🔍 Detailed Analysis</span>
                    </div>
                    <div className="space-y-3">
                      <p className="text-zinc-300 text-sm">
                        View complete transaction analysis with call traces, state diffs, gas profiler, and debugging tools in Tenderly Dashboard
                      </p>
                      <a
                        href={result.simulationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white px-4 py-2 rounded-lg hover:from-purple-600 hover:to-pink-700 transition-all duration-200 transform hover:scale-105 shadow-lg font-medium"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Open Tenderly Dashboard
                        <ArrowRight className="w-4 h-4" />
                      </a>
                      {result.simulationId && (
                        <p className="text-zinc-400 text-xs font-mono">
                          Simulation ID: {result.simulationId}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Warning for Failed Simulation */}
          {result && !result.success && !isLoading && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 text-red-400 mb-2">
                <AlertCircle className="w-5 h-5" />
                <span className="font-medium">Transaction Would Fail</span>
              </div>
              <p className="text-red-300 text-sm">
                The simulation indicates this transaction would fail if executed. 
                Please review the parameters and try again.
              </p>
            </div>
          )}

          {/* Success Recommendation */}
          {result && result.success && !isLoading && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
              <div className="flex items-center gap-2 text-green-400 mb-2">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">Ready to Execute</span>
              </div>
              <p className="text-green-300 text-sm">
                The simulation was successful. The transaction should execute as expected.
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="p-6 border-t border-zinc-800 flex gap-4">
          <button
            onClick={onClose}
            className="flex-1 bg-zinc-700 text-white py-3 px-6 rounded-xl font-semibold hover:bg-zinc-600 transition-all duration-200"
          >
            Cancel
          </button>
          {result && !isLoading && (
            <button
              onClick={onProceed}
              disabled={!result.success}
              className={`flex-1 py-3 px-6 rounded-xl font-semibold transition-all duration-200 ${
                result.success
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 transform hover:scale-105 shadow-lg'
                  : 'bg-zinc-600 text-zinc-400 cursor-not-allowed'
              }`}
            >
              {result.success ? 'Execute Transaction' : 'Cannot Execute'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};