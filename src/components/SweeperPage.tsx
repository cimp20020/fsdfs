import React, { useState } from 'react';
import { Play, AlertCircle, CheckCircle, ExternalLink, Copy, RotateCcw } from 'lucide-react';

interface SimulationResult {
  success: boolean;
  error?: string;
  logs?: number;
  balanceChanges?: number;
  simulationUrl?: string;
}

interface TransactionResult {
  message: string;
  hash?: string;
  error?: string;
}

export const SweeperPage: React.FC = () => {
  const [selectedFunction, setSelectedFunction] = useState('sweepTokens');
  const [tokenAddress, setTokenAddress] = useState('');
  const [recipient, setRecipient] = useState('');
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [txResult, setTxResult] = useState<TransactionResult>({ message: '' });
  const [isSimulating, setIsSimulating] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const functions = [
    { id: 'sweepTokens', name: 'Собрать токены', description: 'Собрать все токены на указанный адрес' }
  ];

  const isFormValid = () => {
    if (selectedFunction === 'sweepTokens') {
      return tokenAddress.trim() !== '' && recipient.trim() !== '';
    }
    return false;
  };

  const simulateTransaction = async () => {
    if (!isFormValid()) return;

    setIsSimulating(true);
    setSimulationResult(null);
    setTxResult({ message: '' });

    try {
      // Симуляция через Tenderly API
      const response = await fetch('/api/tenderly/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          function: selectedFunction,
          tokenAddress,
          recipient
        }),
      });

      const result = await response.json();
      
      setSimulationResult({
        success: result.success,
        error: result.error,
        logs: result.logs,
        balanceChanges: result.balanceChanges,
        simulationUrl: result.simulationUrl
      });

    } catch (error) {
      setSimulationResult({
        success: false,
        error: 'Ошибка при симуляции транзакции'
      });
    } finally {
      setIsSimulating(false);
    }
  };

  const executeTransaction = async () => {
    if (!simulationResult?.success) return;

    setIsSending(true);
    
    try {
      // Выполнение реальной транзакции
      const response = await fetch('/api/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          function: selectedFunction,
          tokenAddress,
          recipient
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        setTxResult({
          message: 'Транзакция отправлена успешно',
          hash: result.hash
        });
      } else {
        setTxResult({
          message: 'Ошибка при отправке транзакции',
          error: result.error
        });
      }

    } catch (error) {
      setTxResult({
        message: 'Ошибка при отправке транзакции',
        error: 'Неизвестная ошибка'
      });
    } finally {
      setIsSending(false);
    }
  };

  const resetSimulation = () => {
    setSimulationResult(null);
    setTxResult({ message: '' });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getStatusColor = () => {
    if (simulationResult) {
      return simulationResult.success 
        ? 'border-green-500/30 bg-green-500/5' 
        : 'border-red-500/30 bg-red-500/5';
    }
    if (txResult.hash) {
      return 'border-green-500/30 bg-green-500/5';
    }
    if (txResult.error) {
      return 'border-red-500/30 bg-red-500/5';
    }
    return 'border-gray-700/50 bg-gray-800/20';
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Function Selection */}
      <div className="bg-gray-900/40 border border-gray-700/50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Выбор функции</h3>
        <div className="space-y-3">
          {functions.map((func) => (
            <label key={func.id} className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="function"
                value={func.id}
                checked={selectedFunction === func.id}
                onChange={(e) => setSelectedFunction(e.target.value)}
                className="mt-1 text-purple-500 focus:ring-purple-500"
              />
              <div>
                <div className="text-white font-medium">{func.name}</div>
                <div className="text-gray-400 text-sm">{func.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Parameters */}
      {selectedFunction === 'sweepTokens' && (
        <div className="bg-gray-900/40 border border-gray-700/50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Параметры функции</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Адрес токена
              </label>
              <input
                type="text"
                value={tokenAddress}
                onChange={(e) => setTokenAddress(e.target.value)}
                placeholder="0x..."
                className="w-full px-3 py-2 bg-gray-800/50 border border-gray-600/50 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Получатель
              </label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="0x..."
                className="w-full px-3 py-2 bg-gray-800/50 border border-gray-600/50 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50"
              />
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        {!simulationResult && (
          <button
            onClick={simulateTransaction}
            disabled={!isFormValid() || isSimulating}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          >
            <Play className="w-4 h-4" />
            {isSimulating ? 'Симулирование...' : 'Симулировать'}
          </button>
        )}

        {simulationResult?.success && (
          <button
            onClick={executeTransaction}
            disabled={isSending}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          >
            <Play className="w-4 h-4" />
            {isSending ? 'Отправка...' : 'Отправить транзакцию'}
          </button>
        )}

        {simulationResult && (
          <button
            onClick={resetSimulation}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Новая симуляция
          </button>
        )}
      </div>

      {/* Results */}
      {(simulationResult || txResult.message) && (
        <div className={`border rounded-lg p-6 ${getStatusColor()}`}>
          {/* Simulation Result */}
          {simulationResult && (
            <div className="mb-4">
              <div className="flex items-center gap-3 mb-4">
                {simulationResult.success ? (
                  <CheckCircle className="w-5 h-5 text-green-400" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-400" />
                )}
                <span className="text-lg font-semibold text-white">
                  {simulationResult.success ? '✅ Симуляция успешна' : '❌ Симуляция не прошла'}
                </span>
              </div>

              {simulationResult.error && (
                <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-red-400" />
                    <span className="text-red-400 font-medium">Ошибка:</span>
                  </div>
                  <code className="text-red-300 text-sm font-mono">{simulationResult.error}</code>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm">
                {simulationResult.logs !== undefined && (
                  <div>
                    <span className="text-gray-400">События:</span>
                    <span className="text-white ml-2">{simulationResult.logs}</span>
                  </div>
                )}
                {simulationResult.balanceChanges !== undefined && (
                  <div>
                    <span className="text-gray-400">Изменения баланса:</span>
                    <span className="text-white ml-2">{simulationResult.balanceChanges}</span>
                  </div>
                )}
              </div>

              {simulationResult.simulationUrl && (
                <div className="mt-4">
                  <a
                    href={simulationResult.simulationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Посмотреть в Tenderly Dashboard
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Transaction Result */}
          {txResult.message && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                {txResult.hash ? (
                  <CheckCircle className="w-5 h-5 text-green-400" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-400" />
                )}
                <span className="text-lg font-semibold text-white">{txResult.message}</span>
              </div>

              {txResult.hash && (
                <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-gray-400 text-sm mb-1">Хеш транзакции:</div>
                      <code className="text-green-400 text-sm font-mono">{txResult.hash}</code>
                    </div>
                    <button
                      onClick={() => copyToClipboard(txResult.hash!)}
                      className="p-2 hover:bg-gray-700/50 rounded-lg transition-colors"
                    >
                      <Copy className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};