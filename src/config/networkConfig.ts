export interface NetworkConfig {
  id: number;
  name: string;
  currency: string;
  rpcUrl: string;
  explorerUrl: string;
  delegateAddress: string;
  gasConfig: {
    gasLimit: number;
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
  };
  relayerKeyEnv: string;
}

export interface NetworksConfig {
  networks: NetworkConfig[];
}

// Import the JSON configuration
import networksData from './networks.json';

export const NETWORKS_CONFIG: NetworksConfig = networksData;

// Helper functions
export function getNetworkById(chainId: number): NetworkConfig | undefined {
  return NETWORKS_CONFIG.networks.find(network => network.id === chainId);
}

export function getAllNetworks(): NetworkConfig[] {
  return NETWORKS_CONFIG.networks;
}

export function getNetworkRpcUrl(chainId: number): string | undefined {
  const network = getNetworkById(chainId);
  return network?.rpcUrl;
}

export function getNetworkExplorerUrl(chainId: number): string | undefined {
  const network = getNetworkById(chainId);
  return network?.explorerUrl;
}

export function getNetworkDelegateAddress(chainId: number): string | undefined {
  const network = getNetworkById(chainId);
  return network?.delegateAddress;
}

export function getNetworkGasConfig(chainId: number) {
  const network = getNetworkById(chainId);
  return network?.gasConfig;
}

export function getNetworkRelayerKey(chainId: number): string | undefined {
  const network = getNetworkById(chainId);
  if (!network) return undefined;
  
  // Get the environment variable value
  return import.meta.env[network.relayerKeyEnv];
}

export function getTransactionUrl(hash: string, chainId: number): string | null {
  const explorerUrl = getNetworkExplorerUrl(chainId);
  if (!explorerUrl) return null;
  return `${explorerUrl}/tx/${hash}`;
}

// Validation functions
export function isNetworkSupported(chainId: number): boolean {
  return NETWORKS_CONFIG.networks.some(network => network.id === chainId);
}

export function validateNetworkConfig(config: NetworkConfig): string[] {
  const errors: string[] = [];
  
  if (!config.id || config.id <= 0) {
    errors.push('Network ID must be a positive number');
  }
  
  if (!config.name || config.name.trim() === '') {
    errors.push('Network name is required');
  }
  
  if (!config.currency || config.currency.trim() === '') {
    errors.push('Network currency is required');
  }
  
  if (!config.rpcUrl || !config.rpcUrl.startsWith('http')) {
    errors.push('Valid RPC URL is required');
  }
  
  if (!config.explorerUrl || !config.explorerUrl.startsWith('http')) {
    errors.push('Valid explorer URL is required');
  }
  
  if (!config.delegateAddress || !/^0x[a-fA-F0-9]{40}$/.test(config.delegateAddress)) {
    errors.push('Valid delegate address is required');
  }
  
  if (!config.gasConfig.gasLimit || config.gasConfig.gasLimit <= 0) {
    errors.push('Gas limit must be a positive number');
  }
  
  return errors;
}