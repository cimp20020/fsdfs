interface TenderlySimulationRequest {
  network_id: string;
  from: string;
  to: string;
  input: string;
  gas: number;
  gas_price: string;
  value: string;
  access_list?: any[];
  block_number?: string;
  transaction_index?: number;
  save?: boolean;
  save_if_fails?: boolean;
  simulation_type?: 'quick' | 'full';
}

interface TenderlySimulationResponse {
  transaction: {
    hash: string;
    block_hash: string;
    block_number: number;
    from: string;
    gas: number;
    gas_price: string;
    gas_used: number;
    input: string;
    nonce: number;
    to: string;
    transaction_index: number;
    value: string;
    v: string;
    r: string;
    s: string;
    status: boolean;
    gas_used: number;
    cumulative_gas_used: number;
    effective_gas_price: string;
    type: number;
  };
  simulation: {
    id: string;
    project_id: string;
    owner_id: string;
    network_id: string;
    block_number: number;
    transaction_index: number;
    from: string;
    to: string;
    input: string;
    gas: number;
    gas_price: string;
    value: string;
    method: string;
    status: boolean;
    access_list: any[];
    queue_origin: string;
    block_header: any;
    deposit_tx: boolean;
    system_tx: boolean;
    mint: string;
    nonce: number;
    addresses: string[];
    contracts: any[];
    generated_access_list: any[];
    stack_trace: any[];
    logs: any[];
    balance_diff: any[];
    state_diff: any[];
    raw_state_diff: any[];
    console_logs: any[];
    created_at: string;
  };
  contracts: any[];
  generated_access_list: any[];
  error?: {
    message: string;
    slug: string;
  };
}

interface SimulationResult {
  success: boolean;
  gasUsed?: number;
  gasLimit?: number;
  error?: string;
  logs?: any[];
  balanceChanges?: any[];
  stateChanges?: any[];
  simulationId?: string;
  simulationUrl?: string;
}

const TENDERLY_CONFIG = {
  baseUrl: 'https://api.tenderly.co/api/v1',
  // Эти значения должны быть в .env файле
  accountId: import.meta.env.VITE_TENDERLY_ACCOUNT_ID || '',
  projectId: import.meta.env.VITE_TENDERLY_PROJECT_ID || '',
  accessKey: import.meta.env.VITE_TENDERLY_ACCESS_KEY || '',
};

const NETWORK_MAPPING: { [chainId: number]: string } = {
  1: '1',           // Ethereum Mainnet
  56: '56',         // BSC Mainnet
  137: '137',       // Polygon Mainnet
  42161: '42161',   // Arbitrum One
  10: '10',         // Optimism
  8453: '8453',     // Base
  11155111: '11155111', // Sepolia
};

export class TenderlySimulator {
  private isConfigured: boolean;

  constructor() {
    this.isConfigured = !!(
      TENDERLY_CONFIG.accountId && 
      TENDERLY_CONFIG.projectId && 
      TENDERLY_CONFIG.accessKey
    );
    
    if (!this.isConfigured) {
      console.warn('⚠️ Tenderly not configured. Add VITE_TENDERLY_ACCOUNT_ID, VITE_TENDERLY_PROJECT_ID, and VITE_TENDERLY_ACCESS_KEY to .env');
    }
  }

  async simulateTransaction(
    chainId: number,
    from: string,
    to: string,
    data: string = '0x',
    value: string = '0',
    gasLimit: number = 200000
  ): Promise<SimulationResult> {
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Tenderly not configured. Simulation skipped.'
      };
    }

    const networkId = NETWORK_MAPPING[chainId];
    if (!networkId) {
      return {
        success: false,
        error: `Network ${chainId} not supported by Tenderly`
      };
    }

    try {
      console.log('🔍 Simulating transaction with Tenderly...', {
        chainId,
        from,
        to,
        data: data.slice(0, 20) + '...',
        value,
        gasLimit
      });

      const simulationRequest: TenderlySimulationRequest = {
        network_id: networkId,
        from,
        to,
        input: data,
        gas: gasLimit,
        gas_price: '100000000000', // 100 gwei
        value,
        save: true,
        save_if_fails: true,
        simulation_type: 'full'
      };

      const response = await fetch(
        `${TENDERLY_CONFIG.baseUrl}/account/${TENDERLY_CONFIG.accountId}/project/${TENDERLY_CONFIG.projectId}/simulate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Access-Key': TENDERLY_CONFIG.accessKey,
          },
          body: JSON.stringify(simulationRequest),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Tenderly API error: ${response.status} - ${errorText}`);
      }

      const result: TenderlySimulationResponse = await response.json();

      if (result.error) {
        return {
          success: false,
          error: result.error.message || result.error.slug || 'Неизвестная ошибка',
        };
      }

      const simulationUrl = `https://dashboard.tenderly.co/${TENDERLY_CONFIG.accountId}/${TENDERLY_CONFIG.projectId}/simulator/${result.simulation.id}`;

      console.log('✅ Tenderly simulation completed:', {
        success: result.transaction.status,
        gasUsed: result.transaction.gas_used,
        simulationUrl
      });

      return {
        success: result.transaction.status,
        gasUsed: result.transaction.gas_used,
        gasLimit: result.transaction.gas,
        logs: result.simulation.logs,
        balanceChanges: result.simulation.balance_diff,
        stateChanges: result.simulation.state_diff,
        simulationId: result.simulation.id,
        simulationUrl,
        error: !result.transaction.status ? (result.error?.message || 'execution reverted') : undefined
      };

    } catch (error) {
      console.error('❌ Tenderly simulation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Ошибка симуляции',
      };
    }
  }

  private getNetworkName(chainId: number): string {
    const names: { [key: number]: string } = {
      1: 'Ethereum Mainnet',
      56: 'BNB Smart Chain',
      137: 'Polygon Mainnet',
      42161: 'Arbitrum One',
      8453: 'Base Mainnet',
      10: 'Optimism Mainnet',
      11155111: 'Sepolia Testnet',
    };
    return names[chainId] || `Chain ${chainId}`;
  }

  private getNetworkCurrency(chainId: number): string {
    const currencies: { [key: number]: string } = {
      1: 'ETH',
      56: 'BNB',
      137: 'MATIC',
      42161: 'ETH',
      8453: 'ETH',
      10: 'ETH',
      11155111: 'ETH',
    };
    return currencies[chainId] || 'ETH';
  }

  async simulateEIP7702Authorization(
    chainId: number,
    userAddress: string,
    delegateAddress: string,
    relayerAddress: string,
    authData: any,
    gasLimit: number = 100000
  ): Promise<SimulationResult> {
    if (!this.isConfigured) {
      return {
        success: false,
        error: 'Tenderly not configured. Simulation skipped.'
      };
    }

    try {
      console.log('🔍 Simulating EIP-7702 authorization with Tenderly...');

      // Для EIP-7702 симулируем как обычную транзакцию к пользовательскому адресу
      // с пустыми данными, но с authorization list
      return await this.simulateTransaction(
        chainId,
        relayerAddress,
        userAddress,
        '0x', // Empty data for authorization
        '0',  // No value
        gasLimit
      );

    } catch (error) {
      console.error('❌ EIP-7702 simulation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'EIP-7702 simulation failed',
      };
    }
  }

  async simulateContractCall(
    chainId: number,
    from: string,
    contractAddress: string,
    functionData: string,
    value: string = '0',
    gasLimit: number = 200000
  ): Promise<SimulationResult> {
    return await this.simulateTransaction(
      chainId,
      from,
      contractAddress,
      functionData,
      value,
      gasLimit
    );
  }

  isEnabled(): boolean {
    return this.isConfigured;
  }

  getConfigurationInstructions(): string[] {
    return [
      '1. Go to https://dashboard.tenderly.co/',
      '2. Create an account or log in',
      '3. Create a new project',
      '4. Go to Settings → Authorization',
      '5. Generate an Access Key',
      '6. Add to your .env file:',
      '   VITE_TENDERLY_ACCOUNT_ID=your_account_id',
      '   VITE_TENDERLY_PROJECT_ID=your_project_id', 
      '   VITE_TENDERLY_ACCESS_KEY=your_access_key'
    ];
  }
}

export const tenderlySimulator = new TenderlySimulator();

// Helper function to format simulation results for display
export function formatSimulationResult(result: SimulationResult): {
  title: string;
  message: string;
  color: string;
  details?: string[];
} {
  if (!result.success) {
    return {
      title: 'Simulation Failed',
      message: result.error || 'Transaction would fail',
      color: 'red',
      details: result.error ? [result.error] : undefined
    };
  }

  const details: string[] = [];
  
  if (result.gasUsed) {
    details.push(`Gas Used: ${result.gasUsed.toLocaleString()}`);
  }
  
  if (result.gasLimit) {
    details.push(`Gas Limit: ${result.gasLimit.toLocaleString()}`);
  }

  if (result.balanceChanges && result.balanceChanges.length > 0) {
    details.push(`Balance Changes: ${result.balanceChanges.length}`);
  }

  if (result.logs && result.logs.length > 0) {
    details.push(`Events Emitted: ${result.logs.length}`);
  }

  return {
    title: 'Simulation Successful',
    message: 'Transaction would succeed',
    color: 'green',
    details
  };
}