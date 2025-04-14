/**
 * Pool state manager for efficient tracking and caching of pool states
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Address } from 'viem';
import { Logger } from '../../libs/logger';
import type { Pool, Protocol } from '../types';
import type {
  CacheStats,
  EventSubscription,
  PoolLookup,
  PoolState,
  StateEvent,
  TokenPairKey
} from './types';
import { StateEventType } from './types';

// Create a logger instance for the pool state manager
const logger = Logger.forContext('PoolStateManager');

/**
 * Class for managing pool states with efficient caching
 */
export class PoolStateManager {
  private pools: PoolLookup;
  private generationCounter: number = 0;
  private subscribers: Set<EventSubscription> = new Set();
  private cacheDir: string;
  private stats: CacheStats = {
    poolCount: 0,
    tokenCount: 0,
    tokenPairCount: 0,
    hitCount: 0,
    missCount: 0,
    evictionCount: 0,
    generationCount: 0,
  };

  constructor(cacheDir?: string) {
    // Initialize lookup structures
    this.pools = {
      byAddress: new Map<string, PoolState>(),
      byToken: new Map<string, Set<string>>(),
      byTokenPair: new Map<TokenPairKey, Set<string>>(),
      byProtocol: new Map<Protocol, Set<string>>(),
    };

    // Set cache directory
    this.cacheDir = cacheDir || path.join(process.cwd(), 'cache');
    
    // Create cache directory if it doesn't exist
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Initialize the pool state manager
   */
  async initialize(chainId: number): Promise<void> {
    logger.info('Initializing pool state manager...');
    
    // Try to load pools from cache
    const loaded = await this.loadPoolsFromCache(chainId);
    
    if (!loaded) {
      logger.info('No cache found or cache is invalid');
    }
    
    logger.info(`Pool state manager initialized with ${this.stats.poolCount} pools`);
  }

  /**
   * Process a state event
   * @param event State event to process
   */
  async processEvent(event: StateEvent): Promise<void> {
    switch (event.type) {
      case StateEventType.PoolCreated:
        await this.handlePoolCreated(event);
        break;
      
      case StateEventType.PoolUpdated:
        await this.handlePoolUpdated(event);
        break;
      
      case StateEventType.Swap:
        await this.handleSwap(event);
        break;
      
      case StateEventType.LiquidityAdded:
        await this.handleLiquidityAdded(event);
        break;
      
      case StateEventType.LiquidityRemoved:
        await this.handleLiquidityRemoved(event);
        break;
      
      default:
        logger.warn(`Unknown event type: ${(event as any).type}`);
        break;
    }

    // Notify subscribers
    this.notifySubscribers(event);
  }

  /**
   * Subscribe to state events
   * @param callback Callback function to call when an event occurs
   * @returns Unsubscribe function
   */
  subscribe(callback: EventSubscription): () => void {
    this.subscribers.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Get a pool by its address
   * @param address Pool address
   * @returns Pool or undefined if not found
   */
  getPoolByAddress(address: Address): Pool | undefined {
    const normalizedAddress = address.toLowerCase();
    const poolState = this.pools.byAddress.get(normalizedAddress);
    
    if (poolState) {
      this.stats.hitCount++;
      return poolState.pool;
    }
    
    this.stats.missCount++;
    return undefined;
  }

  /**
   * Get pools by token
   * @param tokenAddress Token address
   * @returns Array of pools that contain the token
   */
  getPoolsByToken(tokenAddress: Address): Pool[] {
    const normalizedAddress = tokenAddress.toLowerCase();
    const poolAddresses = this.pools.byToken.get(normalizedAddress);
    
    if (!poolAddresses) {
      this.stats.missCount++;
      return [];
    }
    
    const result: Pool[] = [];
    
    for (const address of poolAddresses) {
      const poolState = this.pools.byAddress.get(address);
      if (poolState) {
        result.push(poolState.pool);
      }
    }
    
    if (result.length > 0) {
      this.stats.hitCount++;
    } else {
      this.stats.missCount++;
    }
    
    return result;
  }

  /**
   * Get pools by token pair
   * @param token0Address First token address
   * @param token1Address Second token address
   * @returns Array of pools that contain both tokens
   */
  getPoolsByTokenPair(token0Address: Address, token1Address: Address): Pool[] {
    const normalizedToken0 = token0Address.toLowerCase();
    const normalizedToken1 = token1Address.toLowerCase();
    
    // Create token pair key (sorted to ensure consistency)
    const key = this.createTokenPairKey(normalizedToken0, normalizedToken1);
    
    const poolAddresses = this.pools.byTokenPair.get(key);
    
    if (!poolAddresses) {
      this.stats.missCount++;
      return [];
    }
    
    const result: Pool[] = [];
    
    for (const address of poolAddresses) {
      const poolState = this.pools.byAddress.get(address);
      if (poolState) {
        result.push(poolState.pool);
      }
    }
    
    if (result.length > 0) {
      this.stats.hitCount++;
    } else {
      this.stats.missCount++;
    }
    
    return result;
  }

  /**
   * Get pools by protocol
   * @param protocol Protocol
   * @returns Array of pools for the protocol
   */
  getPoolsByProtocol(protocol: Protocol): Pool[] {
    const poolAddresses = this.pools.byProtocol.get(protocol);
    
    if (!poolAddresses) {
      this.stats.missCount++;
      return [];
    }
    
    const result: Pool[] = [];
    
    for (const address of poolAddresses) {
      const poolState = this.pools.byAddress.get(address);
      if (poolState) {
        result.push(poolState.pool);
      }
    }
    
    if (result.length > 0) {
      this.stats.hitCount++;
    } else {
      this.stats.missCount++;
    }
    
    return result;
  }

  /**
   * Get all pools
   * @returns Array of all pools
   */
  getAllPools(): Pool[] {
    return Array.from(this.pools.byAddress.values()).map(state => state.pool);
  }

  /**
   * Get cache statistics
   * @returns Cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Save pools to cache
   * @param chainId Chain ID
   */
  async savePoolsToCache(chainId: number): Promise<void> {
    try {
      // Convert pools to array for serialization
      const poolsArray = Array.from(this.pools.byAddress.values()).map(state => state.pool);

      // Create cache directory if it doesn't exist
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }

      // Save to file
      const cacheFile = path.join(this.cacheDir, `pools-${chainId}.json`);
      fs.writeFileSync(cacheFile, JSON.stringify(poolsArray, (key, value) => {
        // Convert BigInt to string for serialization
        if (typeof value === 'bigint') {
          return value.toString();
        }
        return value;
      }, 2));

      logger.info(`Saved ${poolsArray.length} pools to cache file ${cacheFile}`);
    } catch (error) {
      logger.error(`Failed to save pools to cache: ${error}`);
    }
  }

  /**
   * Load pools from cache
   * @param chainId Chain ID
   * @returns Whether pools were successfully loaded
   */
  private async loadPoolsFromCache(chainId: number): Promise<boolean> {
    try {
      // Check if cache file exists
      const cacheFile = path.join(this.cacheDir, `pools-${chainId}.json`);
      if (!fs.existsSync(cacheFile)) {
        logger.info(`Cache file ${cacheFile} not found`);
        return false;
      }

      // Read cache file
      const cacheData = fs.readFileSync(cacheFile, 'utf-8');
      const poolsArray = JSON.parse(cacheData, (key, value) => {
        // Convert string back to BigInt if it looks like a BigInt
        if (typeof value === 'string' && /^\d+$/.test(value) && key.match(/^(reserves|liquidity|sqrtPriceX96)$/)) {
          return BigInt(value);
        }
        return value;
      }) as Pool[];

      // Clear existing pools
      this.clearPools();

      // Add pools to cache
      for (const pool of poolsArray) {
        this.addPool(pool);
      }

      logger.info(`Loaded ${poolsArray.length} pools from cache file ${cacheFile}`);
      return true;
    } catch (error) {
      logger.error(`Failed to load pools from cache: ${error}`);
      return false;
    }
  }

  /**
   * Clear all pools from cache
   */
  private clearPools(): void {
    this.pools.byAddress.clear();
    this.pools.byToken.clear();
    this.pools.byTokenPair.clear();
    this.pools.byProtocol.clear();
    
    this.stats.poolCount = 0;
    this.stats.tokenCount = 0;
    this.stats.tokenPairCount = 0;
  }

  /**
   * Add a pool to the cache
   * @param pool Pool to add
   */
  private addPool(pool: Pool): void {
    // Ensure pool address is a string
    const poolAddress = typeof pool.address === 'string' ? pool.address : String(pool.address);
    const normalizedAddress = poolAddress.toLowerCase();
    
    // Increment generation counter
    this.generationCounter++;
    this.stats.generationCount = this.generationCounter;
    
    // Create pool state
    const poolState: PoolState = {
      pool,
      generation: this.generationCounter,
      lastUpdated: Date.now(),
    };
    
    // Add to byAddress map
    this.pools.byAddress.set(normalizedAddress, poolState);
    
    // Add to byToken map
    for (const token of pool.tokens) {
      const normalizedToken = token.address.toLowerCase();
      
      if (!this.pools.byToken.has(normalizedToken)) {
        this.pools.byToken.set(normalizedToken, new Set<string>());
        this.stats.tokenCount++;
      }
      
      this.pools.byToken.get(normalizedToken)!.add(normalizedAddress);
    }
    
    // Add to byTokenPair map
    for (let i = 0; i < pool.tokens.length; i++) {
      for (let j = i + 1; j < pool.tokens.length; j++) {
        const token0 = pool.tokens[i].address.toLowerCase();
        const token1 = pool.tokens[j].address.toLowerCase();
        
        const key = this.createTokenPairKey(token0, token1);
        
        if (!this.pools.byTokenPair.has(key)) {
          this.pools.byTokenPair.set(key, new Set<string>());
          this.stats.tokenPairCount++;
        }
        
        this.pools.byTokenPair.get(key)!.add(normalizedAddress);
      }
    }
    
    // Add to byProtocol map
    if (!this.pools.byProtocol.has(pool.protocol)) {
      this.pools.byProtocol.set(pool.protocol, new Set<string>());
    }
    
    this.pools.byProtocol.get(pool.protocol)!.add(normalizedAddress);
    
    // Update stats
    this.stats.poolCount++;
  }

  /**
   * Update a pool in the cache
   * @param pool Pool to update
   */
  private updatePool(pool: Pool): void {
    const normalizedAddress = pool.address.toLowerCase();
    
    // Check if pool exists
    if (!this.pools.byAddress.has(normalizedAddress)) {
      this.addPool(pool);
      return;
    }
    
    // Increment generation counter
    this.generationCounter++;
    this.stats.generationCount = this.generationCounter;
    
    // Get existing pool state
    const existingState = this.pools.byAddress.get(normalizedAddress)!;
    
    // Create updated pool state
    const updatedState: PoolState = {
      pool,
      generation: this.generationCounter,
      lastUpdated: Date.now(),
    };
    
    // Update byAddress map
    this.pools.byAddress.set(normalizedAddress, updatedState);
  }

  /**
   * Remove a pool from the cache
   * @param address Pool address
   */
  private removePool(address: Address): void {
    const normalizedAddress = address.toLowerCase();
    
    // Check if pool exists
    if (!this.pools.byAddress.has(normalizedAddress)) {
      return;
    }
    
    // Get pool state
    const poolState = this.pools.byAddress.get(normalizedAddress)!;
    const pool = poolState.pool;
    
    // Remove from byAddress map
    this.pools.byAddress.delete(normalizedAddress);
    
    // Remove from byToken map
    for (const token of pool.tokens) {
      const normalizedToken = token.address.toLowerCase();
      
      if (this.pools.byToken.has(normalizedToken)) {
        this.pools.byToken.get(normalizedToken)!.delete(normalizedAddress);
        
        // Remove token entry if empty
        if (this.pools.byToken.get(normalizedToken)!.size === 0) {
          this.pools.byToken.delete(normalizedToken);
          this.stats.tokenCount--;
        }
      }
    }
    
    // Remove from byTokenPair map
    for (let i = 0; i < pool.tokens.length; i++) {
      for (let j = i + 1; j < pool.tokens.length; j++) {
        const token0 = pool.tokens[i].address.toLowerCase();
        const token1 = pool.tokens[j].address.toLowerCase();
        
        const key = this.createTokenPairKey(token0, token1);
        
        if (this.pools.byTokenPair.has(key)) {
          this.pools.byTokenPair.get(key)!.delete(normalizedAddress);
          
          // Remove token pair entry if empty
          if (this.pools.byTokenPair.get(key)!.size === 0) {
            this.pools.byTokenPair.delete(key);
            this.stats.tokenPairCount--;
          }
        }
      }
    }
    
    // Remove from byProtocol map
    if (this.pools.byProtocol.has(pool.protocol)) {
      this.pools.byProtocol.get(pool.protocol)!.delete(normalizedAddress);
      
      // Remove protocol entry if empty
      if (this.pools.byProtocol.get(pool.protocol)!.size === 0) {
        this.pools.byProtocol.delete(pool.protocol);
      }
    }
    
    // Update stats
    this.stats.poolCount--;
    this.stats.evictionCount++;
  }

  /**
   * Create a token pair key
   * @param token0 First token address
   * @param token1 Second token address
   * @returns Token pair key
   */
  private createTokenPairKey(token0: string, token1: string): TokenPairKey {
    // Sort tokens to ensure consistent key
    return token0 < token1 
      ? `${token0}-${token1}` as TokenPairKey
      : `${token1}-${token0}` as TokenPairKey;
  }

  /**
   * Notify subscribers of an event
   * @param event Event to notify about
   */
  private notifySubscribers(event: StateEvent): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(event);
      } catch (error) {
        logger.error(`Error in event subscriber: ${error}`);
      }
    }
  }

  /**
   * Handle pool created event
   * @param event Pool created event
   */
  private async handlePoolCreated(event: StateEvent & { type: StateEventType.PoolCreated }): Promise<void> {
    logger.debug(`Processing pool created event for ${event.poolAddress}`);
    
    // Add pool to cache
    this.addPool(event.pool);
  }

  /**
   * Handle pool updated event
   * @param event Pool updated event
   */
  private async handlePoolUpdated(event: StateEvent & { type: StateEventType.PoolUpdated }): Promise<void> {
    logger.debug(`Processing pool updated event for ${event.poolAddress}`);
    
    // Update pool in cache
    this.updatePool(event.pool);
  }

  /**
   * Handle swap event
   * @param event Swap event
   */
  private async handleSwap(event: StateEvent & { type: StateEventType.Swap }): Promise<void> {
    logger.debug(`Processing swap event for ${event.poolAddress}`);
    
    // Get pool
    const pool = this.getPoolByAddress(event.poolAddress);
    
    if (!pool) {
      logger.warn(`Pool ${event.poolAddress} not found for swap event`);
      return;
    }
    
    // Update pool reserves if available
    if (pool.reserves && event.swapEvent.amountsIn && event.swapEvent.amountsOut) {
      // Find token indices
      const tokenInIndex = pool.tokens.findIndex(t => t.address.toLowerCase() === event.tokenIn.toLowerCase());
      const tokenOutIndex = pool.tokens.findIndex(t => t.address.toLowerCase() === event.tokenOut.toLowerCase());
      
      if (tokenInIndex !== -1 && tokenOutIndex !== -1) {
        // Create updated pool with a copy of reserves
        const updatedPool: Pool = {
          ...pool,
          reserves: [...pool.reserves] as [bigint, bigint],
        };
        
        // Update reserves - we know reserves exists because of the outer if condition
        if (tokenInIndex === 0) {
          updatedPool.reserves![0] += event.amountIn;
        } else if (tokenInIndex === 1) {
          updatedPool.reserves![1] += event.amountIn;
        }
        
        if (tokenOutIndex === 0) {
          updatedPool.reserves![0] -= event.amountOut;
        } else if (tokenOutIndex === 1) {
          updatedPool.reserves![1] -= event.amountOut;
        }
        
        // Update pool in cache
        this.updatePool(updatedPool);
      }
    }
  }

  /**
   * Handle liquidity added event
   * @param event Liquidity added event
   */
  private async handleLiquidityAdded(event: StateEvent & { type: StateEventType.LiquidityAdded }): Promise<void> {
    logger.debug(`Processing liquidity added event for ${event.poolAddress}`);
    
    // Get pool
    const pool = this.getPoolByAddress(event.poolAddress);
    
    if (!pool) {
      logger.warn(`Pool ${event.poolAddress} not found for liquidity added event`);
      return;
    }
    
    // Update pool reserves if available
    if (pool.reserves && event.tokens.length === 2 && event.amounts.length === 2) {
      // Find token indices
      const token0Index = pool.tokens.findIndex(t => t.address.toLowerCase() === event.tokens[0].toLowerCase());
      const token1Index = pool.tokens.findIndex(t => t.address.toLowerCase() === event.tokens[1].toLowerCase());
      
      if (token0Index !== -1 && token1Index !== -1) {
        // Create updated pool with a copy of reserves
        const updatedPool: Pool = {
          ...pool,
          reserves: [...pool.reserves] as [bigint, bigint],
        };
        
        // Update reserves - we know reserves exists because of the outer if condition
        if (token0Index === 0) {
          updatedPool.reserves![0] += event.amounts[0];
        } else if (token0Index === 1) {
          updatedPool.reserves![1] += event.amounts[0];
        }
        
        if (token1Index === 0) {
          updatedPool.reserves![0] += event.amounts[1];
        } else if (token1Index === 1) {
          updatedPool.reserves![1] += event.amounts[1];
        }
        
        // Update pool in cache
        this.updatePool(updatedPool);
      }
    }
    
    // Update liquidity for concentrated liquidity pools
    if (pool.liquidity !== undefined) {
      // Create updated pool
      const updatedPool: Pool = {
        ...pool,
        liquidity: pool.liquidity + event.amounts.reduce((sum, amount) => sum + amount, BigInt(0)),
      };
      
      // Update pool in cache
      this.updatePool(updatedPool);
    }
  }

  /**
   * Handle liquidity removed event
   * @param event Liquidity removed event
   */
  private async handleLiquidityRemoved(event: StateEvent & { type: StateEventType.LiquidityRemoved }): Promise<void> {
    logger.debug(`Processing liquidity removed event for ${event.poolAddress}`);
    
    // Get pool
    const pool = this.getPoolByAddress(event.poolAddress);
    
    if (!pool) {
      logger.warn(`Pool ${event.poolAddress} not found for liquidity removed event`);
      return;
    }
    
    // Update pool reserves if available
    if (pool.reserves && event.tokens.length === 2 && event.amounts.length === 2) {
      // Find token indices
      const token0Index = pool.tokens.findIndex(t => t.address.toLowerCase() === event.tokens[0].toLowerCase());
      const token1Index = pool.tokens.findIndex(t => t.address.toLowerCase() === event.tokens[1].toLowerCase());
      
      if (token0Index !== -1 && token1Index !== -1) {
        // Create updated pool with a copy of reserves
        const updatedPool: Pool = {
          ...pool,
          reserves: [...pool.reserves] as [bigint, bigint],
        };
        
        // Update reserves - we know reserves exists because of the outer if condition
        if (token0Index === 0) {
          updatedPool.reserves![0] -= event.amounts[0];
        } else if (token0Index === 1) {
          updatedPool.reserves![1] -= event.amounts[0];
        }
        
        if (token1Index === 0) {
          updatedPool.reserves![0] -= event.amounts[1];
        } else if (token1Index === 1) {
          updatedPool.reserves![1] -= event.amounts[1];
        }
        
        // Update pool in cache
        this.updatePool(updatedPool);
      }
    }
    
    // Update liquidity for concentrated liquidity pools
    if (pool.liquidity !== undefined) {
      // Create updated pool
      const updatedPool: Pool = {
        ...pool,
        liquidity: pool.liquidity - event.amounts.reduce((sum, amount) => sum + amount, BigInt(0)),
      };
      
      // Update pool in cache
      this.updatePool(updatedPool);
    }
  }
}
