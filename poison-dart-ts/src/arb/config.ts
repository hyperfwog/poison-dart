/**
 * Configuration for the arbitrage bot
 */

/**
 * Base tokens to use for arbitrage
 */
export const BASE_TOKENS = {
  // HyperEVM tokens
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
};

/**
 * Gas price multiplier for arbitrage transactions
 */
export const GAS_PRICE_MULTIPLIER = 1.1;

/**
 * Maximum gas to use for arbitrage transactions
 */
export const MAX_GAS = 500000;

/**
 * Minimum profit threshold in base token units
 */
export const MIN_PROFIT_THRESHOLD = BigInt('1000000000000000'); // 0.001 ETH

/**
 * Worker pool size
 */
export const WORKER_POOL_SIZE = 4;

/**
 * Arbitrage cache expiration duration in milliseconds
 */
export const CACHE_EXPIRATION_DURATION = 60000; // 1 minute

/**
 * RPC URL for the HyperEVM chain
 */
export const RPC_URL = 'https://rpc.hyperliquid.xyz/evm';

/**
 * Chain ID for the HyperEVM chain
 */
export const CHAIN_ID = 999;

/**
 * Slippage tolerance percentage
 */
export const SLIPPAGE_TOLERANCE = 0.5; // 0.5%

/**
 * Maximum number of hops in an arbitrage path
 */
export const MAX_HOPS = 3;

/**
 * Flashloan fee percentage
 */
export const FLASHLOAN_FEE = 0.09; // 0.09%

/**
 * DEX contract addresses
 */
export const DEX_CONTRACTS = {
  // HyperSwap
  HYPERSWAP: {
    V2_FACTORY: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    V2_ROUTER: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    V3_FACTORY: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    V3_ROUTER: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  },
  
  // KittenSwap
  KITTENSWAP: {
    FACTORY: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    ROUTER: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  },
};
