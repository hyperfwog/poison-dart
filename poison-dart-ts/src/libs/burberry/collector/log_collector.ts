/**
 * Log collector
 * Ported from Rust crate burberry/src/collector/log_collector.rs
 */

import { Collector, CollectorStream } from '../types';
import { logger } from '../utils/logger';
import { 
  createPublicClient, 
  http, 
  webSocket, 
  type PublicClient, 
  type Chain,
  type Log,
  type Address,
  type Hash
} from 'viem';

/**
 * Filter for logs
 */
export interface LogFilter {
  address?: Address | Address[];
  topics?: (Hash | Hash[] | null)[];
  fromBlock?: bigint;
  toBlock?: bigint;
}

/**
 * LogCollector - collects logs from an Ethereum node
 */
export class LogCollector implements Collector<Log> {
  private client: PublicClient;
  private filter: LogFilter;

  /**
   * Create a new LogCollector
   * @param client The Ethereum client to use
   * @param filter The filter to apply to logs
   */
  constructor(client: PublicClient, filter: LogFilter) {
    this.client = client;
    this.filter = filter;
  }

  /**
   * Create a new LogCollector with a WebSocket transport
   * @param url The WebSocket URL of the Ethereum node
   * @param chain The chain to connect to
   * @param filter The filter to apply to logs
   * @returns A new LogCollector
   */
  static withWebSocket(url: string, chain: Chain, filter: LogFilter): LogCollector {
    const client = createPublicClient({
      transport: webSocket(url),
      chain
    });
    return new LogCollector(client, filter);
  }

  /**
   * Create a new LogCollector with an HTTP transport
   * @param url The HTTP URL of the Ethereum node
   * @param chain The chain to connect to
   * @param filter The filter to apply to logs
   * @returns A new LogCollector
   */
  static withHttp(url: string, chain: Chain, filter: LogFilter): LogCollector {
    const client = createPublicClient({
      transport: http(url),
      chain
    });
    return new LogCollector(client, filter);
  }

  name(): string {
    return "LogCollector";
  }

  async getEventStream(): Promise<CollectorStream<Log>> {
    // Create a queue to buffer logs
    const queue: Log[] = [];
    let resolvers: ((value: IteratorResult<Log>) => void)[] = [];
    let done = false;

    // Create a polling mechanism for logs
    const interval = setInterval(async () => {
      try {
        // Get logs since the last block
        const logs = await this.client.getLogs({
          ...this.filter
        });

        for (const log of logs) {
          if (resolvers.length > 0) {
            // If there are waiting resolvers, resolve one with the log
            const resolve = resolvers.shift()!;
            resolve({ done: false, value: log });
          } else {
            // Otherwise, add the log to the queue
            queue.push(log);
          }
        }
      } catch (error) {
        logger.error(`Error in LogCollector: ${error}`);
      }
    }, 1000); // Poll every second

    // Function to clean up
    const cleanup = () => {
      clearInterval(interval);
      done = true;
    };

    // Return an async iterator that yields logs
    return {
      async next(): Promise<IteratorResult<Log>> {
        if (done) {
          return { done: true, value: undefined as any };
        }

        if (queue.length > 0) {
          // If there are logs in the queue, return one
          return { done: false, value: queue.shift()! };
        }

        // Otherwise, wait for a log
        return new Promise<IteratorResult<Log>>(resolve => {
          resolvers.push(resolve);
        });
      },
      
      // Clean up when the iterator is done
      async return(): Promise<IteratorResult<Log>> {
        cleanup();
        return { done: true, value: undefined as any };
      }
    };
  }
}
