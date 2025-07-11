import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/coingecko-api': {
        target: 'https://api.coingecko.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/coingecko-api/, ''),
      },
      '/etherscan-api': {
        target: 'https://api.etherscan.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/etherscan-api/, ''),
      },
      '/bscscan-api': {
        target: 'https://api.bscscan.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/bscscan-api/, ''),
      },
      '/polygon-gas': {
        target: 'https://gasstation.polygon.technology',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/polygon-gas/, ''),
      },
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
