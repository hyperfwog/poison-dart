/**
 * Ethereum example
 * Demonstrates how to use the Ethereum collectors
 */

import { Engine } from '../engine';
import { BlockCollector, LogCollector, MempoolCollector } from '../collector/mod';
import { PrinterExecutor } from '../executor/printer';
import { Strategy, ActionSubmitter } from '../types';
import { logger, LogLevel } from '../utils/logger';
import { mainnet } from 'viem/chains';
import { type Block, type Log, type Transaction } from 'viem';

// Set log level to debug
logger.setLevel(LogLevel.DEBUG);

// Define event and action types
type Event = Block | Log | Transaction;
type Action = string;

// Define a simple strategy for blocks
class BlockStrategy implements Strategy<Block, Action> {
  name(): string {
    return "BlockStrategy";
  }

  async processEvent(event: Block, submitter: ActionSubmitter<Action>): Promise<void> {
    const message = `New block: ${event.number} with ${event.transactions.length} transactions`;
    logger.info(message);
    submitter.submit(message);
  }
}

// Define a simple strategy for logs
class LogStrategy implements Strategy<Log, Action> {
  name(): string {
    return "LogStrategy";
  }

  async processEvent(event: Log, submitter: ActionSubmitter<Action>): Promise<void> {
    const message = `New log: ${event.address} with topics ${event.topics.join(', ')}`;
    logger.info(message);
    submitter.submit(message);
  }
}

// Define a simple strategy for transactions
class TransactionStrategy implements Strategy<Transaction, Action> {
  name(): string {
    return "TransactionStrategy";
  }

  async processEvent(event: Transaction, submitter: ActionSubmitter<Action>): Promise<void> {
    const message = `New transaction: ${event.hash} from ${event.from} to ${event.to}`;
    logger.info(message);
    submitter.submit(message);
  }
}

// Create and run the engines
async function main() {
  // Replace with your Ethereum node URL
  const nodeUrl = 'https://rpc.soniclabs.com';

  // Create a block engine
  const blockEngine = new Engine<Block, Action>();
  blockEngine.addCollector(BlockCollector.withHttp(nodeUrl, mainnet));
  blockEngine.addStrategy(new BlockStrategy());
  blockEngine.addExecutor(new PrinterExecutor<Action>());

  // Create a log engine
  const logEngine = new Engine<Log, Action>();
  logEngine.addCollector(LogCollector.withHttp(nodeUrl, mainnet, {
    // Filter for Transfer events from the USDC contract
    address: '0x29219dd400f2bf60e5a23d13be72b486d4038894',
    topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef']
  }));
  logEngine.addStrategy(new LogStrategy());
  logEngine.addExecutor(new PrinterExecutor<Action>());

  // Create a transaction engine
  const txEngine = new Engine<Transaction, Action>();
  txEngine.addCollector(MempoolCollector.withHttp(nodeUrl, mainnet));
  txEngine.addStrategy(new TransactionStrategy());
  txEngine.addExecutor(new PrinterExecutor<Action>());

  // Run the engines
  logger.info("Starting engines...");
  
  // Run the block engine
  blockEngine.run().then(tasks => {
    logger.info("Block engine started");
  }).catch(err => {
    logger.error(`Error starting block engine: ${err}`);
  });

  // Run the log engine
  logEngine.run().then(tasks => {
    logger.info("Log engine started");
  }).catch(err => {
    logger.error(`Error starting log engine: ${err}`);
  });

  // Run the transaction engine
  txEngine.run().then(tasks => {
    logger.info("Transaction engine started");
  }).catch(err => {
    logger.error(`Error starting transaction engine: ${err}`);
  });

  // Keep the process running
  await new Promise(resolve => setTimeout(resolve, 1000)); // Run for 1 sec
}

// Run the example
if (require.main === module) {
  main().catch(err => {
    logger.error(`Error: ${err}`);
    process.exit(1);
  });
}
