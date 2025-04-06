/**
 * Arbitrage bot main entry point
 */
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sonic } from 'viem/chains';
import { Engine } from '../libs/burberry/engine.js';
import { BlockCollector } from '../libs/burberry/collector/block_collector.js';
import { LogCollector } from '../libs/burberry/collector/log_collector.js';
import { MempoolCollector } from '../libs/burberry/collector/mempool_collector.js';
import { PrinterExecutor } from '../libs/burberry/executor/printer.js';
import { TelegramExecutor } from '../libs/burberry/executor/telegram.js';
import { ActionType, EventType, type Event, type Action } from './types.js';
import { Executor } from '../libs/burberry/types.js';
import { Message } from '../libs/burberry/executor/telegram.js';
import { loadConfig } from './config.js';
import { ArbStrategy } from './strategy.js';
import { TransactionExecutor } from './executor.js';

/**
 * Main function to run the arbitrage bot
 */
async function main() {
  console.log('Starting arbitrage bot...');

  // Load configuration
  const config = loadConfig();
  console.log(`Wallet address: ${config.wallet.address}`);

  // Create Viem clients
  const publicClient = createPublicClient({
    chain: sonic,
    transport: http(config.rpc.url),
  });

  const account = privateKeyToAccount(config.wallet.privateKey as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: sonic,
    transport: http(config.rpc.url),
  });

  // Create the strategy
  const strategy = new ArbStrategy(publicClient, walletClient, config);

  // Create the engines
  const mempoolEngine = new Engine<Event, Action>();

  const mempoolCollector = MempoolCollector.withHttp(config.rpc.url, sonic);
  mempoolEngine.addCollector({
    ...mempoolCollector,
    getEventStream: async () => {
      const stream = await mempoolCollector.getEventStream();
      return {
        async next() {
          const result = await stream.next();
          if (result.done) return result;
          return {
            done: false,
            value: {
              type: EventType.Transaction,
              data: result.value,
            },
          };
        },
        async return() {
          return stream.return ? stream.return() : { done: true, value: undefined as any };
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
  const printerExecutor = new PrinterExecutor<Action>();
  mempoolEngine.addExecutor(printerExecutor);

  // Add telegram executor if configured
  if (config.telegram) {
    // Create a filtered executor that only processes NotifyViaTelegram actions
    const telegramExecutor = new TelegramExecutor<Message>(config.telegram);
    
    // Create a wrapper executor that extracts the message from the action
    const telegramWrapperExecutor: Executor<Action> = {
      name: () => 'TelegramWrapperExecutor',
      execute: async (action: Action) => {
        if (action.type === ActionType.NotifyViaTelegram) {
          return telegramExecutor.execute(action.data);
        }
      }
    };

    mempoolEngine.addExecutor(telegramWrapperExecutor);
    console.log('Telegram notifications enabled');
  }

  // Run the engines
  console.log('Starting engines...');

  // Run the mempool engine
  mempoolEngine.run().then(() => {
    console.log('Mempool engine started');
  }).catch(err => {
    console.error(`Error starting mempool engine: ${err}`);
  });

  // Keep the process running
  await new Promise(resolve => setTimeout(resolve, 24 * 60 * 60 * 1000)); // Run for 24 hours
}

// Run the main function
if (require.main === module) {
  main().catch(err => {
    console.error(`Error: ${err}`);
    process.exit(1);
  });
}
