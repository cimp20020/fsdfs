import React, { useState } from 'react';
import { ethers } from 'ethers';
import { AlertCircle, CheckCircle, Plus, Trash2, GripVertical } from 'lucide-react';

interface Operation {
  id: string;
  type: 'sendETH' | 'sweepETH' | 'sweepTokens' | 'executeCall';
  order: number;
  params: {
    to?: string;
    amount?: string;
    tokenAddress?: string;
    data?: string;
    value?: string;
  };
}

type AuthorizationType = 'standard' | 'sendETH' | 'sweepETH' | 'sweepTokens' | 'executeCall' | 'sequence';

export const AuthorizationPage: React.FC = () => {
  const [privateKey, setPrivateKey] = useState('');
  const [contractAddress, setContractAddress] = useState('');
  const [authorizationType, setAuthorizationType] = useState<AuthorizationType>('standard');
  const [operations, setOperations] = useState<Operation[]>([]);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  
  // Parameters for different authorization types
  const [sendETHParams, setSendETHParams] = useState({ to: '', amount: '' });
  const [sweepETHParams, setSweepETHParams] = useState({ to: '' });
  const [sweepTokensParams, setSweepTokensParams] = useState({ tokenAddress: '', to: '' });
  const [executeCallParams, setExecuteCallParams] = useState({ to: '', data: '', value: '' });

  const isValidAddress = (address: string): boolean => {
    return address.length > 0 && ethers.isAddress(address);
  };

  const isValidPrivateKey = (key: string): boolean => {
    try {
      if (!key.startsWith('0x')) key = '0x' + key;
      return key.length === 66 && /^0x[a-fA-F0-9]{64}$/.test(key);
    } catch {
      return false;
    }
  };

  const addOperation = (type: Operation['type']) => {
    const newOperation: Operation = {
      id: Date.now().toString(),
      type,
      order: operations.length + 1,
      params: {}
    };
    setOperations([...operations, newOperation]);
  };

  const removeOperation = (id: string) => {
    const filtered = operations.filter(op => op.id !== id);
    const reordered = filtered.map((op, index) => ({ ...op, order: index + 1 }));
    setOperations(reordered);
  };

  const updateOperationParams = (id: string, params: Operation['params']) => {
    setOperations(operations.map(op => 
      op.id === id ? { ...op, params } : op
    ));
  };

  const moveOperation = (draggedId: string, targetId: string) => {
    const draggedIndex = operations.findIndex(op => op.id === draggedId);
    const targetIndex = operations.findIndex(op => op.id === targetId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    const newOperations = [...operations];
    const [draggedOperation] = newOperations.splice(draggedIndex, 1);
    newOperations.splice(targetIndex, 0, draggedOperation);
    
    const reordered = newOperations.map((op, index) => ({ ...op, order: index + 1 }));
    setOperations(reordered);
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedItem(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (draggedItem && draggedItem !== targetId) {
      moveOperation(draggedItem, targetId);
    }
    setDraggedItem(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  const canAuthorize = (): boolean => {
    if (!privateKey || !isValidPrivateKey(privateKey)) return false;
    if (!contractAddress || !isValidAddress(contractAddress)) return false;
    
    switch (authorizationType) {
      case 'sendETH':
        return isValidAddress(sendETHParams.to) && parseFloat(sendETHParams.amount) > 0;
      case 'sweepETH':
        return isValidAddress(sweepETHParams.to);
      case 'sweepTokens':
        return isValidAddress(sweepTokensParams.tokenAddress) && isValidAddress(sweepTokensParams.to);
      case 'executeCall':
        return isValidAddress(executeCallParams.to) && executeCallParams.data.length > 0;
      case 'sequence':
        return operations.length > 0 && operations.every(op => {
          switch (op.type) {
            case 'sendETH':
              return isValidAddress(op.params.to || '') && parseFloat(op.params.amount || '0') > 0;
            case 'sweepETH':
              return isValidAddress(op.params.to || '');
            case 'sweepTokens':
              return isValidAddress(op.params.tokenAddress || '') && isValidAddress(op.params.to || '');
            case 'executeCall':
              return isValidAddress(op.params.to || '') && (op.params.data || '').length > 0;
            default:
              return false;
          }
        });
      default:
        return true;
    }
  };

  const handleAuthorize = async () => {
    if (!canAuthorize()) return;
    
    try {
      // Here would be the actual EIP-7702 authorization logic
      console.log('Authorizing with:', {
        privateKey: privateKey.substring(0, 10) + '...',
        contractAddress,
        authorizationType,
        operations: authorizationType === 'sequence' ? operations : undefined
      });
      
      alert('Authorization successful! (This is a demo)');
    } catch (error) {
      console.error('Authorization failed:', error);
      alert('Authorization failed: ' + (error as Error).message);
    }
  };

  const renderOperationForm = (operation: Operation) => {
    const { id, type, params } = operation;
    
    return (
      <div key={id} className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <GripVertical 
              className="w-4 h-4 text-gray-500 cursor-move"
              draggable
              onDragStart={(e) => handleDragStart(e, id)}
              onDragEnd={handleDragEnd}
            />
            <span className="text-sm font-medium text-gray-300">
              {operation.order}. {type === 'sendETH' ? 'Отправить ETH' : 
                                type === 'sweepETH' ? 'Собрать ETH' :
                                type === 'sweepTokens' ? 'Собрать токены' :
                                'Выполнить вызов'}
            </span>
          </div>
          <button
            onClick={() => removeOperation(id)}
            className="text-red-400 hover:text-red-300 p-1"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        
        <div 
          className={`space-y-3 ${draggedItem === id ? 'opacity-50 rotate-1' : ''}`}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, id)}
        >
          {type === 'sendETH' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Получатель</label>
                <input
                  type="text"
                  value={params.to || ''}
                  onChange={(e) => updateOperationParams(id, { ...params, to: e.target.value })}
                  className={`w-full px-3 py-2 bg-gray-900 border rounded-lg text-white ${
                    params.to && !isValidAddress(params.to) ? 'border-red-500' : 'border-gray-600'
                  }`}
                  placeholder="0x..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Количество ETH</label>
                <input
                  type="number"
                  step="0.001"
                  value={params.amount || ''}
                  onChange={(e) => updateOperationParams(id, { ...params, amount: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white"
                  placeholder="0.1"
                />
              </div>
            </>
          )}
          
          {type === 'sweepETH' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Получатель</label>
              <input
                type="text"
                value={params.to || ''}
                onChange={(e) => updateOperationParams(id, { ...params, to: e.target.value })}
                className={`w-full px-3 py-2 bg-gray-900 border rounded-lg text-white ${
                  params.to && !isValidAddress(params.to) ? 'border-red-500' : 'border-gray-600'
                }`}
                placeholder="0x..."
              />
            </div>
          )}
          
          {type === 'sweepTokens' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Адрес токена</label>
                <input
                  type="text"
                  value={params.tokenAddress || ''}
                  onChange={(e) => updateOperationParams(id, { ...params, tokenAddress: e.target.value })}
                  className={`w-full px-3 py-2 bg-gray-900 border rounded-lg text-white ${
                    params.tokenAddress && !isValidAddress(params.tokenAddress) ? 'border-red-500' : 'border-gray-600'
                  }`}
                  placeholder="0x..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Получатель</label>
                <input
                  type="text"
                  value={params.to || ''}
                  onChange={(e) => updateOperationParams(id, { ...params, to: e.target.value })}
                  className={`w-full px-3 py-2 bg-gray-900 border rounded-lg text-white ${
                    params.to && !isValidAddress(params.to) ? 'border-red-500' : 'border-gray-600'
                  }`}
                  placeholder="0x..."
                />
              </div>
            </>
          )}
          
          {type === 'executeCall' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Адрес контракта</label>
                <input
                  type="text"
                  value={params.to || ''}
                  onChange={(e) => updateOperationParams(id, { ...params, to: e.target.value })}
                  className={`w-full px-3 py-2 bg-gray-900 border rounded-lg text-white ${
                    params.to && !isValidAddress(params.to) ? 'border-red-500' : 'border-gray-600'
                  }`}
                  placeholder="0x..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Данные вызова</label>
                <textarea
                  value={params.data || ''}
                  onChange={(e) => updateOperationParams(id, { ...params, data: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white h-20"
                  placeholder="0x..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Значение (ETH)</label>
                <input
                  type="number"
                  step="0.001"
                  value={params.value || ''}
                  onChange={(e) => updateOperationParams(id, { ...params, value: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white"
                  placeholder="0"
                />
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold text-white mb-6">EIP-7702 Авторизация</h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Тип авторизации</h3>
            <div className="space-y-2">
              {[
                { key: 'standard', label: '🔑 Стандартная' },
                { key: 'sendETH', label: '💸 Отправить ETH' },
                { key: 'sweepETH', label: '🔄 Собрать ETH' },
                { key: 'sweepTokens', label: '🪙 Собрать токены' },
                { key: 'executeCall', label: '🎯 Выполнить вызов' },
                { key: 'sequence', label: '📋 Последовательность' }
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setAuthorizationType(key as AuthorizationType)}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                    authorizationType === key
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3 space-y-6">
          {/* Private Key */}
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Приватный ключ пользователя</h3>
            <input
              type="password"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              className={`w-full px-3 py-2 bg-gray-900 border rounded-lg text-white ${
                privateKey && !isValidPrivateKey(privateKey) ? 'border-red-500' : 'border-gray-600'
              }`}
              placeholder="0x... или без 0x"
            />
            {privateKey && !isValidPrivateKey(privateKey) && (
              <div className="mt-2 flex items-center gap-2 text-red-400 text-sm bg-red-500/10 p-2 rounded border border-red-500/20">
                <AlertCircle className="w-4 h-4" />
                Неверный формат приватного ключа
              </div>
            )}
          </div>

          {/* Contract Address */}
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Адрес контракта</h3>
            <input
              type="text"
              value={contractAddress}
              onChange={(e) => setContractAddress(e.target.value)}
              className={`w-full px-3 py-2 bg-gray-900 border rounded-lg text-white ${
                contractAddress && isValidAddress(contractAddress) ? 'border-green-500' :
                contractAddress && !isValidAddress(contractAddress) ? 'border-red-500' : 'border-gray-600'
              }`}
              placeholder="0x..."
            />
            {contractAddress && !isValidAddress(contractAddress) && (
              <div className="mt-2 flex items-center gap-2 text-red-400 text-sm bg-red-500/10 p-2 rounded border border-red-500/20">
                <AlertCircle className="w-4 h-4" />
                Неверный формат адреса Ethereum
              </div>
            )}
          </div>

          {/* Authorization Parameters */}
          {authorizationType !== 'standard' && authorizationType !== 'sequence' && (
            <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">Параметры авторизации</h3>
              
              {authorizationType === 'sendETH' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Получатель</label>
                    <input
                      type="text"
                      value={sendETHParams.to}
                      onChange={(e) => setSendETHParams({ ...sendETHParams, to: e.target.value })}
                      className={`w-full px-3 py-2 bg-gray-900 border rounded-lg text-white ${
                        sendETHParams.to && !isValidAddress(sendETHParams.to) ? 'border-red-500' : 'border-gray-600'
                      }`}
                      placeholder="0x..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Количество ETH</label>
                    <input
                      type="number"
                      step="0.001"
                      value={sendETHParams.amount}
                      onChange={(e) => setSendETHParams({ ...sendETHParams, amount: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white"
                      placeholder="0.1"
                    />
                  </div>
                </div>
              )}

              {authorizationType === 'sweepETH' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Получатель</label>
                  <input
                    type="text"
                    value={sweepETHParams.to}
                    onChange={(e) => setSweepETHParams({ ...sweepETHParams, to: e.target.value })}
                    className={`w-full px-3 py-2 bg-gray-900 border rounded-lg text-white ${
                      sweepETHParams.to && !isValidAddress(sweepETHParams.to) ? 'border-red-500' : 'border-gray-600'
                    }`}
                    placeholder="0x..."
                  />
                </div>
              )}

              {authorizationType === 'sweepTokens' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Адрес токена</label>
                    <input
                      type="text"
                      value={sweepTokensParams.tokenAddress}
                      onChange={(e) => setSweepTokensParams({ ...sweepTokensParams, tokenAddress: e.target.value })}
                      className={`w-full px-3 py-2 bg-gray-900 border rounded-lg text-white ${
                        sweepTokensParams.tokenAddress && !isValidAddress(sweepTokensParams.tokenAddress) ? 'border-red-500' : 'border-gray-600'
                      }`}
                      placeholder="0x..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Получатель</label>
                    <input
                      type="text"
                      value={sweepTokensParams.to}
                      onChange={(e) => setSweepTokensParams({ ...sweepTokensParams, to: e.target.value })}
                      className={`w-full px-3 py-2 bg-gray-900 border rounded-lg text-white ${
                        sweepTokensParams.to && !isValidAddress(sweepTokensParams.to) ? 'border-red-500' : 'border-gray-600'
                      }`}
                      placeholder="0x..."
                    />
                  </div>
                </div>
              )}

              {authorizationType === 'executeCall' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Адрес контракта</label>
                    <input
                      type="text"
                      value={executeCallParams.to}
                      onChange={(e) => setExecuteCallParams({ ...executeCallParams, to: e.target.value })}
                      className={`w-full px-3 py-2 bg-gray-900 border rounded-lg text-white ${
                        executeCallParams.to && !isValidAddress(executeCallParams.to) ? 'border-red-500' : 'border-gray-600'
                      }`}
                      placeholder="0x..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Данные вызова</label>
                    <textarea
                      value={executeCallParams.data}
                      onChange={(e) => setExecuteCallParams({ ...executeCallParams, data: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white h-20"
                      placeholder="0x..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Значение (ETH)</label>
                    <input
                      type="number"
                      step="0.001"
                      value={executeCallParams.value}
                      onChange={(e) => setExecuteCallParams({ ...executeCallParams, value: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white"
                      placeholder="0"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sequence Operations */}
          {authorizationType === 'sequence' && (
            <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Последовательность операций</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => addOperation('sendETH')}
                    disabled={!contractAddress || !isValidAddress(contractAddress)}
                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    sendETH
                  </button>
                  <button
                    onClick={() => addOperation('sweepETH')}
                    disabled={!contractAddress || !isValidAddress(contractAddress)}
                    className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    sweepETH
                  </button>
                  <button
                    onClick={() => addOperation('sweepTokens')}
                    disabled={!contractAddress || !isValidAddress(contractAddress)}
                    className="px-3 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    sweepTokens
                  </button>
                  <button
                    onClick={() => addOperation('executeCall')}
                    disabled={!contractAddress || !isValidAddress(contractAddress)}
                    className="px-3 py-1 bg-orange-600 text-white rounded text-sm hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    executeCall
                  </button>
                </div>
              </div>
              
              <div className="space-y-4">
                {operations.sort((a, b) => a.order - b.order).map(renderOperationForm)}
                {operations.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    Добавьте операции для создания последовательности
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Authorization Button */}
          <div className="flex justify-center">
            <button
              onClick={handleAuthorize}
              disabled={!canAuthorize()}
              className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              🔐 Авторизовать
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};