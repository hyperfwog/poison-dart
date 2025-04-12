/**
 * Arbitrage finder implementation
 */
import { type Address, type PublicClient, type Transaction, type WalletClient } from 'viem';
import { Logger } from '../../libs/logger';
import { BASE_TOKENS } from '../config';
import { type Dex, Path } from '../defi/mod';
import { HyperSwapV2Dex } from '../defi/hyperswap-v2';
import { HyperSwapV3Dex } from '../defi/hyperswap-v3';
import { KittenSwapDex } from '../defi/kittenswap';
import { ShadowDex } from '../defi/shadow';
import { SwapXDex } from '../defi/swapx';
import { type Pool, Protocol } from '../types';
import { type ArbConfig } from '../config';
import { type ArbitrageOpportunity, type SwapInfo } from './types';
import { TokenGraph } from './graph';
import { TransactionParser } from './parser';
import { TradeSimulator } from './simulator';

// Create a logger instance for the arbitrage finder
const logger = Logger.forContext('ArbFinder');

/**
 * Class for finding arbitrage opportunities
 */
export class ArbitrageFinder {
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private config: ArbConfig;
  private tokenGraph: TokenGraph;
  private parser: TransactionParser;
  private simulator: TradeSimulator;
  private knownPools: Map<string, Pool> = new Map();

  constructor(publicClient: PublicClient, walletClient: WalletClient, config: ArbConfig) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.config = config;
    this.tokenGraph = new TokenGraph(publicClient);
    this.parser = new TransactionParser(publicClient);
    this.simulator = new TradeSimulator(publicClient, walletClient);
  }

  /**
   * Initialize the arbitrage finder by discovering pools
   */
  async initialize(): Promise<void> {
    logger.info('Initializing arbitrage finder...');
    
    // Get base tokens for the current chain
    const baseTokens = Object.values(BASE_TOKENS) as Address[];
    
    // Discover pools between base tokens
    await this.discoverPools(baseTokens);
    
    logger.info(`Initialized with ${this.tokenGraph.size} tokens and ${this.knownPools.size} pools`);
  }

  /**
   * Discover pools between tokens
   * @param tokens List of tokens to discover pools between
   */
  private async discoverPools(tokens: Address[]): Promise<void> {
    logger.info(`Discovering pools between ${tokens.length} tokens...`);
    
    // For each pair of tokens, try to find pools
    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        const tokenA = tokens[i];
        const tokenB = tokens[j];
        
        await this.discoverPoolsForPair(tokenA, tokenB);
      }
    }
  }

  /**
   * Discover pools for a pair of tokens
   * @param tokenA First token
   * @param tokenB Second token
   */
  private async discoverPoolsForPair(tokenA: Address, tokenB: Address): Promise<void> {
    // Try to find pools based on the chain ID
    if (this.config.chainId === 999) {
      // HyperEVM chain
      await this.findHyperEVMPools(tokenA, tokenB);
    } else {
      // Sonic chain
      await this.findSonicPools(tokenA, tokenB);
    }
  }

  /**
   * Find pools on HyperEVM chain
   * @param tokenA First token
   * @param tokenB Second token
   */
  private async findHyperEVMPools(tokenA: Address, tokenB: Address): Promise<void> {
    // Try to find KittenSwap pools (both volatile and stable)
    await this.findKittenSwapPools(tokenA, tokenB);
    
    // Try to find HyperSwap V2 pools
    await this.findHyperSwapV2Pools(tokenA, tokenB);
    
    // Try to find HyperSwap V3 pools with different fee tiers
    await this.findHyperSwapV3Pools(tokenA, tokenB);
  }

  /**
   * Find pools on Sonic chain
   * @param tokenA First token
   * @param tokenB Second token
   */
  private async findSonicPools(tokenA: Address, tokenB: Address): Promise<void> {
    // Try to find Shadow pools with different fee tiers
    await this.findShadowPools(tokenA, tokenB);
    
    // Try to find SwapX pools
    await this.findSwapXPools(tokenA, tokenB);
  }

  /**
   * Find KittenSwap pools for a pair of tokens
   * @param tokenA First token
   * @param tokenB Second token
   */
  private async findKittenSwapPools(tokenA: Address, tokenB: Address): Promise<void> {
    try {
      // Try volatile pool
      const volatilePool = await KittenSwapDex.findPool(
        this.publicClient,
        tokenA,
        tokenB,
        false
      );
      
      await this.addPoolToGraph(
        Protocol.KittenSwap,
        volatilePool,
        tokenA,
        tokenB,
        false
      );
      
      logger.debug(`Found KittenSwap volatile pool for ${tokenA}-${tokenB}: ${volatilePool}`);
    } catch (error) {
      // Pool doesn't exist, ignore
    }
    
    try {
      // Try stable pool
      const stablePool = await KittenSwapDex.findPool(
        this.publicClient,
        tokenA,
        tokenB,
        true
      );
      
      await this.addPoolToGraph(
        Protocol.KittenSwapStable,
        stablePool,
        tokenA,
        tokenB,
        true
      );
      
      logger.debug(`Found KittenSwap stable pool for ${tokenA}-${tokenB}: ${stablePool}`);
    } catch (error) {
      // Pool doesn't exist, ignore
    }
  }

  /**
   * Find HyperSwap V2 pools for a pair of tokens
   * @param tokenA First token
   * @param tokenB Second token
   */
  private async findHyperSwapV2Pools(tokenA: Address, tokenB: Address): Promise<void> {
    try {
      const pool = await HyperSwapV2Dex.findPool(
        this.publicClient,
        tokenA,
        tokenB
      );
      
      await this.addPoolToGraph(
        Protocol.HyperSwapV2,
        pool,
        tokenA,
        tokenB
      );
      
      logger.debug(`Found HyperSwap V2 pool for ${tokenA}-${tokenB}: ${pool}`);
    } catch (error) {
      // Pool doesn't exist, ignore
    }
  }

  /**
   * Find HyperSwap V3 pools for a pair of tokens
   * @param tokenA First token
   * @param tokenB Second token
   */
  private async findHyperSwapV3Pools(tokenA: Address, tokenB: Address): Promise<void> {
    // Try different fee tiers
    const feeTiers = [500, 3000, 10000]; // 0.05%, 0.3%, 1%
    
    for (const fee of feeTiers) {
      try {
        const pool = await HyperSwapV3Dex.findPool(
          this.publicClient,
          tokenA,
          tokenB,
          fee
        );
        
        await this.addPoolToGraph(
          Protocol.HyperSwapV3,
          pool,
          tokenA,
          tokenB,
          undefined,
          fee
        );
        
        logger.debug(`Found HyperSwap V3 pool for ${tokenA}-${tokenB} with fee ${fee}: ${pool}`);
      } catch (error) {
        // Pool doesn't exist, ignore
      }
    }
  }

  /**
   * Find Shadow pools for a pair of tokens
   * @param tokenA First token
   * @param tokenB Second token
   */
  private async findShadowPools(tokenA: Address, tokenB: Address): Promise<void> {
    // Try different fee tiers
    const feeTiers = [500, 3000, 10000]; // 0.05%, 0.3%, 1%
    
    for (const fee of feeTiers) {
      try {
        const pool = await ShadowDex.findPool(
          this.publicClient,
          tokenA,
          tokenB,
          fee
        );
        
        await this.addPoolToGraph(
          Protocol.Shadow,
          pool,
          tokenA,
          tokenB,
          undefined,
          fee
        );
        
        logger.debug(`Found Shadow pool for ${tokenA}-${tokenB} with fee ${fee}: ${pool}`);
      } catch (error) {
        // Pool doesn't exist, ignore
      }
    }
  }

  /**
   * Find SwapX pools for a pair of tokens
   * @param tokenA First token
   * @param tokenB Second token
   */
  private async findSwapXPools(tokenA: Address, tokenB: Address): Promise<void> {
    try {
      const pool = await SwapXDex.findPool(
        this.publicClient,
        tokenA,
        tokenB
      );
      
      await this.addPoolToGraph(
        Protocol.SwapX,
        pool,
        tokenA,
        tokenB
      );
      
      logger.debug(`Found SwapX pool for ${tokenA}-${tokenB}: ${pool}`);
    } catch (error) {
      // Pool doesn't exist, ignore
    }
  }

  /**
   * Add a pool to the token graph
   * @param protocol Protocol of the pool
   * @param poolAddress Address of the pool
   * @param tokenA First token
   * @param tokenB Second token
   * @param isStable Whether the pool is stable (for KittenSwap)
   * @param fee Fee tier (for HyperSwap V3 and Shadow)
   */
  private async addPoolToGraph(
    protocol: Protocol,
    poolAddress: Address,
    tokenA: Address,
    tokenB: Address,
    isStable?: boolean,
    fee?: number
  ): Promise<void> {
    // Create pool key
    const poolKey = `${protocol}-${poolAddress}`;
    
    // Skip if we already know this pool
    if (this.knownPools.has(poolKey)) {
      return;
    }
    
    // Get token info
    const tokenAInfo = await this.tokenGraph.getTokenInfo(tokenA);
    const tokenBInfo = await this.tokenGraph.getTokenInfo(tokenB);
    
    // Create pool object
    const pool: Pool = {
      protocol,
      address: poolAddress,
      tokens: [
        { address: tokenA, symbol: tokenAInfo.symbol, decimals: tokenAInfo.decimals },
        { address: tokenB, symbol: tokenBInfo.symbol, decimals: tokenBInfo.decimals },
      ],
    };
    
    // Add fee for HyperSwap V3 and Shadow
    if ((protocol === Protocol.HyperSwapV3 || protocol === Protocol.Shadow) && fee !== undefined) {
      pool.fee = fee;
    }
    
    // Add pool to known pools
    this.knownPools.set(poolKey, pool);
    
    // Create DEX instances
    let dexA2B: Dex;
    let dexB2A: Dex;
    
    switch (protocol) {
      case Protocol.KittenSwap:
      case Protocol.KittenSwapStable:
        dexA2B = new KittenSwapDex(pool, this.publicClient, this.walletClient, true);
        dexB2A = new KittenSwapDex(pool, this.publicClient, this.walletClient, false);
        break;
      case Protocol.HyperSwapV2:
        dexA2B = new HyperSwapV2Dex(pool, this.publicClient, this.walletClient, true);
        dexB2A = new HyperSwapV2Dex(pool, this.publicClient, this.walletClient, false);
        break;
      case Protocol.HyperSwapV3:
        dexA2B = new HyperSwapV3Dex(pool, this.publicClient, this.walletClient, true);
        dexB2A = new HyperSwapV3Dex(pool, this.publicClient, this.walletClient, false);
        break;
      case Protocol.Shadow:
        dexA2B = new ShadowDex(pool, this.publicClient, this.walletClient, true);
        dexB2A = new ShadowDex(pool, this.publicClient, this.walletClient, false);
        break;
      case Protocol.SwapX:
        dexA2B = new SwapXDex(pool, this.publicClient, this.walletClient, true);
        dexB2A = new SwapXDex(pool, this.publicClient, this.walletClient, false);
        break;
      default:
        throw new Error(`Unsupported protocol: ${protocol}`);
    }
    
    // Add pool to token graph
    this.tokenGraph.addPool(pool, dexA2B, dexB2A);
  }

  /**
   * Parse a transaction to extract swap information
   * @param tx Transaction to parse
   * @returns Swap information if the transaction is a swap, null otherwise
   */
  async parseTransaction(tx: Transaction): Promise<SwapInfo | null> {
    // Skip if transaction has no input data
    if (!tx.input || tx.input === '0x') {
      return null;
    }
    
    // Try to parse the transaction as a swap
    return this.parser.parseTransaction(tx);
  }

  /**
   * Process a transaction to find arbitrage opportunities
   * @param tx Transaction to process
   * @returns List of arbitrage opportunities
   */
  async processTransaction(tx: Transaction): Promise<ArbitrageOpportunity[]> {
    // Skip if transaction has no input data
    if (!tx.input || tx.input === '0x') {
      return [];
    }
    
    // Try to parse the transaction as a swap
    const swapInfo = await this.parseTransaction(tx);
    if (!swapInfo) {
      return [];
    }
    
    logger.info(`Found swap in transaction ${tx.hash}: ${swapInfo.protocol} ${swapInfo.tokenIn} -> ${swapInfo.tokenOut}`);
    
    // Find arbitrage opportunities
    return this.findArbitrageOpportunities(swapInfo);
  }

  /**
   * Find arbitrage opportunities based on a swap
   * @param swapInfo Swap information
   * @returns List of arbitrage opportunities
   */
  async findArbitrageOpportunities(swapInfo: SwapInfo): Promise<ArbitrageOpportunity[]> {
    logger.debug(`Finding arbitrage opportunities for ${swapInfo.tokenIn} -> ${swapInfo.tokenOut}`);
    
    const opportunities: ArbitrageOpportunity[] = [];
    
    // Try to find arbitrage paths starting from both tokens
    const startTokens = [swapInfo.tokenIn, swapInfo.tokenOut];
    
    for (const startToken of startTokens) {
      // Find potential arbitrage paths
      const paths = this.tokenGraph.findArbitragePaths(startToken, this.config.maxHops);
      
      // Simulate each path
      for (const path of paths) {
        // Skip paths that don't form a cycle
        if (path[0] !== path[path.length - 1]) {
          continue;
        }
        
        // Create a Path object
        const dexPath = this.tokenGraph.createPathFromTokens(path);
        if (dexPath.isEmpty()) {
          continue;
        }
        
        // Try different input amounts
        const inputAmounts = [
          BigInt('1000000000000000000'), // 1 token
          BigInt('10000000000000000000'), // 10 tokens
          BigInt('100000000000000000000'), // 100 tokens
        ];
        
        for (const inputAmount of inputAmounts) {
          // Simulate the trade
          const tradeResult = await this.simulator.simulateTrade(
            dexPath,
            inputAmount,
            this.walletClient.account?.address as Address,
            this.config.maxGasPrice
          );
          
          // Check if it's profitable
          if (tradeResult.profit > this.config.minProfitThreshold) {
            // Create an arbitrage opportunity
            const opportunity: ArbitrageOpportunity = {
              path: dexPath,
              expectedProfit: tradeResult.profit,
              inputAmount,
              protocols: dexPath.path.map((dex) => dex.protocol()),
              startToken,
              gasEstimate: tradeResult.gasCost,
            };
            
            opportunities.push(opportunity);
            
            logger.info(`Found arbitrage opportunity: ${opportunity.expectedProfit} profit with ${opportunity.protocols.join(' -> ')}`);
          }
        }
      }
    }
    
    return opportunities;
  }

  /**
   * Optimize an arbitrage opportunity to find the optimal input amount
   * @param opportunity Arbitrage opportunity to optimize
   * @returns Optimized arbitrage opportunity
   */
  async optimizeOpportunity(opportunity: ArbitrageOpportunity): Promise<ArbitrageOpportunity> {
    // Use golden section search to find the optimal input amount
    const result = await this.simulator.goldenSectionSearch(
      opportunity.path,
      opportunity.inputAmount / BigInt(10),
      opportunity.inputAmount * BigInt(10),
      BigInt('1000000000000000'), // 0.001 token tolerance
      this.walletClient.account?.address as Address,
      this.config.maxGasPrice
    );
    
    // Create a new opportunity with the optimal input amount
    return {
      ...opportunity,
      inputAmount: result.inputAmount,
      expectedProfit: result.result.profit,
      gasEstimate: result.result.gasCost,
    };
  }
}
