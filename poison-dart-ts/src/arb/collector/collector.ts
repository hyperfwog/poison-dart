/**
 * Event collector for gathering events from different sources
 */
import type { Address, Hash, PublicClient } from 'viem';
import { Logger } from '../../libs/logger';
import { EventType } from '../types';
import type { Event } from '../types';

// Create a logger instance for the collector
const logger = Logger.forContext('Collector');

/**
 * Base class for event collectors
 */
export abstract class BaseCollector {
  protected publicClient: PublicClient;

  constructor(publicClient: PublicClient) {
    this.publicClient = publicClient;
  }

  /**
   * Get an event stream
   * @returns Async iterable of events
   */
  abstract getEventStream(): AsyncIterable<Event>;
}

/**
 * Collector for mempool events
 */
export class MempoolCollector extends BaseCollector {
  private pendingTransactions: Set<Hash> = new Set();
  private eventQueue: Event[] = [];
  private resolveQueue: ((value: IteratorResult<Event, any>) => void)[] = [];

  constructor(publicClient: PublicClient) {
    super(publicClient);
  }

  /**
   * Get a stream of mempool events
   * @returns Async iterable of mempool events
   */
  async *getEventStream(): AsyncIterable<Event> {
    logger.info('Starting mempool collector');

    // Subscribe to new pending transactions
    const unsubscribe = await this.publicClient.watchPendingTransactions({
      onTransactions: async (hashes) => {
        for (const hash of hashes) {
          // Skip if we've already seen this transaction
          if (this.pendingTransactions.has(hash)) {
            continue;
          }

          // Add to pending transactions
          this.pendingTransactions.add(hash);

          try {
            // Get transaction details
            const tx = await this.publicClient.getTransaction({ hash });

            // Create transaction event
            const event: Event = {
              type: EventType.Transaction,
              data: tx,
            };

            // Add to queue or resolve waiting promise
            if (this.resolveQueue.length > 0) {
              const resolve = this.resolveQueue.shift()!;
              resolve({ value: event, done: false });
            } else {
              this.eventQueue.push(event);
            }
          } catch (error) {
            logger.error(`Error getting transaction ${hash}:`, error);
          }
        }
      },
    });

    try {
      // Create async iterator
      while (true) {
        // If there are events in the queue, yield them
        if (this.eventQueue.length > 0) {
          yield this.eventQueue.shift()!;
        } else {
          // Otherwise, wait for an event
          yield await new Promise<Event>((resolve) => {
            this.resolveQueue.push(resolve as any);
          });
        }
      }
    } finally {
      // Clean up subscription when the generator is closed
      unsubscribe();
    }
  }
}

/**
 * Collector for block events
 */
export class BlockCollector extends BaseCollector {
  private lastBlockNumber: bigint = BigInt(0);
  private eventQueue: Event[] = [];
  private resolveQueue: ((value: IteratorResult<Event, any>) => void)[] = [];

  constructor(publicClient: PublicClient) {
    super(publicClient);
  }

  /**
   * Get a stream of block events
   * @returns Async iterable of block events
   */
  async *getEventStream(): AsyncIterable<Event> {
    logger.info('Starting block collector');

    // Subscribe to new blocks
    const unsubscribe = await this.publicClient.watchBlocks({
      onBlock: async (block) => {
        // Skip if we've already seen this block
        if (block.number && block.number <= this.lastBlockNumber) {
          return;
        }

        // Update last block number
        if (block.number) {
          this.lastBlockNumber = block.number;
        }

        // Create block event
        const event: Event = {
          type: EventType.Block,
          data: block,
        };

        // Add to queue or resolve waiting promise
        if (this.resolveQueue.length > 0) {
          const resolve = this.resolveQueue.shift()!;
          resolve({ value: event, done: false });
        } else {
          this.eventQueue.push(event);
        }
      },
    });

    try {
      // Create async iterator
      while (true) {
        // If there are events in the queue, yield them
        if (this.eventQueue.length > 0) {
          yield this.eventQueue.shift()!;
        } else {
          // Otherwise, wait for an event
          yield await new Promise<Event>((resolve) => {
            this.resolveQueue.push(resolve as any);
          });
        }
      }
    } finally {
      // Clean up subscription when the generator is closed
      unsubscribe();
    }
  }
}

/**
 * Collector for log events
 */
export class LogCollector extends BaseCollector {
  private addresses: Address[];
  private topics: Hash[];
  private lastBlockNumber: bigint = BigInt(0);
  private eventQueue: Event[] = [];
  private resolveQueue: ((value: IteratorResult<Event, any>) => void)[] = [];
  private intervalId: NodeJS.Timeout | null = null;

  constructor(publicClient: PublicClient, addresses: Address[] = [], topics: Hash[] = []) {
    super(publicClient);
    this.addresses = addresses;
    this.topics = topics;
  }

  /**
   * Get a stream of log events
   * @returns Async iterable of log events
   */
  async *getEventStream(): AsyncIterable<Event> {
    logger.info('Starting log collector');

    // Create a polling mechanism for logs
    const pollInterval = 5000; // 5 seconds
    this.intervalId = setInterval(async () => {
      try {
        // Get latest block number
        const blockNumber = await this.publicClient.getBlockNumber();
        
        // Skip if we've already processed this block
        if (blockNumber <= this.lastBlockNumber) {
          return;
        }
        
        // Get logs for the new blocks
        // Limit the block range to 100 blocks to avoid RPC errors
        const fromBlock = blockNumber - BigInt(100) > this.lastBlockNumber 
          ? blockNumber - BigInt(100) 
          : this.lastBlockNumber + BigInt(1);
        
        try {
          // Try to get logs with the current block range
          const logs = await this.publicClient.getLogs({
            address: this.addresses.length > 0 ? this.addresses : undefined,
            fromBlock,
            toBlock: blockNumber,
          });
          
          // Process logs
          for (const log of logs) {
            // Create log event
            const event: Event = {
              type: EventType.Log,
              data: log,
            };

            // Add to queue or resolve waiting promise
            if (this.resolveQueue.length > 0) {
              const resolve = this.resolveQueue.shift()!;
              resolve({ value: event, done: false });
            } else {
              this.eventQueue.push(event);
            }
          }
          
          // Update last block number only if successful
          this.lastBlockNumber = blockNumber;
        } catch (error: any) {
          // If the response is too big, reduce the block range and try again
          if (error.code === -32008 || (error.message && error.message.includes('Response is too big'))) {
            logger.warn(`Response too big, reducing block range. Current range: ${fromBlock} to ${blockNumber}`);
            
            // Try with a smaller block range (10 blocks)
            const smallerFromBlock = blockNumber - BigInt(10) > this.lastBlockNumber 
              ? blockNumber - BigInt(10) 
              : this.lastBlockNumber + BigInt(1);
            
            try {
              const logs = await this.publicClient.getLogs({
                address: this.addresses.length > 0 ? this.addresses : undefined,
                fromBlock: smallerFromBlock,
                toBlock: blockNumber,
              });
              
              // Process logs
              for (const log of logs) {
                // Create log event
                const event: Event = {
                  type: EventType.Log,
                  data: log,
                };

                // Add to queue or resolve waiting promise
                if (this.resolveQueue.length > 0) {
                  const resolve = this.resolveQueue.shift()!;
                  resolve({ value: event, done: false });
                } else {
                  this.eventQueue.push(event);
                }
              }
              
              // Update last block number only if successful
              this.lastBlockNumber = blockNumber;
            } catch (innerError) {
              logger.error('Error polling for logs with reduced block range:', innerError);
            }
          } else {
            // For other errors, just log them
            logger.error('Error polling for logs:', error);
          }
        }
        
      } catch (error) {
        // This catch block is for errors outside the log polling logic
        logger.error('Error in log collector interval:', error);
      }
    }, pollInterval);

    try {
      // Create async iterator
      while (true) {
        // If there are events in the queue, yield them
        if (this.eventQueue.length > 0) {
          yield this.eventQueue.shift()!;
        } else {
          // Otherwise, wait for an event
          yield await new Promise<Event>((resolve) => {
            this.resolveQueue.push(resolve as any);
          });
        }
      }
    } finally {
      // Clean up interval when the generator is closed
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
    }
  }
}

/**
 * Enhanced collector that combines multiple collectors
 */
export class EnhancedCollector {
  private collectors: BaseCollector[] = [];

  constructor(publicClient: PublicClient) {
    // Create collectors
    this.collectors.push(new MempoolCollector(publicClient));
    this.collectors.push(new BlockCollector(publicClient));
    
    // Create log collector with DEX addresses
    // These are common DEX addresses on HyperEVM
    const dexAddresses: Address[] = [
      '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f', // HyperSwap V2 Factory
      '0x1F98431c8aD98523631AE4a59f267346ea31F984', // HyperSwap V3 Factory
    ];
    
    // Create log collector with empty topics list
    const swapTopics: Hash[] = [];
    
    this.collectors.push(new LogCollector(publicClient, dexAddresses, swapTopics));
  }

  /**
   * Get a combined stream of events from all collectors
   * @returns Async iterable of events
   */
  async *getEventStream(): AsyncIterable<Event> {
    logger.info('Starting enhanced collector');
    
    // Create event streams from all collectors
    const streams = this.collectors.map((collector) => collector.getEventStream());
    
    // Merge streams
    const mergedStream = this.mergeStreams(streams);
    
    // Yield events from merged stream
    for await (const event of mergedStream) {
      yield event;
    }
  }

  /**
   * Merge multiple async iterables into a single async iterable
   * @param streams Async iterables to merge
   * @returns Merged async iterable
   */
  private async *mergeStreams<T>(streams: AsyncIterable<T>[]): AsyncIterable<T> {
    // Create iterators from streams
    const iterators = streams.map((stream) => stream[Symbol.asyncIterator]());
    
    // Create promises for next values
    const nextPromises = iterators.map((iterator, index) => 
      iterator.next().then((result) => ({ result, index }))
    );
    
    // Yield values as they become available
    while (nextPromises.length > 0) {
      // Wait for the first promise to resolve
      const { result, index } = await Promise.race(nextPromises);
      
      // If the iterator is done, remove it from the list
      if (result.done) {
        nextPromises.splice(index, 1);
        continue;
      }
      
      // Yield the value
      yield result.value;
      
      // Create a new promise for the next value
      nextPromises[index] = iterators[index].next().then((result) => ({ result, index }));
    }
  }
}
