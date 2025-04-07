/**
 * Configuration for the arbitrage bot
 */
import { Address } from 'viem';

/**
 * Base tokens that are commonly used in trading pairs
 */
export const BASE_TOKENS = {
  wS: '0x039e2fB66102314Ce7b64Ce5Ce3E5183bc94aD38',
  USDC: '0x29219dd400f2Bf60E5a23d13Be72B486D4038894',
  USDT: '0x6047828dc181963ba44974801ff68e538da5eaf9',
  WETH: '0x50c42dEAcD8Fc9773493ED674b675bE577f2634b',
  WBTC: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c',
};

/**
 * DEX contract addresses
 */
export const DEX_CONTRACTS = {
  // Shadow (Uni V3 fork)
  SHADOW: {
    FACTORY: '0xcD2d0637c94fe77C2896BbCBB174cefFb08DE6d7',
    ROUTER: '0x5543c6176feb9b4b179078205d7c29eea2e2d695',
    QUOTER: '0x219b7ADebc0935a3eC889a148c6924D51A07535A',
    POSITION_MANAGER: '0x12E66C8F215DdD5d48d150c8f46aD0c6fB0F4406',
  },
  // SwapX (Algebra V4)
  SWAPX: {
    FACTORY: '0x8121a3F8c4176E9765deEa0B95FA2BDfD3016794',
    ROUTER: '0xE6E9F79e551Dd3FAeF8aBe035896fc65A9eEB26c',
    QUOTER: '0xd74a9Bd1C98B2CbaB5823107eb2BE9C474bEe09A',
    POSITION_MANAGER: '0xd82Fe82244ad01AaD671576202F9b46b76fAdFE2',
  },
};

/**
 * RPC configuration
 */
export interface RpcConfig {
  url: string;
  chainId: number;
}

/**
 * Wallet configuration
 */
export interface WalletConfig {
  address: Address;
  privateKey: string;
}

/**
 * Telegram configuration
 */
export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

/**
 * Arbitrage bot configuration
 */
export interface ArbConfig {
  rpc: RpcConfig;
  wallet: WalletConfig;
  telegram?: TelegramConfig;
  maxGasPrice: bigint;
  minProfitThreshold: bigint; // Minimum profit in wei to execute a trade
  initialCapital: bigint; // Initial capital in wei
  maxSlippage: number; // Maximum slippage as a percentage (e.g., 0.5 for 0.5%)
  maxHops: number; // Maximum number of hops in a trade path
  maxPoolsPerHop: number; // Maximum number of pools to consider per hop
}

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: Partial<ArbConfig> = {
  rpc: {
    url: 'https://rpc.sonic.fantom.network/',
    chainId: 250, // Fantom Opera
  },
  maxGasPrice: BigInt(300000000000), // 300 gwei
  minProfitThreshold: BigInt(1000000000000000), // 0.001 FTM
  initialCapital: BigInt(0b0), // 1000 FTM
  maxSlippage: 0.5, // 0.5%
  maxHops: 3,
  maxPoolsPerHop: 5,
};

/**
 * Load configuration from environment variables
 */
export function loadConfig(): ArbConfig {
  // Load from environment variables
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('PRIVATE_KEY environment variable is required');
  }

  const address = process.env.WALLET_ADDRESS as Address;
  if (!address) {
    throw new Error('WALLET_ADDRESS environment variable is required');
  }

  const config: ArbConfig = {
    ...DEFAULT_CONFIG,
    wallet: {
      address,
      privateKey,
    },
  } as ArbConfig;

  // Optional Telegram configuration
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;
  if (telegramBotToken && telegramChatId) {
    config.telegram = {
      botToken: telegramBotToken,
      chatId: telegramChatId,
    };
  }

  return config;
}
