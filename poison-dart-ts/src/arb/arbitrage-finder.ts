/**
 * Arbitrage finder for HyperEVM DEXes
 * This is a wrapper around the core/finder.ts implementation
 */
import type { Address, PublicClient, Transaction, WalletClient } from 'viem';
import { Logger } from '../libs/logger';
import type { ArbConfig } from './config';
import {
  type ArbitrageOpportunity,
  ArbitrageFinder as CoreArbitrageFinder,
  type SwapInfo,
} from './core';

// Create a logger instance for the arbitrage finder
const logger = Logger.forContext('ArbFinder');

/**
 * Class for finding arbitrage opportunities
 */
export class ArbitrageFinder {
  private finder: CoreArbitrageFinder;

  constructor(publicClient: PublicClient, walletClient: WalletClient, config: ArbConfig) {
    this.finder = new CoreArbitrageFinder(publicClient, walletClient, config);
  }

  /**
   * Initialize the arbitrage finder by discovering pools
   */
  async initialize(): Promise<void> {
    logger.info('Initializing arbitrage finder...');
    await this.finder.initialize();
    logger.info('Arbitrage finder initialized');
  }

  /**
   * Parse a transaction to extract swap information
   * @param tx Transaction to parse
   * @returns Swap information if the transaction is a swap, null otherwise
   */
  async parseTransaction(tx: Transaction): Promise<SwapInfo | null> {
    return this.finder.parseTransaction(tx);
  }

  /**
   * Find arbitrage opportunities based on a swap
   * @param swapInfo Swap information
   * @returns List of arbitrage opportunities
   */
  async findArbitrageOpportunities(swapInfo: SwapInfo): Promise<ArbitrageOpportunity[]> {
    return this.finder.findArbitrageOpportunities(swapInfo);
  }

  /**
   * Process a transaction to find arbitrage opportunities
   * @param tx Transaction to process
   * @returns List of arbitrage opportunities
   */
  async processTransaction(tx: Transaction): Promise<ArbitrageOpportunity[]> {
    return this.finder.processTransaction(tx);
  }

  /**
   * Optimize an arbitrage opportunity to find the optimal input amount
   * @param opportunity Arbitrage opportunity to optimize
   * @returns Optimized arbitrage opportunity
   */
  async optimizeOpportunity(opportunity: ArbitrageOpportunity): Promise<ArbitrageOpportunity> {
    return this.finder.optimizeOpportunity(opportunity);
  }
}
