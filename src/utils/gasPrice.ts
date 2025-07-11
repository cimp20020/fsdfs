interface GasPrice {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  gasPrice?: bigint;
}

interface GasStationResponse {
  // Ethereum Gas Station format
  fast?: number;
  standard?: number;
  safeLow?: number;
  // Polygon Gas Station format
  FastGasPrice?: string;
  StandardGasPrice?: string;
  SafeGasPrice?: string;
  // BSC format
  result?: string;
}

const GAS_APIS = {
  1: '/etherscan-api/api?module=gastracker&action=gasoracle', // Ethereum
  56: '/bscscan-api/api?module=gastracker&action=gasoracle', // BSC
  137: '/polygon-gas/v2', // Polygon
  42161: null, // Arbitrum - will use provider
  10: null, // Optimism - will use provider
};

const FALLBACK_GAS_PRICES = {
  1: { // Ethereum Mainnet
    maxFeePerGas: BigInt('50000000000'), // 50 gwei
    maxPriorityFeePerGas: BigInt('2000000000'), // 2 gwei
  },
  56: { // BSC
    maxFeePerGas: BigInt('5000000000'), // 5 gwei
    maxPriorityFeePerGas: BigInt('1000000000'), // 1 gwei
  },
  137: { // Polygon
    maxFeePerGas: BigInt('50000000000'), // 50 gwei
    maxPriorityFeePerGas: BigInt('30000000000'), // 30 gwei
  },
  42161: { // Arbitrum
    maxFeePerGas: BigInt('100000000'), // 0.1 gwei
    maxPriorityFeePerGas: BigInt('10000000'), // 0.01 gwei
  },
  10: { // Optimism
    maxFeePerGas: BigInt('100000000'), // 0.1 gwei
    maxPriorityFeePerGas: BigInt('10000000'), // 0.01 gwei
  },
};

export async function fetchGasPrice(chainId: number, provider: any): Promise<GasPrice> {
  console.log(`🔍 Fetching gas prices for chain ${chainId}`);
  
  try {
    // First try to get from provider (most reliable)
    const feeData = await provider.getFeeData();
    
    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
      // EIP-1559 supported network
      const maxFeePerGas = BigInt(Math.floor(Number(feeData.maxFeePerGas) * 1.2));
      const maxPriorityFeePerGas = BigInt(Math.floor(Number(feeData.maxPriorityFeePerGas) * 1.2));
      
      console.log(`✅ Got EIP-1559 fees from provider: ${maxFeePerGas.toString()} / ${maxPriorityFeePerGas.toString()}`);
      
      return {
        maxFeePerGas,
        maxPriorityFeePerGas,
        gasPrice: feeData.gasPrice ? BigInt(feeData.gasPrice.toString()) : undefined
      };
    } else if (feeData.gasPrice) {
      // Legacy gas pricing
      const gasPrice = BigInt(Math.floor(Number(feeData.gasPrice) * 1.5));
      const maxPriorityFeePerGas = BigInt('1500000000'); // 1.5 gwei
      
      console.log(`✅ Got legacy gas price from provider: ${gasPrice.toString()}`);
      
      return {
        maxFeePerGas: gasPrice,
        maxPriorityFeePerGas,
        gasPrice
      };
    }
  } catch (error) {
    console.warn(`⚠️ Failed to get gas from provider:`, error);
  }

  // Try external gas APIs
  const apiUrl = GAS_APIS[chainId as keyof typeof GAS_APIS];
  if (apiUrl) {
    try {
      console.log(`🌐 Fetching from gas API: ${apiUrl}`);
      const response = await fetch(apiUrl);
      const data: GasStationResponse = await response.json();
      
      let gasPrice: bigint;
      
      if (chainId === 1 || chainId === 56) {
        // Ethereum/BSC format
        const fastGwei = data.fast || 30;
        gasPrice = BigInt(fastGwei * 1000000000); // Convert to wei
      } else if (chainId === 137) {
        // Polygon format
        const fastGwei = parseFloat(data.FastGasPrice || '30');
        gasPrice = BigInt(Math.floor(fastGwei * 1000000000));
      } else {
        throw new Error('Unknown API format');
      }
      
      const maxPriorityFeePerGas = BigInt(Math.floor(Number(gasPrice) * 0.1)); // 10% of gas price
      
      console.log(`✅ Got gas from API: ${gasPrice.toString()}`);
      
      return {
        maxFeePerGas: gasPrice,
        maxPriorityFeePerGas,
        gasPrice
      };
    } catch (error) {
      console.warn(`⚠️ Failed to fetch from gas API:`, error);
    }
  }

  // Use fallback prices
  const fallback = FALLBACK_GAS_PRICES[chainId as keyof typeof FALLBACK_GAS_PRICES];
  if (fallback) {
    console.log(`🔄 Using fallback gas prices for chain ${chainId}`);
    return fallback;
  }

  // Ultimate fallback
  console.log(`⚠️ Using ultimate fallback gas prices`);
  return {
    maxFeePerGas: BigInt('20000000000'), // 20 gwei
    maxPriorityFeePerGas: BigInt('2000000000'), // 2 gwei
  };
}

export function formatGasPrice(gasPrice: bigint): string {
  const gwei = Number(gasPrice) / 1000000000;
  return `${gwei.toFixed(2)} gwei`;
}