/**
 * DEX Indexer
 * Responsible for discovering and tracking DEX pools
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PublicClient } from 'viem';
import { Logger } from '../../libs/logger';
import { Pool, Token } from '../types';
import { discoverHyperSwapV2Pools } from './hyperswap-v2-pools';
import { discoverHyperSwapV3Pools } from './hyperswap-v3-pools';
import { discoverKittenSwapPools } from './kittenswap-pools';

// Create a logger instance for the DEX indexer
const logger = Logger.forContext('DexIndexer');

/**
 * Class for indexing DEX pools
 */
export class DexIndexer {
  private publicClient: PublicClient;
  private pools: Map<string, Pool> = new Map();
  private tokens: Map<string, Token> = new Map();
  private chainId: number;
  private cacheDir: string;

  constructor(publicClient: PublicClient, chainId: number) {
    this.publicClient = publicClient;
    this.chainId = chainId;
    this.cacheDir = path.join(process.cwd(), 'cache');
    
    // Create cache directory if it doesn't exist
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Initialize the DEX indexer
   */
  async initialize(): Promise<void> {
    logger.info('Initializing DEX indexer...');
    
    // Try to load pools from cache
    const loaded = await this.loadPoolsFromCache();
    
    if (!loaded) {
      logger.info('No cache found or cache is invalid, discovering pools...');
      await this.discoverPools();
      await this.savePoolsToCache();
    }
    
    logger.info(`DEX indexer initialized with ${this.pools.size} pools and ${this.tokens.size} tokens`);
  }

  /**
   * Load pools from cache
   * @returns Whether pools were successfully loaded
   */
  private async loadPoolsFromCache(): Promise<boolean> {
    try {
      // Check if cache file exists
      const cacheFile = path.join(this.cacheDir, `pools-${this.chainId}.json`);
      if (!fs.existsSync(cacheFile)) {
        logger.info(`Cache file ${cacheFile} not found`);
        return false;
      }

      // Read cache file
      const cacheData = fs.readFileSync(cacheFile, 'utf-8');
      const poolsArray = JSON.parse(cacheData) as { key: string; pool: Pool }[];

      // Clear existing pools
      this.pools.clear();

      // Add pools to map
      for (const { key, pool } of poolsArray) {
        this.pools.set(key, pool);
        
        // Add tokens to cache
        for (const token of pool.tokens) {
          if (!this.tokens.has(token.address.toLowerCase())) {
            this.tokens.set(token.address.toLowerCase(), token);
          }
        }
      }

      logger.info(`Loaded ${this.pools.size} pools from cache file ${cacheFile}`);
      return true;
    } catch (error) {
      logger.error(`Failed to load pools from cache: ${error}`);
      return false;
    }
  }

  /**
   * Save pools to cache
   */
  private async savePoolsToCache(): Promise<void> {
    try {
      // Convert Map to array for serialization
      const poolsArray = Array.from(this.pools.entries()).map(([key, pool]) => ({
        key,
        pool,
      }));

      // Create cache directory if it doesn't exist
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }

      // Save to file
      const cacheFile = path.join(this.cacheDir, `pools-${this.chainId}.json`);
      fs.writeFileSync(cacheFile, JSON.stringify(poolsArray, null, 2));

      logger.info(`Saved ${poolsArray.length} pools to cache file ${cacheFile}`);
    } catch (error) {
      logger.error(`Failed to save pools to cache: ${error}`);
    }
  }

  /**
   * Discover pools for all supported DEXes
   */
  private async discoverPools(): Promise<void> {
    // Only discover pools for HyperEVM chain (999)
    if (this.chainId === 999) {
      await this.discoverHyperEVMPools();
    } else {
      logger.warn(`Unsupported chain ID: ${this.chainId}`);
    }
  }

  /**
   * Discover pools for HyperEVM chain
   */
  private async discoverHyperEVMPools(): Promise<void> {
    logger.info('Discovering pools for HyperEVM chain...');
    
    // Discover HyperSwap V2 pools
    await discoverHyperSwapV2Pools(this.publicClient, this.pools, this.tokens);
    
    // Discover HyperSwap V3 pools
    await discoverHyperSwapV3Pools(this.publicClient, this.pools, this.tokens);
    
    // Discover KittenSwap pools
    await discoverKittenSwapPools(this.publicClient, this.pools, this.tokens);
  }

  /**
   * Get all pools
   * @returns All pools
   */
  getAllPools(): Pool[] {
    return Array.from(this.pools.values());
  }

  /**
   * Get all tokens
   * @returns All tokens
   */
  getAllTokens(): Token[] {
    return Array.from(this.tokens.values());
  }

  /**
   * Get a pool by its key
   * @param key Pool key
   * @returns Pool or undefined if not found
   */
  getPool(key: string): Pool | undefined {
    return this.pools.get(key);
  }

  /**
   * Get a token by its address
   * @param address Token address
   * @returns Token or undefined if not found
   */
  getToken(address: string): Token | undefined {
    return this.tokens.get(address.toLowerCase());
  }
}
