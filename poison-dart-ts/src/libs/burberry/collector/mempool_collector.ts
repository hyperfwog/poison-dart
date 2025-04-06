/**
 * Mempool collector
 * Ported from Rust crate burberry/src/collector/mempool_collector.rs
 */

import { Collector, CollectorStream } from '../types';
import { logger } from '../utils/logger';
import { 
  createPublicClient, 
  http, 
  webSocket, 
  type PublicClient, 
  type Chain,
  type Transaction,
  type Hash
} from 'viem';

/**
 * MempoolCollector - collects pending transactions from an Ethereum node
 */
export class MempoolCollector implements Collector<Transaction> {
  private client: PublicClient;
  private pendingTxHashes: Set<Hash> = new Set();
  private processedTxHashes: Set<Hash> = new Set();

  /**
   * Create a new MempoolCollector
   * @param client The Ethereum client to use
   */
  constructor(client: PublicClient) {
    this.client = client;
  }

  /**
   * Create a new MempoolCollector with a WebSocket transport
   * @param url The WebSocket URL of the Ethereum node
   * @param chain The chain to connect to
   * @returns A new MempoolCollector
   */
  static withWebSocket(url: string, chain: Chain): MempoolCollector {
    const client = createPublicClient({
      transport: webSocket(url),
      chain
    });
    return new MempoolCollector(client);
  }

  /**
   * Create a new MempoolCollector with an HTTP transport
   * @param url The HTTP URL of the Ethereum node
   * @param chain The chain to connect to
   * @returns A new MempoolCollector
   */
  static withHttp(url: string, chain: Chain): MempoolCollector {
    const client = createPublicClient({
      transport: http(url),
      chain
    });
    return new MempoolCollector(client);
  }

  name(): string {
    return "MempoolCollector";
  }

  async getEventStream(): Promise<CollectorStream<Transaction>> {
    // Create a queue to buffer transactions
    const queue: Transaction[] = [];
    let resolvers: ((value: IteratorResult<Transaction>) => void)[] = [];
    let done = false;

    // Create a polling mechanism for pending transactions
    const interval = setInterval(async () => {
      try {
        // Get the latest block
        const block = await this.client.getBlock();
        
        // Get transactions from the latest block
        // In a real implementation, we would use a proper mempool API
        // but for this example, we'll just use the transactions from the latest block
        const txHashes = block.transactions;

        // Process new transaction hashes
        for (const txHash of txHashes) {
          // Skip if we've already processed this transaction
          if (this.processedTxHashes.has(txHash)) {
            continue;
          }

          // Add to pending set
          this.pendingTxHashes.add(txHash);
        }

        // Process pending transactions
        const pendingTxHashesArray = Array.from(this.pendingTxHashes);
        for (const txHash of pendingTxHashesArray) {
          try {
            // Get the transaction
            const tx = await this.client.getTransaction({
              hash: txHash
            });

            // Remove from pending set and add to processed set
            this.pendingTxHashes.delete(txHash);
            this.processedTxHashes.add(txHash);

            // Limit the size of the processed set to avoid memory leaks
            if (this.processedTxHashes.size > 10000) {
              const oldestTxHash = Array.from(this.processedTxHashes)[0];
              this.processedTxHashes.delete(oldestTxHash);
            }

            // Emit the transaction
            if (resolvers.length > 0) {
              // If there are waiting resolvers, resolve one with the transaction
              const resolve = resolvers.shift()!;
              resolve({ done: false, value: tx });
            } else {
              // Otherwise, add the transaction to the queue
              queue.push(tx);
            }
          } catch (error) {
            // Transaction might have been removed from the mempool
            this.pendingTxHashes.delete(txHash);
            logger.debug(`Error getting transaction ${txHash}: ${error}`);
          }
        }
      } catch (error) {
        logger.error(`Error in MempoolCollector: ${error}`);
      }
    }, 1000); // Poll every second

    // Function to clean up
    const cleanup = () => {
      clearInterval(interval);
      done = true;
    };

    // Return an async iterator that yields transactions
    return {
      async next(): Promise<IteratorResult<Transaction>> {
        if (done) {
          return { done: true, value: undefined as any };
        }

        if (queue.length > 0) {
          // If there are transactions in the queue, return one
          return { done: false, value: queue.shift()! };
        }

        // Otherwise, wait for a transaction
        return new Promise<IteratorResult<Transaction>>(resolve => {
          resolvers.push(resolve);
        });
      },
      
      // Clean up when the iterator is done
      async return(): Promise<IteratorResult<Transaction>> {
        cleanup();
        return { done: true, value: undefined as any };
      }
    };
  }
}
