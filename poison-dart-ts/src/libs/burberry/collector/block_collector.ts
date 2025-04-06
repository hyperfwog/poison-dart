/**
 * Block collector
 * Ported from Rust crate burberry/src/collector/block_collector.rs
 */

import { Collector, CollectorStream } from '../types';
import { logger } from '../utils/logger';
import { 
  createPublicClient, 
  http, 
  webSocket, 
  type PublicClient, 
  type Chain,
  type Block
} from 'viem';

/**
 * BlockCollector - collects new blocks from an Ethereum node
 */
export class BlockCollector implements Collector<Block> {
  private client: PublicClient;

  /**
   * Create a new BlockCollector
   * @param client The Ethereum client to use
   */
  constructor(client: PublicClient) {
    this.client = client;
  }

  /**
   * Create a new BlockCollector with a WebSocket transport
   * @param url The WebSocket URL of the Ethereum node
   * @param chain The chain to connect to
   * @returns A new BlockCollector
   */
  static withWebSocket(url: string, chain: Chain): BlockCollector {
    const client = createPublicClient({
      transport: webSocket(url),
      chain
    });
    return new BlockCollector(client);
  }

  /**
   * Create a new BlockCollector with an HTTP transport
   * @param url The HTTP URL of the Ethereum node
   * @param chain The chain to connect to
   * @returns A new BlockCollector
   */
  static withHttp(url: string, chain: Chain): BlockCollector {
    const client = createPublicClient({
      transport: http(url),
      chain
    });
    return new BlockCollector(client);
  }

  name(): string {
    return "BlockCollector";
  }

  async getEventStream(): Promise<CollectorStream<Block>> {
    // Create a queue to buffer blocks
    const queue: Block[] = [];
    let resolvers: ((value: IteratorResult<Block>) => void)[] = [];
    let done = false;
    let lastBlockNumber: bigint | null = null;

    // Create a polling mechanism for blocks
    const interval = setInterval(async () => {
      try {
        // Get the latest block
        const block = await this.client.getBlock();
        
        // Only process if it's a new block
        if (lastBlockNumber === null || block.number > lastBlockNumber) {
          lastBlockNumber = block.number;
          
          if (resolvers.length > 0) {
            // If there are waiting resolvers, resolve one with the block
            const resolve = resolvers.shift()!;
            resolve({ done: false, value: block });
          } else {
            // Otherwise, add the block to the queue
            queue.push(block);
          }
        }
      } catch (error) {
        logger.error(`Error in BlockCollector: ${error}`);
      }
    }, 1000); // Poll every second

    // Function to clean up
    const cleanup = () => {
      clearInterval(interval);
      done = true;
    };

    // Return an async iterator that yields blocks
    return {
      async next(): Promise<IteratorResult<Block>> {
        if (done) {
          return { done: true, value: undefined as any };
        }

        if (queue.length > 0) {
          // If there are blocks in the queue, return one
          return { done: false, value: queue.shift()! };
        }

        // Otherwise, wait for a block
        return new Promise<IteratorResult<Block>>(resolve => {
          resolvers.push(resolve);
        });
      },
      
      // Clean up when the iterator is done
      async return(): Promise<IteratorResult<Block>> {
        cleanup();
        return { done: true, value: undefined as any };
      }
    };
  }
}
