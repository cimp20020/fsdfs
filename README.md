# EIP-7702 Authorization Platform

Платформа для работы с EIP-7702 авторизацией и управления смарт-контрактами через релейеры.

## 🚀 Возможности

- **EIP-7702 Авторизация** - делегирование выполнения смарт-контрактам
- **Sweeper Контракт** - управление ETH и токенами
- **Мульти-сетевая поддержка** - работа с несколькими блокчейнами
- **Симуляция транзакций** - интеграция с Tenderly
- **Гибкая конфигурация** - легкое добавление новых сетей

## ⚙️ Конфигурация сетей

Все сети настраиваются через файл `src/config/networks.json`. Вы можете легко добавлять, изменять или удалять сети без изменения кода.

### Структура конфигурации сети:

```json
{
  "id": 1,
  "name": "Ethereum",
  "currency": "ETH",
  "rpcUrl": "https://eth.llamarpc.com",
  "explorerUrl": "https://etherscan.io",
  "delegateAddress": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
  "gasConfig": {
    "gasLimit": 200000,
    "maxFeePerGas": "50000000000",
    "maxPriorityFeePerGas": "2000000000"
  },
  "relayerKeyEnv": "VITE_ETHEREUM_RELAYER_PRIVATE_KEY"
}
```

### Параметры сети:

- **id** - Chain ID сети
- **name** - Название сети
- **currency** - Нативная валюта
- **rpcUrl** - RPC endpoint
- **explorerUrl** - URL блокчейн эксплорера
- **delegateAddress** - Адрес контракта делегата по умолчанию
- **gasConfig** - Настройки газа
  - **gasLimit** - Лимит газа
  - **maxFeePerGas** - Максимальная цена газа (в wei)
  - **maxPriorityFeePerGas** - Приоритетная цена газа (в wei)
- **relayerKeyEnv** - Название переменной окружения с приватным ключом релейера

## 🔧 Настройка переменных окружения

Создайте файл `.env` в корне проекта:

```env
# Основной релейер (BSC по умолчанию)
VITE_RELAYER_PRIVATE_KEY=0x...

# Релейеры для конкретных сетей
VITE_ETHEREUM_RELAYER_PRIVATE_KEY=0x...
VITE_BSC_RELAYER_PRIVATE_KEY=0x...
VITE_POLYGON_RELAYER_PRIVATE_KEY=0x...
VITE_ARBITRUM_RELAYER_PRIVATE_KEY=0x...
VITE_OPTIMISM_RELAYER_PRIVATE_KEY=0x...
VITE_BASE_RELAYER_PRIVATE_KEY=0x...
VITE_SEPOLIA_RELAYER_PRIVATE_KEY=0x...

# Tenderly (опционально)
VITE_TENDERLY_ACCOUNT_ID=your_account_id
VITE_TENDERLY_PROJECT_ID=your_project_id
VITE_TENDERLY_ACCESS_KEY=your_access_key
```

## 📝 Добавление новой сети

1. Откройте `src/config/networks.json`
2. Добавьте новую сеть в массив `networks`:

```json
{
  "id": 250,
  "name": "Fantom",
  "currency": "FTM",
  "rpcUrl": "https://rpc.ftm.tools",
  "explorerUrl": "https://ftmscan.com",
  "delegateAddress": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
  "gasConfig": {
    "gasLimit": 200000,
    "maxFeePerGas": "20000000000",
    "maxPriorityFeePerGas": "2000000000"
  },
  "relayerKeyEnv": "VITE_FANTOM_RELAYER_PRIVATE_KEY"
}
```

3. Добавьте переменную окружения в `.env`:
```env
VITE_FANTOM_RELAYER_PRIVATE_KEY=0x...
```

4. Перезапустите приложение - новая сеть появится автоматически!

## 🛠️ Установка и запуск

```bash
# Установка зависимостей
npm install

# Запуск в режиме разработки
npm run dev

# Сборка для продакшена
npm run build
```

## 🔍 Структура проекта

```
src/
├── components/          # React компоненты
│   ├── AuthorizationPage.tsx
│   ├── SweeperPage.tsx
│   └── RelayerPage.tsx
├── config/             # Конфигурация
│   ├── networks.json   # Конфигурация сетей
│   └── networkConfig.ts # Утилиты для работы с сетями
├── hooks/              # React хуки
│   └── useEnvWallet.ts
├── utils/              # Утилиты
│   ├── tenderly.ts
│   └── gasPrice.ts
└── types/              # TypeScript типы
    └── index.ts
```

## 🌐 Поддерживаемые сети

По умолчанию поддерживаются:

- **Ethereum Mainnet** (Chain ID: 1)
- **BNB Smart Chain** (Chain ID: 56)
- **Polygon** (Chain ID: 137)
- **Arbitrum One** (Chain ID: 42161)
- **Optimism** (Chain ID: 10)
- **Base** (Chain ID: 8453)
- **Sepolia Testnet** (Chain ID: 11155111)

## 🔐 Безопасность

- Приватные ключи хранятся только в переменных окружения
- Никогда не коммитьте `.env` файл в репозиторий
- Используйте отдельные кошельки для тестирования
- Проверяйте адреса контрактов перед отправкой транзакций

## 📚 API Reference

### NetworkConfig

```typescript
interface NetworkConfig {
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
```

### Утилиты

- `getNetworkById(chainId)` - получить конфигурацию сети по ID
- `getAllNetworks()` - получить все сети
- `getTransactionUrl(hash, chainId)` - получить ссылку на транзакцию
- `getNetworkRelayerKey(chainId)` - получить приватный ключ релейера
- `isNetworkSupported(chainId)` - проверить поддержку сети

## 🤝 Вклад в проект

1. Форкните репозиторий
2. Создайте ветку для новой функции
3. Внесите изменения
4. Создайте Pull Request

## 📄 Лицензия

MIT License