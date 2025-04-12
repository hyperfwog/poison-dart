/**
 * Utility script to debug arbitrage finding process
 *
 * This tool analyzes a specific transaction and simulates the arbitrage finding process,
 * providing detailed logs about the pools considered, paths evaluated, and profit calculations.
 */
import { http, type Address, createPublicClient } from 'viem';
import { Logger } from '../../libs/logger';
import { ArbitrageFinder } from '../arbitrage-finder';
import { CHAINS, DEX_CONTRACTS, loadConfig } from '../config';
import { TransactionParser } from '../core/parser';
import { HyperSwapV2Dex } from '../defi/hyperswap-v2';
import { HyperSwapV3Dex } from '../defi/hyperswap-v3';
import { KittenSwapDex } from '../defi/kittenswap';
import { Protocol } from '../types';

// Create a logger instance
const logger = Logger.forContext('ArbDebugger');

/**
 * Debug the arbitrage finding process for a specific transaction
 * @param txHash Transaction hash to analyze
 */
async function debugArbitrage(txHash: string) {
  logger.info(`Debugging arbitrage finding process for transaction ${txHash}`);

  // Load configuration
  const config = loadConfig();

  // Determine which chain to use
  const chain = config.chainId === 999 ? CHAINS.HYPEREVM : CHAINS.SONIC;
  logger.info(`Using chain: ${chain.name}`);

  // Create Viem client
  const publicClient = createPublicClient({
    chain,
    transport: http(config.rpc.url),
  });

  // Create a dummy wallet client (we won't be sending transactions)
  const walletClient = {
    account: { address: '0x0000000000000000000000000000000000000001' as Address },
  } as any;

  // Create transaction parser
  const parser = new TransactionParser(publicClient);

  // Create arbitrage finder with enhanced debugging
  const finder = new ArbitrageFinderDebug(publicClient, walletClient, config);

  // Log the finder object to see its structure
  logger.info('ArbitrageFinderDebug instance created');
  logger.info(`Finder type: ${typeof finder}`);
  logger.info(`Finder properties: ${Object.keys(finder).join(', ')}`);

  await finder.initialize();

  // Log the finder object after initialization
  logger.info('ArbitrageFinderDebug instance initialized');
  logger.info(`Finder properties after init: ${Object.keys(finder).join(', ')}`);

  // Try to directly access the knownPools property
  const finderAny = finder as any;
  if (finderAny.knownPools) {
    logger.info(`knownPools exists with ${finderAny.knownPools.size} entries`);
    logger.info(`knownPools keys: ${Array.from(finderAny.knownPools.keys()).join(', ')}`);
  } else {
    logger.info('knownPools property does not exist');
  }

  // Try to directly access the tokenGraph property
  if (finderAny.tokenGraph) {
    logger.info(`tokenGraph exists with size ${finderAny.tokenGraph.size}`);
  } else {
    logger.info('tokenGraph property does not exist');
  }

  try {
    // Get transaction
    const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` });

    // Parse transaction
    logger.info('Parsing transaction...');
    const swapInfo = await parser.parseTransaction(tx);

    if (swapInfo) {
      const protocolName = Protocol[swapInfo.protocol];
      logger.info(
        `Detected ${protocolName} swap: ${swapInfo.tokenIn} -> ${swapInfo.tokenOut} (amount: ${swapInfo.amountIn})`
      );

      // Find arbitrage opportunities with enhanced debugging
      logger.info('Finding arbitrage opportunities...');
      const opportunities = await finder.findArbitrageOpportunities(swapInfo);

      if (opportunities.length > 0) {
        logger.info(`Found ${opportunities.length} arbitrage opportunities:`);

        for (let i = 0; i < opportunities.length; i++) {
          const opp = opportunities[i];
          logger.info(`Opportunity ${i + 1}:`);
          logger.info(`  Expected profit: ${opp.expectedProfit}`);
          logger.info(`  Input amount: ${opp.inputAmount}`);
          logger.info(`  Path: ${opp.protocols.join(' -> ')}`);
          logger.info(`  Start token: ${opp.startToken}`);
          logger.info(`  Gas estimate: ${opp.gasEstimate}`);
        }

        // Optimize the best opportunity
        if (opportunities.length > 0) {
          logger.info('Optimizing best opportunity...');
          const optimized = await finder.optimizeOpportunity(opportunities[0]);
          logger.info('Optimized opportunity:');
          logger.info(`  Expected profit: ${optimized.expectedProfit}`);
          logger.info(`  Input amount: ${optimized.inputAmount}`);
          logger.info(`  Path: ${optimized.protocols.join(' -> ')}`);
        }
      } else {
        logger.info('No profitable arbitrage opportunities found.');
      }
    } else {
      logger.info('Transaction could not be parsed as a swap.');
    }
  } catch (error) {
    logger.error(`Error debugging arbitrage: ${error}`);
  }
}

/**
 * Enhanced version of ArbitrageFinder with detailed logging
 */
class ArbitrageFinderDebug extends ArbitrageFinder {
  // Access to the core finder
  private get coreFinder(): any {
    // Access the finder property of the ArbitrageFinder class
    return (this as any).finder;
  }

  // Helper to get pools for debugging
  protected get pools(): any[] {
    try {
      // Access the knownPools Map from the core finder
      if (this.coreFinder?.knownPools) {
        return Array.from(this.coreFinder.knownPools.values());
      }
      return [];
    } catch (error) {
      logger.error(`Error accessing pools: ${error}`);
      return [];
    }
  }

  // Helper to get tokens for debugging
  protected get tokens(): any[] {
    try {
      // Access the tokenGraph from the core finder
      if (this.coreFinder?.tokenGraph) {
        return this.coreFinder.tokenGraph.getTokens();
      }
      return [];
    } catch (error) {
      logger.error(`Error accessing tokens: ${error}`);
      return [];
    }
  }

  /**
   * Helper method to get protocol name from protocol ID
   */
  private getProtocolName(protocolId: number): string {
    // Convert numeric protocol ID to string representation
    switch (protocolId) {
      case 0:
        return 'Unknown';
      case 1:
        return 'HyperSwapV2';
      case 2:
        return 'HyperSwapV3';
      case 3:
        return 'KittenSwap';
      case 4:
        return 'Shadow';
      case 5:
        return 'SwapX';
      default:
        return `Protocol_${protocolId}`;
    }
  }

  /**
   * Override findArbitrageOpportunities to add detailed logging
   */
  async findArbitrageOpportunities(swapInfo: any) {
    logger.info(`Finding arbitrage opportunities for ${swapInfo.tokenIn} -> ${swapInfo.tokenOut}`);

    // Log the pools in the cache
    logger.info(`Pools in cache: ${this.pools.length}`);
    for (const pool of this.pools) {
      const token0 = pool.tokens[0]?.address || 'unknown';
      const token1 = pool.tokens[1]?.address || 'unknown';
      const protocolName = this.getProtocolName(pool.protocol);
      logger.info(`  Pool: ${pool.address} (${protocolName}) - ${token0} <-> ${token1}`);
    }

    // Log the tokens in the cache
    logger.info(`Tokens in cache: ${this.tokens.length}`);
    for (const token of this.tokens) {
      logger.info(`  Token: ${token.address} (${token.symbol || 'Unknown'})`);
    }

    // Find pools containing the tokens in the swap
    const tokenInPools = this.findPoolsWithToken(swapInfo.tokenIn);
    const tokenOutPools = this.findPoolsWithToken(swapInfo.tokenOut);

    logger.info(`Pools containing tokenIn (${swapInfo.tokenIn}): ${tokenInPools.length}`);
    for (const pool of tokenInPools) {
      const protocolName = this.getProtocolName(pool.protocol);
      logger.info(`  Pool: ${pool.address} (${protocolName})`);
    }

    logger.info(`Pools containing tokenOut (${swapInfo.tokenOut}): ${tokenOutPools.length}`);
    for (const pool of tokenOutPools) {
      const protocolName = this.getProtocolName(pool.protocol);
      logger.info(`  Pool: ${pool.address} (${protocolName})`);
    }

    // Find potential arbitrage paths
    logger.info('Finding potential arbitrage paths...');

    // Call the parent method to get the actual opportunities
    const opportunities = await super.findArbitrageOpportunities(swapInfo);

    if (opportunities.length === 0) {
      // If no opportunities were found, let's check why
      logger.info('Analyzing why no opportunities were found:');

      // Check if there are enough pools
      if (this.pools.length < 2) {
        logger.info('  Not enough pools in the cache to create arbitrage paths');
      }

      // Check if there are enough tokens
      if (this.tokens.length < 2) {
        logger.info('  Not enough tokens in the cache to create arbitrage paths');
      }

      // Check if the tokens in the swap are in our cache
      const tokenInFound = this.tokens.some(
        (t: any) => t.address.toLowerCase() === swapInfo.tokenIn.toLowerCase()
      );
      const tokenOutFound = this.tokens.some(
        (t: any) => t.address.toLowerCase() === swapInfo.tokenOut.toLowerCase()
      );

      if (!tokenInFound) {
        logger.info(`  TokenIn (${swapInfo.tokenIn}) not found in the token cache`);
      }

      if (!tokenOutFound) {
        logger.info(`  TokenOut (${swapInfo.tokenOut}) not found in the token cache`);
      }

      // Check if there are enough pools with these tokens
      if (tokenInPools.length === 0) {
        logger.info(`  No pools found containing tokenIn (${swapInfo.tokenIn})`);
      }

      if (tokenOutPools.length === 0) {
        logger.info(`  No pools found containing tokenOut (${swapInfo.tokenOut})`);
      }

      // Check if there are potential paths
      if (tokenInPools.length > 0 && tokenOutPools.length > 0) {
        logger.info('  Pools exist for both tokens, but no profitable paths were found');
        logger.info('  This could be due to:');
        logger.info('    - Insufficient price difference between pools');
        logger.info('    - Gas costs exceeding potential profit');
        logger.info('    - Minimum profit threshold not met');
      }
    }

    return opportunities;
  }

  /**
   * Find pools that contain a specific token
   * @param tokenAddress Token address to search for
   * @returns Array of pools containing the token
   */
  private findPoolsWithToken(tokenAddress: string) {
    return this.pools.filter((pool: any) =>
      pool.tokens.some((token: any) => token.address.toLowerCase() === tokenAddress.toLowerCase())
    );
  }
}

/**
 * Main function
 */
async function main() {
  // Get transaction hash from command line arguments
  const args = process.argv.slice(2);

  if (args.length < 1) {
    logger.error('Usage: bun run src/arb/utils/debug-arbitrage.ts <txHash>');
    process.exit(1);
  }

  const txHash = args[0];

  await debugArbitrage(txHash);
}

// Run the main function
if (require.main === module) {
  main().catch((err) => {
    logger.error(`Error: ${err}`);
    process.exit(1);
  });
}
