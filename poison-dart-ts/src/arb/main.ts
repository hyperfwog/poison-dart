/**
 * Main entry point for the arbitrage bot
 */
import { Chain, createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet } from 'viem/chains';
import { Logger } from '../libs/logger';
import { ArbitrageBot } from './arbitrage-bot';
import { BASE_TOKENS } from './config';

// Create a logger instance for the main entry point
const logger = Logger.forContext('Main');

// Define HyperEVM chain
const hyperEvm: Chain = {
  ...mainnet,
  id: 999,
  name: 'HyperEVM',
  nativeCurrency: {
    name: 'Hype',
    symbol: 'HYPE',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.hyperliquid.xyz/evm'],
    },
    public: {
      http: ['https://rpc.hyperliquid.xyz/evm'],
    },
  },
};

/**
 * Main function
 */
async function main() {
  try {
    logger.info('Starting arbitrage bot');
    
    // Create public client
    const publicClient = createPublicClient({
      chain: hyperEvm,
      transport: http('https://rpc.hyperliquid.xyz/evm'),
    });
    
    // Create wallet client
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('PRIVATE_KEY environment variable is not set');
    }
    
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: hyperEvm,
      transport: http('https://rpc.hyperliquid.xyz/evm'),
    });
    
    // Create arbitrage bot
    const bot = new ArbitrageBot(
      publicClient,
      walletClient,
      999, // HyperEVM chain ID
      Object.values(BASE_TOKENS) as `0x${string}`[]
    );
    
    // Initialize bot
    await bot.initialize();
    
    // Start bot
    await bot.start();
    
    // Handle shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down arbitrage bot');
      await bot.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      logger.info('Shutting down arbitrage bot');
      await bot.stop();
      process.exit(0);
    });
    
    logger.info('Arbitrage bot started');
  } catch (error) {
    logger.error('Error starting arbitrage bot:', error);
    process.exit(1);
  }
}

// Run main function
main().catch((error) => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
