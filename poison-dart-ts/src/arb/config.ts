/**
 * Configuration for the arbitrage bot
 */
import type { Address, Chain } from 'viem';
import { sonic } from 'viem/chains';

/**
 * Chain configurations
 */
export const CHAINS = {
  SONIC: {
    ...sonic,
    id: 146, // Correct Sonic chain ID
  },
  HYPEREVM: {
    id: 999,
    name: 'HyperEVM',
    nativeCurrency: {
      decimals: 18,
      name: 'HYPE',
      symbol: 'HYPE',
    },
    rpcUrls: {
      default: {
        http: ['https://rpc.hyperliquid.xyz/evm'],
      },
      public: {
        http: ['https://rpc.hyperliquid.xyz/evm'],
      },
    },
  } as Chain,
};

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
  // KittenSwap (Uniswap V2/V3 and Velodrome V1 fork)
  KITTENSWAP: {
    FACTORY: '0xDa12F450580A4cc485C3b501BAB7b0B3cbc3B31B',
    ROUTER: '0xD6EeFfbDAF6503Ad6539CF8f337D79BEbbd40802',
  },
  // HyperSwap (Uniswap V2/V3 fork)
  HYPERSWAP: {
    // V2
    V2_FACTORY: '0x724412C00059bf7d6ee7d4a1d0D5cd4de3ea1C48',
    V2_ROUTER: '0xb4a9C4e6Ea8E2191d2FA5B380452a634Fb21240A',
    // V3
    V3_FACTORY: '0xB1c0fa0B789320044A6F623cFe5eBda9562602E3',
    V3_ROUTER: '0x4E2960a8cd19B467b82d26D83fAcb0fAE26b094D',
    V3_QUOTER: '0x03A918028f22D9E1473B7959C927AD7425A45C7C',
    V3_POSITION_MANAGER: '0x6eDA206207c09e5428F281761DdC0D300851fBC8',
    V3_TICK_LENS: '0x8F1eA97FfDfEDA3bE7EabfED95eF49f909b2975A',
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
  chainId: number; // Chain ID to use (250 for Sonic, 999 for HyperEVM)
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
  chainId: 146, // Default to Sonic
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

  // Get chain ID from environment or use default
  const chainId = process.env.CHAIN_ID
    ? Number.parseInt(process.env.CHAIN_ID, 10)
    : DEFAULT_CONFIG.chainId;

  // Determine RPC URL based on chain ID
  let rpcUrl = DEFAULT_CONFIG.rpc?.url || '';
  if (chainId === 999) {
    rpcUrl = CHAINS.HYPEREVM.rpcUrls.default.http[0];
  }

  const config: ArbConfig = {
    ...DEFAULT_CONFIG,
    chainId,
    rpc: {
      url: rpcUrl,
      chainId,
    },
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
