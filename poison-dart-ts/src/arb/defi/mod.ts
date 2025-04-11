/**
 * DEX interface module
 */
import type { Address, Hash, PublicClient, WalletClient } from 'viem';
import { Logger } from '../../libs/logger';
import type { Pool, Protocol } from '../types';

// Create a logger instance for the DEX module
const logger = Logger.forContext('DEX');

/**
 * Interface for DEX interactions
 */
export interface Dex {
  /**
   * Get the protocol of the DEX
   */
  protocol(): Protocol;

  /**
   * Get the address of the DEX
   */
  address(): Address;

  /**
   * Get the token in type
   */
  tokenInType(): string;

  /**
   * Get the token out type
   */
  tokenOutType(): string;

  /**
   * Get the liquidity of the pool
   */
  liquidity(): Promise<bigint>;

  /**
   * Flip the token in and token out
   */
  flip(): void;

  /**
   * Check if the DEX is trading from token A to token B
   */
  isAToB(): boolean;

  /**
   * Create a swap transaction
   * @param sender The address of the sender
   * @param recipient The address of the recipient
   * @param amountIn The amount of tokens to swap
   * @returns The transaction data
   */
  swapTx(sender: Address, recipient: Address, amountIn: bigint): Promise<string>;
}

/**
 * Base class for DEX implementations
 */
export abstract class BaseDex implements Dex {
  protected pool: Pool;
  protected publicClient: PublicClient;
  protected walletClient: WalletClient;
  protected isA2B: boolean;

  protected constructor(
    pool: Pool,
    publicClient: PublicClient,
    walletClient: WalletClient,
    isA2B = true
  ) {
    this.pool = pool;
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.isA2B = isA2B;
  }

  protocol(): Protocol {
    return this.pool.protocol;
  }

  address(): Address {
    return this.pool.address as Address;
  }

  tokenInType(): string {
    return this.isA2B ? this.pool.tokens[0].address : this.pool.tokens[1].address;
  }

  tokenOutType(): string {
    return this.isA2B ? this.pool.tokens[1].address : this.pool.tokens[0].address;
  }

  abstract liquidity(): Promise<bigint>;

  flip(): void {
    this.isA2B = !this.isA2B;
  }

  isAToB(): boolean {
    return this.isA2B;
  }

  abstract swapTx(sender: Address, recipient: Address, amountIn: bigint): Promise<string>;
}

/**
 * Interface for DEX searchers
 */
export interface DexSearcher {
  /**
   * Find DEXes that support trading between the given token types
   * @param tokenInType The token type to trade from
   * @param tokenOutType Optional token type to trade to
   * @returns A list of DEXes
   */
  findDexes(tokenInType: string, tokenOutType?: string): Promise<Dex[]>;

  /**
   * Find a test path for the given tokens
   * @param path The list of token addresses to test
   * @returns A path object
   */
  findTestPath(path: Address[]): Promise<Path>;
}

/**
 * Represents a trading path through one or more DEXes
 */
export class Path {
  public path: Dex[];

  constructor(path: Dex[] = []) {
    this.path = path;
  }

  /**
   * Check if the path is empty
   */
  isEmpty(): boolean {
    return this.path.length === 0;
  }

  /**
   * Get the token in type of the path
   */
  tokenInType(): string {
    if (this.isEmpty()) {
      return '';
    }
    return this.path[0].tokenInType();
  }

  /**
   * Get the token out type of the path
   */
  tokenOutType(): string {
    if (this.isEmpty()) {
      return '';
    }
    return this.path[this.path.length - 1].tokenOutType();
  }

  /**
   * Get a string representation of the path
   */
  toString(): string {
    if (this.isEmpty()) {
      return 'Empty path';
    }

    let result = `Path: ${this.tokenInType()} -> `;
    for (let i = 0; i < this.path.length; i++) {
      const dex = this.path[i];
      result += `[${dex.protocol()}] -> ${dex.tokenOutType()}`;
      if (i < this.path.length - 1) {
        result += ' -> ';
      }
    }
    return result;
  }
}

/**
 * Result of a trade simulation
 */
export interface TradeResult {
  amountOut: bigint;
  gasCost: bigint;
  profit: bigint;
}

/**
 * Context for trading
 */
export interface TradeContext {
  sender: Address;
  amountIn: bigint;
  path: Path;
  slippage: number;
  gasPrice: bigint;
}

/**
 * Trader class for executing trades
 */
export class Trader {
  private publicClient: PublicClient;
  private walletClient: WalletClient;

  constructor(publicClient: PublicClient, walletClient: WalletClient) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
  }

  /**
   * Simulate a trade to get the expected output
   * @param ctx The trade context
   * @returns The trade result
   */
  async simulateTrade(ctx: TradeContext): Promise<TradeResult> {
    if (ctx.path.isEmpty()) {
      return {
        amountOut: BigInt(0),
        gasCost: BigInt(0),
        profit: BigInt(0),
      };
    }

    let amountIn = ctx.amountIn;
    let totalGasCost = BigInt(0);

    for (const dex of ctx.path.path) {
      try {
        // Simulate the swap
        const txData = await dex.swapTx(ctx.sender, ctx.sender, amountIn);

        // Estimate gas
        const gasEstimate = await this.publicClient.estimateGas({
          account: ctx.sender,
          to: dex.address(),
          data: txData as `0x${string}`,
          value: BigInt(0),
        });

        totalGasCost += gasEstimate * ctx.gasPrice;

        // Get the expected output
        // This is a simplified version - in a real implementation, you would
        // need to decode the return value from the simulation
        const amountOut = (amountIn * BigInt(98)) / BigInt(100); // Simplified: 2% slippage

        // Update amountIn for the next hop
        amountIn = amountOut;
      } catch (error) {
        logger.error('Error simulating trade:', error);
        return {
          amountOut: BigInt(0),
          gasCost: BigInt(0),
          profit: BigInt(0),
        };
      }
    }

    // Calculate profit
    const profit = amountIn > ctx.amountIn ? amountIn - ctx.amountIn - totalGasCost : BigInt(0);

    return {
      amountOut: amountIn,
      gasCost: totalGasCost,
      profit,
    };
  }

  /**
   * Execute a trade
   * @param ctx The trade context
   * @returns The transaction hash
   */
  async executeTrade(ctx: TradeContext): Promise<Hash> {
    if (ctx.path.isEmpty()) {
      throw new Error('Cannot execute trade with empty path');
    }

    let amountIn = ctx.amountIn;
    const currentSender = ctx.sender;
    let txHash: Hash | undefined;

    for (const dex of ctx.path.path) {
      // Get the swap transaction data
      const txData = await dex.swapTx(currentSender, ctx.sender, amountIn);

      // Send the transaction
      txHash = await this.walletClient.sendTransaction({
        account: currentSender,
        to: dex.address(),
        data: txData as `0x${string}`,
        value: BigInt(0),
        gasPrice: ctx.gasPrice,
        chain: this.publicClient.chain,
      });

      // Wait for the transaction to be mined
      const _receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

      // Update amountIn for the next hop
      // In a real implementation, you would need to extract the actual output amount
      // from the transaction receipt or events
      amountIn = (amountIn * BigInt(98)) / BigInt(100); // Simplified: 2% slippage
    }

    if (!txHash) {
      throw new Error('Failed to execute trade');
    }

    return txHash;
  }
}
