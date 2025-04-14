/**
 * Enhanced event collector for efficient event collection and processing
 */
import type { Address, Block, Hash, Log, PublicClient, Transaction } from 'viem';
import { Logger } from '../../libs/logger';
import { EventType, Protocol, Source } from '../types';
import type { Event, SwapEvent } from '../types';
import type { Pool } from '../types';
import type { StateEvent, SwapStateEvent } from './types';
import { StateEventType } from './types';
import type { PoolStateManager } from './pool-state-manager';

// Create a logger instance for the event collector
const logger = Logger.forContext('EventCollector');

/**
 * Class for collecting and processing events from different sources
 */
export class EnhancedEventCollector {
  private publicClient: PublicClient;
  private stateManager: PoolStateManager;
  private lastBlockNumber: bigint = BigInt(0);
  private pendingTransactions: Set<Hash> = new Set();
  private processedLogs: Set<string> = new Set();
  private eventProcessors: Map<string, (event: Event) => Promise<StateEvent[]>> = new Map();
  private protocolProcessors: Map<string, (event: SwapEvent) => Promise<StateEvent[]>> = new Map();
  private isRunning: boolean = false;
  private subscriptions: (() => void)[] = [];

  constructor(publicClient: PublicClient, stateManager: PoolStateManager) {
    this.publicClient = publicClient;
    this.stateManager = stateManager;
    
    // Initialize event processors
    this.initializeEventProcessors();
    this.initializeProtocolProcessors();
  }

  /**
   * Start collecting events
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Event collector is already running');
      return;
    }
    
    logger.info('Starting enhanced event collector');
    this.isRunning = true;
    
    // Start collecting events from different sources
    await this.startBlockSubscription();
    await this.startPendingTransactionsSubscription();
    await this.startLogsSubscription();
  }

  /**
   * Stop collecting events
   */
  stop(): void {
    if (!this.isRunning) {
      logger.warn('Event collector is not running');
      return;
    }
    
    logger.info('Stopping enhanced event collector');
    this.isRunning = false;
    
    // Unsubscribe from all subscriptions
    for (const unsubscribe of this.subscriptions) {
      unsubscribe();
    }
    
    // Clear subscriptions
    this.subscriptions = [];
  }

  /**
   * Initialize event processors
   */
  private initializeEventProcessors(): void {
    // Block processor
    this.eventProcessors.set(EventType.Block, this.processBlockEvent.bind(this));
    
    // Transaction processor
    this.eventProcessors.set(EventType.Transaction, this.processTransactionEvent.bind(this));
    
    // Log processor
    this.eventProcessors.set(EventType.Log, this.processLogEvent.bind(this));
    
    // Swap event processor
    this.eventProcessors.set(EventType.SwapEvent, this.processSwapEvent.bind(this));
  }

  /**
   * Initialize protocol-specific processors
   */
  private initializeProtocolProcessors(): void {
    // HyperSwap V2 processor
    this.protocolProcessors.set(Protocol.HyperSwapV2, this.processHyperSwapV2Event.bind(this));
    
    // HyperSwap V3 processor
    this.protocolProcessors.set(Protocol.HyperSwapV3, this.processHyperSwapV3Event.bind(this));
    
    // KittenSwap processor
    this.protocolProcessors.set(Protocol.KittenSwap, this.processKittenSwapEvent.bind(this));
  }

  /**
   * Start block subscription
   */
  private async startBlockSubscription(): Promise<void> {
    logger.info('Starting block subscription');
    
    try {
      // Get current block number
      const blockNumber = await this.publicClient.getBlockNumber();
      this.lastBlockNumber = blockNumber;
      
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
          
          // Process block
          await this.processEvent({
            type: EventType.Block,
            data: block,
          });
        },
      });
      
      // Add unsubscribe function to subscriptions
      this.subscriptions.push(unsubscribe);
    } catch (error) {
      logger.error('Error starting block subscription:', error);
    }
  }

  /**
   * Start pending transactions subscription
   */
  private async startPendingTransactionsSubscription(): Promise<void> {
    logger.info('Starting pending transactions subscription');
    
    try {
      // Subscribe to pending transactions
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
              
              // Process transaction
              await this.processEvent({
                type: EventType.Transaction,
                data: tx,
              });
            } catch (error) {
              logger.error(`Error getting transaction ${hash}:`, error);
            }
          }
        },
      });
      
      // Add unsubscribe function to subscriptions
      this.subscriptions.push(unsubscribe);
    } catch (error) {
      logger.error('Error starting pending transactions subscription:', error);
    }
  }

  /**
   * Start logs subscription
   */
  private async startLogsSubscription(): Promise<void> {
    logger.info('Starting logs subscription');
    
    // Create DEX addresses filter
    const dexAddresses: Address[] = [
      '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f', // HyperSwap V2 Factory
      '0x1F98431c8aD98523631AE4a59f267346ea31F984', // HyperSwap V3 Factory
    ];
    
    // Start polling for logs
    const intervalId = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(intervalId);
        return;
      }
      
      try {
        // Get latest block number
        const blockNumber = await this.publicClient.getBlockNumber();
        
        // Skip if we've already processed this block
        if (blockNumber <= this.lastBlockNumber) {
          return;
        }
        
        // Get logs for the new blocks
        // Limit the block range to avoid RPC errors
        const fromBlock = blockNumber - BigInt(10) > this.lastBlockNumber 
          ? blockNumber - BigInt(10) 
          : this.lastBlockNumber + BigInt(1);
        
        try {
          // Get logs
          const logs = await this.publicClient.getLogs({
            address: dexAddresses,
            fromBlock,
            toBlock: blockNumber,
          });
          
          // Process logs
          for (const log of logs) {
            // Create unique log ID
            const logId = `${log.transactionHash}-${log.logIndex}`;
            
            // Skip if we've already processed this log
            if (this.processedLogs.has(logId)) {
              continue;
            }
            
            // Add to processed logs
            this.processedLogs.add(logId);
            
            // Process log
            await this.processEvent({
              type: EventType.Log,
              data: log,
            });
          }
          
          // Update last block number
          this.lastBlockNumber = blockNumber;
          
          // Limit the size of processed logs set to avoid memory leaks
          if (this.processedLogs.size > 10000) {
            // Keep only the last 5000 logs
            this.processedLogs = new Set(Array.from(this.processedLogs).slice(-5000));
          }
        } catch (error) {
          logger.error('Error getting logs:', error);
        }
      } catch (error) {
        logger.error('Error in logs polling interval:', error);
      }
    }, 2000); // Poll every 2 seconds
    
    // Add cleanup function to subscriptions
    this.subscriptions.push(() => clearInterval(intervalId));
  }

  /**
   * Process an event
   * @param event Event to process
   */
  private async processEvent(event: Event): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    
    try {
      // Get processor for event type
      const processor = this.eventProcessors.get(event.type);
      
      if (!processor) {
        logger.warn(`No processor found for event type: ${event.type}`);
        return;
      }
      
      // Process event
      const stateEvents = await processor(event);
      
      // Process state events
      for (const stateEvent of stateEvents) {
        await this.stateManager.processEvent(stateEvent);
      }
    } catch (error) {
      logger.error(`Error processing event: ${error}`);
    }
  }

  /**
   * Process a block event
   * @param event Block event
   * @returns State events
   */
  private async processBlockEvent(event: Event): Promise<StateEvent[]> {
    if (event.type !== EventType.Block) return [];
    const block = event.data as Block;
    logger.debug(`Processing block ${block.number}`);
    
    try {
      // Get block with transactions
      const blockWithTransactions = await this.publicClient.getBlock({
        blockNumber: block.number || BigInt(0),
        includeTransactions: true,
      });
      
      // Process transactions in the block
      const stateEvents: StateEvent[] = [];
      
      for (const tx of blockWithTransactions.transactions) {
        // Skip if not a transaction object (should not happen with includeTransactions: true)
        if (typeof tx === 'string') continue;
        
        try {
          // Get transaction receipt to get logs
          const receipt = await this.publicClient.getTransactionReceipt({
            hash: tx.hash,
          });
          
          // Process logs
          for (const log of receipt.logs) {
            // Check if this is a swap event
            if (this.isSwapEvent(log)) {
              // Extract swap information
              const swapEvents = await this.extractSwapEvents(log);
              stateEvents.push(...swapEvents);
            }
          }
        } catch (error) {
          logger.error(`Error processing transaction ${tx.hash}:`, error);
        }
      }
      
      return stateEvents;
    } catch (error) {
      logger.error(`Error processing block ${block.number}:`, error);
      return [];
    }
  }
  
  /**
   * Check if a log is a swap event
   * @param log Log to check
   * @returns Whether the log is a swap event
   */
  private isSwapEvent(log: Log): boolean {
    // HyperSwap V2 Swap event
    const hyperSwapV2SwapTopic = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';
    
    // HyperSwap V3 Swap event
    const hyperSwapV3SwapTopic = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';
    
    // KittenSwap Swap event
    const kittenSwapSwapTopic = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';
    
    // Check if the log has a swap event topic
    return log.topics[0] === hyperSwapV2SwapTopic ||
           log.topics[0] === hyperSwapV3SwapTopic ||
           log.topics[0] === kittenSwapSwapTopic;
  }
  
  /**
   * Extract swap events from a log
   * @param log Log to extract swap events from
   * @returns State events
   */
  private async extractSwapEvents(log: Log): Promise<StateEvent[]> {
    try {
      // Determine protocol based on contract address
      let protocol: Protocol;
      
      // HyperSwap V2 Factory
      if (log.address.toLowerCase() === '0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f') {
        protocol = Protocol.HyperSwapV2;
      }
      // HyperSwap V3 Factory
      else if (log.address.toLowerCase() === '0x1f98431c8ad98523631ae4a59f267346ea31f984') {
        protocol = Protocol.HyperSwapV3;
      }
      // KittenSwap Factory
      else if (log.address.toLowerCase() === '0x1234567890abcdef1234567890abcdef12345678') {
        protocol = Protocol.KittenSwap;
      }
      // Unknown protocol
      else {
        return [];
      }
      
      // Extract swap information based on protocol
      switch (protocol) {
        case Protocol.HyperSwapV2:
          return this.extractHyperSwapV2SwapEvents(log, protocol);
        
        case Protocol.HyperSwapV3:
          return this.extractHyperSwapV3SwapEvents(log, protocol);
        
        case Protocol.KittenSwap:
          return this.extractKittenSwapSwapEvents(log, protocol);
        
        default:
          return [];
      }
    } catch (error) {
      logger.error(`Error extracting swap events:`, error);
      return [];
    }
  }
  
  /**
   * Extract HyperSwap V2 swap events
   * @param log Log to extract swap events from
   * @param protocol Protocol
   * @returns State events
   */
  private async extractHyperSwapV2SwapEvents(log: Log, protocol: Protocol): Promise<StateEvent[]> {
    try {
      // Get pool information
      const pool = await this.getPoolInfo(log.address as Address);
      
      if (!pool) {
        return [];
      }
      
      // For now, just create a simple swap event
      // In a real implementation, you would decode the log data
      
      // Create swap event
      const swapEvent: SwapEvent = {
        protocol,
        pool: log.address as Address,
        tokensIn: [pool.tokens[0].address],
        tokensOut: [pool.tokens[1].address],
        amountsIn: [BigInt(1000000000000000000)], // 1 token
        amountsOut: [BigInt(900000000000000000)], // 0.9 token
        transaction: log.transactionHash || ('0x0000000000000000000000000000000000000000000000000000000000000000' as Hash),
        blockNumber: Number(log.blockNumber || 0),
        timestamp: Date.now(),
      };
      
      // Create state event
      const stateEvent: SwapStateEvent = {
        type: StateEventType.Swap,
        poolAddress: log.address as Address,
        protocol,
        tokenIn: pool.tokens[0].address as Address,
        tokenOut: pool.tokens[1].address as Address,
        amountIn: swapEvent.amountsIn[0],
        amountOut: swapEvent.amountsOut[0],
        timestamp: Date.now(),
        source: Source.Mempool, // Using Mempool as a fallback
        swapEvent,
      };
      
      return [stateEvent];
    } catch (error) {
      logger.error(`Error extracting HyperSwap V2 swap events:`, error);
      return [];
    }
  }
  
  /**
   * Extract HyperSwap V3 swap events
   * @param log Log to extract swap events from
   * @param protocol Protocol
   * @returns State events
   */
  private async extractHyperSwapV3SwapEvents(log: Log, protocol: Protocol): Promise<StateEvent[]> {
    try {
      // Get pool information
      const pool = await this.getPoolInfo(log.address as Address);
      
      if (!pool) {
        return [];
      }
      
      // For now, just create a simple swap event
      // In a real implementation, you would decode the log data
      
      // Create swap event
      const swapEvent: SwapEvent = {
        protocol,
        pool: log.address as Address,
        tokensIn: [pool.tokens[0].address],
        tokensOut: [pool.tokens[1].address],
        amountsIn: [BigInt(1000000000000000000)], // 1 token
        amountsOut: [BigInt(900000000000000000)], // 0.9 token
        transaction: log.transactionHash || ('0x0000000000000000000000000000000000000000000000000000000000000000' as Hash),
        blockNumber: Number(log.blockNumber || 0),
        timestamp: Date.now(),
      };
      
      // Create state event
      const stateEvent: SwapStateEvent = {
        type: StateEventType.Swap,
        poolAddress: log.address as Address,
        protocol,
        tokenIn: pool.tokens[0].address as Address,
        tokenOut: pool.tokens[1].address as Address,
        amountIn: swapEvent.amountsIn[0],
        amountOut: swapEvent.amountsOut[0],
        timestamp: Date.now(),
        source: Source.Mempool, // Using Mempool as a fallback
        swapEvent,
      };
      
      return [stateEvent];
    } catch (error) {
      logger.error(`Error extracting HyperSwap V3 swap events:`, error);
      return [];
    }
  }
  
  /**
   * Extract KittenSwap swap events
   * @param log Log to extract swap events from
   * @param protocol Protocol
   * @returns State events
   */
  private async extractKittenSwapSwapEvents(log: Log, protocol: Protocol): Promise<StateEvent[]> {
    try {
      // KittenSwap uses the same event format as HyperSwap V2
      return this.extractHyperSwapV2SwapEvents(log, protocol);
    } catch (error) {
      logger.error(`Error extracting KittenSwap swap events:`, error);
      return [];
    }
  }
  
  /**
   * Get pool information
   * @param poolAddress Pool address
   * @returns Pool information
   */
  private async getPoolInfo(poolAddress: Address): Promise<Pool | undefined> {
    try {
      // Try to get pool from state manager
      const pool = this.stateManager.getPoolByAddress(poolAddress);
      
      if (pool) {
        return pool;
      }
      
      // If not found, try to get pool information from the blockchain
      // This is a simplified version - in a real implementation, you would
      // need to get the actual pool information from the blockchain
      
      // For now, just return undefined
      return undefined;
    } catch (error) {
      logger.error(`Error getting pool information:`, error);
      return undefined;
    }
  }

  /**
   * Process a transaction event
   * @param event Transaction event
   * @returns State events
   */
  private async processTransactionEvent(event: Event): Promise<StateEvent[]> {
    if (event.type !== EventType.Transaction) return [];
    const transaction = event.data as Transaction;
    logger.debug(`Processing transaction ${transaction.hash}`);
    
    // Extract swap information from transaction
    // This would involve decoding the transaction input data
    // For now, we'll just return an empty array
    return [];
  }

  /**
   * Process a log event
   * @param event Log event
   * @returns State events
   */
  private async processLogEvent(event: Event): Promise<StateEvent[]> {
    if (event.type !== EventType.Log) return [];
    const log = event.data as Log;
    logger.debug(`Processing log ${log.transactionHash}-${log.logIndex}`);
    
    // Check if this is a swap event
    if (this.isSwapEvent(log)) {
      // Extract swap information
      return await this.extractSwapEvents(log);
    }
    
    return [];
  }

  /**
   * Process a swap event
   * @param event Swap event
   * @returns State events
   */
  private async processSwapEvent(event: Event): Promise<StateEvent[]> {
    if (event.type !== EventType.SwapEvent) return [];
    const swapEvent = event.data as SwapEvent;
    logger.debug(`Processing swap event for pool ${swapEvent.pool}`);
    
    // Get processor for protocol
    const processor = this.protocolProcessors.get(swapEvent.protocol);
    
    if (!processor) {
      logger.warn(`No processor found for protocol: ${swapEvent.protocol}`);
      return [];
    }
    
    // Process swap event
    return await processor(swapEvent);
  }

  /**
   * Process a HyperSwap V2 event
   * @param swapEvent Swap event
   * @returns State events
   */
  private async processHyperSwapV2Event(swapEvent: SwapEvent): Promise<StateEvent[]> {
    // Process HyperSwap V2 swap event
    // This would involve extracting token addresses, amounts, etc.
    // For now, we'll just return an empty array
    return [];
  }

  /**
   * Process a HyperSwap V3 event
   * @param swapEvent Swap event
   * @returns State events
   */
  private async processHyperSwapV3Event(swapEvent: SwapEvent): Promise<StateEvent[]> {
    // Process HyperSwap V3 swap event
    // This would involve extracting token addresses, amounts, etc.
    // For now, we'll just return an empty array
    return [];
  }

  /**
   * Process a KittenSwap event
   * @param swapEvent Swap event
   * @returns State events
   */
  private async processKittenSwapEvent(swapEvent: SwapEvent): Promise<StateEvent[]> {
    // Process KittenSwap swap event
    // This would involve extracting token addresses, amounts, etc.
    // For now, we'll just return an empty array
    return [];
  }
}
