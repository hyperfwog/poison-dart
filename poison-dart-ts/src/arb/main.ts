import { CollectorFilterMap, Engine, type Executor } from 'frogberry';
import { MempoolCollector } from 'frogberry/collector';
import { PrinterExecutor, TelegramExecutor } from 'frogberry/executor';
import { TelegramMessage } from 'frogberry/utils/telegram';
/**
 * Arbitrage bot main entry point
 */
import { http, createPublicClient, createWalletClient } from 'viem';
import { Transaction } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { CHAINS, loadConfig } from './config';
import { TransactionExecutor } from './executor';
import { ArbStrategy } from './strategy';
import { type Action, ActionType, type Event, EventType } from './types';

/**
 * Main function to run the arbitrage bot
 */
async function main() {
  console.log('Starting arbitrage bot...');

  // Load configuration
  const config = loadConfig();
  console.log(`Wallet address: ${config.wallet.address}`);
  console.log(`Chain ID: ${config.chainId}`);

  // Determine which chain to use
  const chain = config.chainId === 999 ? CHAINS.HYPEREVM : CHAINS.SONIC;
  console.log(`Using chain: ${chain.name}`);

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

  // Create the strategy
  const strategy = new ArbStrategy(publicClient, walletClient, config);

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
            return { done: true, value: undefined as any };
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
    console.log('Telegram notifications enabled');
  }

  // Run the engines
  console.log('Starting engines...');

  // Run the mempool engine
  mempoolEngine
    .run()
    .then(() => {
      console.log('Mempool engine started');
    })
    .catch((err) => {
      console.error(`Error starting mempool engine: ${err}`);
    });

  // Keep the process running
  await new Promise((resolve) => setTimeout(resolve, 24 * 60 * 60 * 1000)); // Run for 24 hours
}

// Run the main function
if (require.main === module) {
  main().catch((err) => {
    console.error(`Error: ${err}`);
    process.exit(1);
  });
}
