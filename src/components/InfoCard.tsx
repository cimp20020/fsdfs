import React from 'react';
import { Info, ExternalLink } from 'lucide-react';

export const InfoCard: React.FC = () => {
  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-blue-500/20 rounded-full">
          <Info className="w-5 h-5 text-blue-400" />
        </div>
        <h3 className="text-xl font-semibold text-white">About EIP-7702</h3>
      </div>
      
      <div className="space-y-4 text-gray-300">
        <p className="text-sm leading-relaxed">
          EIP-7702 introduces a new transaction type that allows Externally Owned Accounts (EOAs) 
          to temporarily behave like smart contracts by delegating their execution to a specified 
          contract address.
        </p>
        
        <div className="bg-black/20 rounded-lg p-4">
          <h4 className="text-white font-medium mb-2">Key Features:</h4>
          <ul className="space-y-1 text-sm">
            <li>• Temporary delegation of account behavior</li>
            <li>• Maintains EOA ownership and control</li>
            <li>• Enables advanced transaction patterns</li>
            <li>• Reversible authorization</li>
          </ul>
        </div>
        
        <div className="bg-amber-500/20 rounded-lg p-4 border border-amber-500/30">
          <h4 className="text-amber-300 font-medium mb-2">Important Notes:</h4>
          <ul className="space-y-1 text-sm text-amber-200">
            <li>• Provide user private key via Private Key Manager</li>
            <li>• Configure relayer key and RPC in .env file</li>
            <li>• Requires EIP-7702 compatible network</li>
            <li>• Always verify delegate contract code</li>
            <li>• Test on testnet first</li>
          </ul>
        </div>
        
        <a
          href="https://eips.ethereum.org/EIPS/eip-7702"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors text-sm"
        >
          <ExternalLink className="w-4 h-4" />
          Read EIP-7702 Specification
        </a>
      </div>
    </div>
  );
};