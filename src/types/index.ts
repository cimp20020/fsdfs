export interface WalletState {
  address: string | null;
  isConnected: boolean;
  chainId: number | null;
  balance: string | null;
}

export interface AuthorizationData {
  chainId: number;
  address: string;
  nonce: string;
  yParity: string;
  r: string;
  s: string;
}

export interface TransactionStatus {
  hash: string | null;
  status: 'idle' | 'pending' | 'success' | 'error';
  message: string;
}