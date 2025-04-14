/**
 * Arbitrage finder for discovering opportunities
 */
import type { Address, PublicClient, WalletClient } from 'viem';
import { Logger } from '../../libs/logger';
import { BASE_TOKENS } from '../config';
import type { Pool } from '../types';
import { Source } from '../types';
import { TokenGraph } from './graph';
import { TradeSimulator } from './simulator';
import type { ArbitrageOpportunity } from './types';

// Create a logger instance for the arbitrage finder
const logger = Logger.forContext('ArbitrageFinder');

/**
 * Class for finding arbitrage opportunities
 */
export class ArbitrageFinder {
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private graph: TokenGraph;
  private simulator: TradeSimulator;
  private baseTokens: Address[];

  constructor(
    publicClient: PublicClient,
    walletClient: WalletClient,
    baseTokens: Address[] = Object.values(BASE_TOKENS) as Address[]
  ) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.graph = new TokenGraph(publicClient);
    this.simulator = new TradeSimulator(publicClient, walletClient);
    this.baseTokens = baseTokens;
  }

  /**
   * Build the token graph from pools
   * @param pools Pools to add to the graph
   */
  buildGraph(pools: Pool[]): void {
    logger.info(`Building token graph from ${pools.length} pools`);
    
    // Add pools to the graph
    for (const pool of pools) {
      try {
        // Skip pools with less than 2 tokens
        if (pool.tokens.length < 2) {
          continue;
        }
        
        // Create DEX instances for both directions
        const dexA2B = this.createDex(pool, true);
        const dexB2A = this.createDex(pool, false);
        
        if (dexA2B && dexB2A) {
          // Add pool to the graph
          this.graph.addPool(pool, dexA2B, dexB2A);
        }
      } catch (error) {
        logger.error(`Error adding pool ${pool.address} to graph:`, error);
      }
    }
    
    logger.info(`Token graph built with ${this.graph.size} tokens`);
  }

  /**
   * Create a DEX instance for a pool
   * @param pool Pool to create DEX for
   * @param isA2B Whether to create A to B or B to A DEX
   * @returns DEX instance or null if not supported
   */
  private createDex(pool: Pool, isA2B: boolean): any {
    // This is a simplified version - in a real implementation, you would
    // create the appropriate DEX instance based on the pool protocol
    // For example, if the pool is a HyperSwapV2 pool, you would create a HyperSwapV2Dex
    // If the pool is a HyperSwapV3 pool, you would create a HyperSwapV3Dex
    // etc.
    
    // For now, just return a dummy DEX
    return {
      protocol: () => pool.protocol,
      address: () => pool.address as Address,
      tokenInType: () => isA2B ? pool.tokens[0].address : pool.tokens[1].address,
      tokenOutType: () => isA2B ? pool.tokens[1].address : pool.tokens[0].address,
      liquidity: async () => pool.liquidity || BigInt(0),
      flip: () => {},
      isAToB: () => isA2B,
      swapTx: async () => '0x',
    };
  }

  /**
   * Find arbitrage opportunities
   * @returns List of arbitrage opportunities
   */
  findArbitrageOpportunities(): ArbitrageOpportunity[] {
    logger.info('Finding arbitrage opportunities');
    
    const opportunities: ArbitrageOpportunity[] = [];
    
    // Find opportunities starting from each base token
    for (const baseToken of this.baseTokens) {
      try {
        // Find arbitrage paths using Bellman-Ford
        const paths = this.graph.findArbitrageOpportunities(baseToken);
        
        logger.info(`Found ${paths.length} potential arbitrage paths starting from ${baseToken}`);
        
        // Create opportunities from paths
        for (const path of paths) {
          // Skip empty paths
          if (path.isEmpty()) {
            continue;
          }
          
          // Create opportunity
          const opportunity: ArbitrageOpportunity = {
            path,
            expectedProfit: BigInt(0), // Will be calculated later
            inputAmount: BigInt(0), // Will be calculated later
            protocols: path.path.map(dex => dex.protocol()),
            startToken: baseToken,
            gasEstimate: BigInt(0), // Will be calculated later
            source: Source.Private,
            createdAt: Date.now(),
          };
          
          opportunities.push(opportunity);
        }
      } catch (error) {
        logger.error(`Error finding arbitrage opportunities for ${baseToken}:`, error);
      }
    }
    
    logger.info(`Found ${opportunities.length} potential arbitrage opportunities`);
    return opportunities;
  }

  /**
   * Evaluate an arbitrage opportunity
   * @param opportunity Opportunity to evaluate
   * @returns Evaluated opportunity with profit calculation
   */
  async evaluateOpportunity(opportunity: ArbitrageOpportunity): Promise<ArbitrageOpportunity> {
    logger.info(`Evaluating arbitrage opportunity: ${opportunity.path.toString()}`);
    
    try {
      // Get sender address
      const sender = this.walletClient.account?.address as Address;
      if (!sender) {
        throw new Error('No sender address available');
      }
      
      // Get gas price
      const gasPrice = await this.publicClient.getGasPrice();
      
      // Use grid search to find optimal input amount
      const minAmount = BigInt('1000000000000000'); // 0.001 token
      const maxAmount = BigInt('1000000000000000000'); // 1 token
      const steps = 10;
      
      logger.info('Performing grid search for optimal input amount');
      const gridResult = await this.simulator.gridSearch(
        opportunity.path,
        minAmount,
        maxAmount,
        steps,
        sender,
        gasPrice
      );
      
      // If grid search found a profitable amount, use golden section search to refine
      if (gridResult.result.profit > BigInt(0)) {
        logger.info('Performing golden section search to refine input amount');
        const goldenResult = await this.simulator.goldenSectionSearch(
          opportunity.path,
          gridResult.inputAmount / BigInt(2),
          gridResult.inputAmount * BigInt(2),
          BigInt('1000000000000000'), // 0.001 token tolerance
          sender,
          gasPrice
        );
        
        // Update opportunity with optimal input amount
        opportunity.inputAmount = goldenResult.inputAmount;
        opportunity.expectedProfit = goldenResult.result.profit;
        opportunity.gasEstimate = goldenResult.result.gasCost;
      } else {
        // No profitable amount found
        logger.info('No profitable input amount found');
        opportunity.expectedProfit = BigInt(0);
      }
    } catch (error) {
      logger.error('Error evaluating arbitrage opportunity:', error);
      opportunity.expectedProfit = BigInt(0);
    }
    
    logger.info(`Evaluated arbitrage opportunity with profit ${opportunity.expectedProfit}`);
    return opportunity;
  }

  /**
   * Get the token graph
   * @returns Token graph
   */
  getGraph(): TokenGraph {
    return this.graph;
  }
}
