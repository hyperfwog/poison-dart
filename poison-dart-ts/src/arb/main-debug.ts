import { CollectorFilterMap, Engine, type Executor } from 'frogberry';
import { MempoolCollector } from 'frogberry/collector';
import { PrinterExecutor, TelegramExecutor } from 'frogberry/executor';
import { TelegramMessage } from 'frogberry/utils/telegram';
/**
 * Arbitrage bot main entry point with enhanced debugging
 */
import { http, createPublicClient, createWalletClient } from 'viem';
import { Transaction } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Logger } from '../libs/logger';
import { CHAINS, loadConfig } from './config';
import { TransactionExecutor } from './executor';
import { ArbStrategyDebug } from './strategy-debug';
import { type Action, ActionType, type Event, EventType } from './types';

// Create a logger instance for the main module
const logger = Logger.forContext('Main');

/**
 * Main function to run the arbitrage bot with enhanced debugging
 */
async function main() {
  logger.info('Starting arbitrage bot with enhanced debugging...');

  // Load configuration
  const config = loadConfig();
  logger.info(`Wallet address: ${config.wallet.address}`);
  logger.info(`Chain ID: ${config.chainId}`);

  // Determine which chain to use
  const chain = config.chainId === 999 ? CHAINS.HYPEREVM : CHAINS.SONIC;
  logger.info(`Using chain: ${chain.name}`);

  // Create Viem clients
  const publicClient = createPublicClient({
    chain,
    transport: http(config.rpc.url),
  });

  const account = privateKeyToAccount(config.wallet.privateKey as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(config.rpc.url),
  });

  // Create the debug strategy
  const strategy = new ArbStrategyDebug(publicClient, walletClient, config);

  // Create the engines
  const mempoolEngine = new Engine<Event, Action>();

  // Create a mempool collector
  const mempoolCollector = MempoolCollector.withHttp(config.rpc.url, chain);

  // Create a custom collector
  mempoolEngine.addCollector({
    name: () => 'MempoolEventCollector',
    async getEventStream() {
      const stream = await mempoolCollector.getEventStream();

      // Create a wrapper stream that converts Transaction to Event
      return {
        async next(): Promise<IteratorResult<Event>> {
          const result = await stream.next();

          if (result.done) {
            return { done: true, value: undefined };
          }

          // Convert Transaction to Event with specific EventType
          const event: Event = {
            type: EventType.Transaction,
            data: result.value,
          };

          return { done: false, value: event };
        },
      };
    },
  });

  // Add strategies
  mempoolEngine.addStrategy(strategy);

  // Add executors
  const txExecutor = new TransactionExecutor(walletClient, publicClient);
  mempoolEngine.addExecutor(txExecutor);

  // Add printer executor for debugging
  const printerExecutor = new PrinterExecutor();
  mempoolEngine.addExecutor(printerExecutor);

  // Add telegram executor if configured
  if (config.telegram) {
    // Create a filtered executor that only processes NotifyViaTelegram actions
    const telegramExecutor = new TelegramExecutor(config.telegram);

    // Create a wrapper executor that extracts the message from the action
    const telegramWrapperExecutor: Executor<Action> = {
      name: () => 'TelegramWrapperExecutor',
      execute: async (action: Action) => {
        if (action.type === ActionType.NotifyViaTelegram) {
          return telegramExecutor.execute(action.data);
        }
      },
    };

    mempoolEngine.addExecutor(telegramWrapperExecutor);
    logger.info('Telegram notifications enabled');
  }

  // Run the engines
  logger.info('Starting engines with enhanced debugging...');

  // Run the mempool engine
  mempoolEngine
    .run()
    .then(() => {
      logger.success('Mempool engine started');
    })
    .catch((err) => {
      logger.error(`Error starting mempool engine: ${err}`, err);
    });

  // Keep the process running
  await new Promise((resolve) => setTimeout(resolve, 24 * 60 * 60 * 1000)); // Run for 24 hours
}

// Run the main function
if (require.main === module) {
  main().catch((err) => {
    logger.error(`Error: ${err}`, err);
    process.exit(1);
  });
}
