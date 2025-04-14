/**
 * Main arbitrage bot implementation with enhanced state management
 */
import type { Address, PublicClient, WalletClient } from 'viem';
import { Logger } from '../libs/logger';
import { ArbitrageCache, ArbitrageFinder, WorkerPool } from './core';
import { DexIndexer } from './indexer';
import { EnhancedEventCollector, PoolStateManager } from './state';
import type { ArbitrageOpportunity } from './core/types';
import type { Pool } from './types';
import type { StateEvent } from './state';
import { StateEventType } from './state';

// Create a logger instance for the arbitrage bot
const logger = Logger.forContext('ArbitrageBot');

/**
 * Class for the main arbitrage bot with enhanced state management
 */
export class ArbitrageBot {
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private indexer: DexIndexer;
  private finder: ArbitrageFinder;
  private cache: ArbitrageCache;
  private workerPool: WorkerPool;
  private stateManager: PoolStateManager;
  private eventCollector: EnhancedEventCollector;
  private running: boolean = false;
  private baseTokens: Address[];
  private chainId: number;

  constructor(
    publicClient: PublicClient,
    walletClient: WalletClient,
    chainId: number,
    baseTokens: Address[] = []
  ) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.chainId = chainId;
    this.baseTokens = baseTokens;

    // Initialize components
    this.indexer = new DexIndexer(publicClient, chainId);
    this.finder = new ArbitrageFinder(publicClient, walletClient, baseTokens);
    this.cache = new ArbitrageCache();
    
    // Initialize state management
    this.stateManager = new PoolStateManager();
    this.eventCollector = new EnhancedEventCollector(publicClient, this.stateManager);
    
    // Initialize worker pool
    this.workerPool = new WorkerPool(
      4, // Number of workers
      publicClient,
      walletClient,
      this.handleOpportunityEvaluation.bind(this)
    );
    
    // Subscribe to state events
    this.stateManager.subscribe(this.handleStateEvent.bind(this));
  }

  /**
   * Initialize the arbitrage bot
   */
  async initialize(): Promise<void> {
    logger.info('Initializing arbitrage bot...');
    
    // Initialize indexer
    await this.indexer.initialize();
    
    // Initialize state manager
    await this.stateManager.initialize(this.chainId);
    
    // Build token graph
    const pools = this.indexer.getAllPools();
    this.finder.buildGraph(pools);
    
    logger.info('Arbitrage bot initialized');
  }

  /**
   * Start the arbitrage bot
   */
  async start(): Promise<void> {
    if (this.running) {
      logger.warn('Arbitrage bot is already running');
      return;
    }
    
    logger.info('Starting arbitrage bot...');
    this.running = true;
    
    // Start worker pool
    this.workerPool.start();
    
    // Start event collection
    await this.eventCollector.start();
    
    // Perform initial arbitrage search
    this.searchForArbitrageOpportunities();
    
    logger.info('Arbitrage bot started');
  }

  /**
   * Stop the arbitrage bot
   */
  async stop(): Promise<void> {
    if (!this.running) {
      logger.warn('Arbitrage bot is not running');
      return;
    }
    
    logger.info('Stopping arbitrage bot...');
    this.running = false;
    
    // Stop event collection
    this.eventCollector.stop();
    
    // Stop worker pool
    this.workerPool.stop();
    
    // Save pool state to cache
    await this.stateManager.savePoolsToCache(this.chainId);
    
    logger.info('Arbitrage bot stopped');
  }

  /**
   * Handle state events
   * @param event State event
   */
  private async handleStateEvent(event: StateEvent): Promise<void> {
    if (!this.running) return;
    
    switch (event.type) {
      case StateEventType.PoolCreated:
      case StateEventType.PoolUpdated:
        // For both pool creation and updates, we'll rebuild the graph
        // In a production system, we would want to incrementally update the graph
        // but for simplicity, we'll just rebuild it
        logger.info(`Pool ${event.pool.address} ${event.type === StateEventType.PoolCreated ? 'created' : 'updated'}`);
        this.rebuildGraphWithStatePool(event.pool);
        break;
      
      case StateEventType.Swap:
        // Check for arbitrage opportunities after significant swaps
        if (this.isSignificantSwap(event)) {
          this.searchForArbitrageOpportunities();
        }
        break;
      
      default:
        break;
    }
  }
  
  /**
   * Rebuild the token graph with the current pools plus a new/updated pool from state
   * @param statePool Pool from state event
   */
  private rebuildGraphWithStatePool(statePool: Pool): void {
    logger.info(`Rebuilding token graph with updated pool ${statePool.address}`);
    
    // Get all pools from indexer
    const pools = this.indexer.getAllPools();
    
    // Check if the pool already exists in the list
    const existingPoolIndex = pools.findIndex(p => p.address === statePool.address);
    
    if (existingPoolIndex !== -1) {
      // Replace the existing pool with the updated one
      pools[existingPoolIndex] = statePool;
    } else {
      // Add the new pool to the list
      pools.push(statePool);
    }
    
    // Rebuild the graph with the updated pool list
    this.finder.buildGraph(pools);
  }

  /**
   * Check if a swap is significant enough to trigger arbitrage search
   * @param event Swap event
   * @returns Whether the swap is significant
   */
  private isSignificantSwap(event: StateEvent & { type: StateEventType.Swap }): boolean {
    // In a real implementation, you would check if the swap is large enough
    // For now, we'll just return true for all swaps
    return true;
  }

  /**
   * Search for arbitrage opportunities
   */
  private async searchForArbitrageOpportunities(): Promise<void> {
    logger.info('Searching for arbitrage opportunities');
    
    try {
      // Find arbitrage opportunities
      const opportunities = this.finder.findArbitrageOpportunities();
      
      logger.info(`Found ${opportunities.length} potential arbitrage opportunities`);
      
      // Add opportunities to worker pool for evaluation
      for (const opportunity of opportunities) {
        this.workerPool.addOpportunity(opportunity);
      }
    } catch (error) {
      logger.error('Error searching for arbitrage opportunities:', error);
    }
  }

  /**
   * Handle opportunity evaluation
   * @param result Evaluation result
   */
  private async handleOpportunityEvaluation(result: { opportunity: ArbitrageOpportunity; profit: bigint }): Promise<void> {
    const { opportunity, profit } = result;
    
    // Skip if not profitable
    if (profit <= BigInt(0)) {
      return;
    }
    
    logger.info(`Found profitable arbitrage opportunity with profit ${profit}`);
    
    // Execute the arbitrage
    await this.executeArbitrage(opportunity);
  }

  /**
   * Execute an arbitrage opportunity
   * @param opportunity Opportunity to execute
   */
  private async executeArbitrage(opportunity: ArbitrageOpportunity): Promise<void> {
    logger.info(`Executing arbitrage opportunity with profit ${opportunity.expectedProfit}`);
    
    try {
      // Get sender address
      const sender = this.walletClient.account?.address as Address;
      if (!sender) {
        throw new Error('No sender address available');
      }
      
      // Create transaction
      const tx = {
        from: sender,
        to: opportunity.path.getPools()[0].pool.address,
        data: '0x', // In a real implementation, you would create the transaction data
        value: BigInt(0),
      };
      
      // Send transaction
      logger.info('Sending arbitrage transaction');
      
      // In a real implementation, you would send the transaction
      // For now, we'll just log it
      logger.info(`Would send transaction: ${JSON.stringify(tx)}`);
      
      // Log success
      logger.info('Arbitrage transaction sent');
    } catch (error) {
      logger.error('Error executing arbitrage:', error);
    }
  }
}
