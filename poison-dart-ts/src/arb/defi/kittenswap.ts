/**
 * KittenSwap DEX implementation (Uniswap V2/V3 and Velodrome V1 fork)
 */
import { type Address, type PublicClient, type Transaction, type WalletClient, encodeFunctionData } from 'viem';
import { Logger } from '../../libs/logger';
import { DEX_CONTRACTS } from '../config';
import { type Pool, Protocol, type Token } from '../types';
import { type SwapInfo } from '../core/types';
import { BaseDex } from './mod';

// Create a logger instance for KittenSwapDex
const logger = Logger.forContext('KittenSwap');

// KittenSwap Router ABI
const KITTENSWAP_ROUTER_ABI = [
  {
    inputs: [
      { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
      { internalType: 'uint256', name: 'amountOutMin', type: 'uint256' },
      { internalType: 'address', name: 'tokenFrom', type: 'address' },
      { internalType: 'address', name: 'tokenTo', type: 'address' },
      { internalType: 'bool', name: 'stable', type: 'bool' },
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'deadline', type: 'uint256' },
    ],
    name: 'swapExactTokensForTokensSimple',
    outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

// KittenSwap Factory ABI
const KITTENSWAP_FACTORY_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'token0', type: 'address' },
      { internalType: 'address', name: 'token1', type: 'address' },
      { internalType: 'bool', name: 'stable', type: 'bool' },
    ],
    name: 'getPair',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
];

// KittenSwap Pair ABI
const KITTENSWAP_PAIR_ABI = [
  {
    inputs: [],
    name: 'getReserves',
    outputs: [
      { internalType: 'uint256', name: '_reserve0', type: 'uint256' },
      { internalType: 'uint256', name: '_reserve1', type: 'uint256' },
      { internalType: 'uint256', name: '_blockTimestampLast', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
      { internalType: 'address', name: 'tokenIn', type: 'address' },
    ],
    name: 'getAmountOut',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'tokens',
    outputs: [
      { internalType: 'address', name: '', type: 'address' },
      { internalType: 'address', name: '', type: 'address' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'stable',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
];

/**
 * KittenSwap DEX implementation
 */
export class KittenSwapDex extends BaseDex {
  /**
   * Parse a KittenSwap transaction
   * @param publicClient The public client
   * @param input Transaction input data
   * @returns Swap information if the transaction is a swap, null otherwise
   */
  static async parseTransaction(
    publicClient: PublicClient,
    input: `0x${string}`
  ): Promise<SwapInfo | null> {
    // Function signatures for KittenSwap
    const swapExactTokensForTokensSimple = '0x42712a67'; // swapExactTokensForTokensSimple(uint256,uint256,address,address,bool,address,uint256)
    const swapExactTokensForTokens = '0x38ed1739'; // swapExactTokensForTokens(uint256,uint256,address[],address,uint256)
    const swapExactETHForTokens = '0x7ff36ab5'; // swapExactETHForTokens(uint256,address[],address,uint256)
    
    // Check function signature
    const signature = input.slice(0, 10);
    
    // Handle swapExactTokensForTokensSimple
    if (signature === swapExactTokensForTokensSimple) {
      // Extract parameters from input data
      // Format: swapExactTokensForTokensSimple(uint256 amountIn, uint256 amountOutMin, address tokenFrom, address tokenTo, bool stable, address to, uint256 deadline)
      
      // Skip function signature (4 bytes) and get the parameters
      const amountInHex = '0x' + input.slice(10, 74);
      const tokenFromHex = '0x' + input.slice(138, 178);
      const tokenToHex = '0x' + input.slice(202, 242);
      const stableHex = '0x' + input.slice(242, 306);
      
      const amountIn = BigInt(amountInHex);
      const tokenIn = tokenFromHex as `0x${string}` as Address;
      const tokenOut = tokenToHex as `0x${string}` as Address;
      const stable = BigInt(stableHex) === BigInt(1);
      
      // Find the pool address
      try {
        const poolAddress = await KittenSwapDex.findPool(
          publicClient,
          tokenIn,
          tokenOut,
          stable
        );
        
        // For simplicity, we'll set amountOut to 0 since we don't know it yet
        return {
          protocol: stable ? Protocol.KittenSwapStable : Protocol.KittenSwap,
          tokenIn,
          tokenOut,
          amountIn,
          amountOut: BigInt(0),
          poolAddress,
        };
      } catch (error) {
        // Pool not found
        return null;
      }
    }
    
    // Handle swapExactTokensForTokens (standard Uniswap V2 style)
    if (signature === swapExactTokensForTokens || signature === swapExactETHForTokens) {
      // Extract parameters from input data
      // Format: swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)
      
      // Skip function signature (4 bytes) and get the first parameter (amountIn)
      const amountInHex = '0x' + input.slice(10, 74);
      const amountIn = BigInt(amountInHex);
      
      // Skip to the path parameter (offset 3*32 bytes from the start of parameters)
      const pathOffsetHex = '0x' + input.slice(138, 202);
      const pathOffset = Number(BigInt(pathOffsetHex));
      
      // Path array length is at the offset
      const pathLengthHex = '0x' + input.slice(10 + pathOffset * 2, 10 + (pathOffset + 32) * 2);
      const pathLength = Number(BigInt(pathLengthHex));
      
      // Get the first two tokens in the path
      const tokenInHex = '0x' + input.slice(10 + (pathOffset + 32) * 2, 10 + (pathOffset + 64) * 2).slice(24);
      const tokenOutHex = '0x' + input.slice(10 + (pathOffset + 64) * 2, 10 + (pathOffset + 96) * 2).slice(24);
      
      const tokenIn = `0x${tokenInHex}` as `0x${string}` as Address;
      const tokenOut = `0x${tokenOutHex}` as `0x${string}` as Address;
      
      // Find the pool address - assume volatile pool for standard swaps
      try {
        const poolAddress = await KittenSwapDex.findPool(
          publicClient,
          tokenIn,
          tokenOut,
          false // Assume volatile pool for standard swaps
        );
        
        // For simplicity, we'll set amountOut to 0 since we don't know it yet
        return {
          protocol: Protocol.KittenSwap,
          tokenIn,
          tokenOut,
          amountIn,
          amountOut: BigInt(0),
          poolAddress,
        };
      } catch (error) {
        // Pool not found
        return null;
      }
    }
    
    return null;
  }

  private isStable: boolean;
  private poolLiquidity: bigint | null = null;

  constructor(pool: Pool, publicClient: PublicClient, walletClient: WalletClient, isA2B = true) {
    super(pool, publicClient, walletClient, isA2B);
    this.isStable = pool.protocol === Protocol.KittenSwapStable;
  }

  /**
   * Get the liquidity of the pool
   */
  async liquidity(): Promise<bigint> {
    if (this.poolLiquidity !== null) {
      return this.poolLiquidity;
    }

    try {
      const result = await this.publicClient.readContract({
        address: this.address(),
        abi: KITTENSWAP_PAIR_ABI,
        functionName: 'getReserves',
      });

      // Sum of both reserves as a simple liquidity measure
      const reserve0 = (result as [bigint, bigint, bigint])[0];
      const reserve1 = (result as [bigint, bigint, bigint])[1];
      this.poolLiquidity = reserve0 + reserve1;
      return this.poolLiquidity;
    } catch (error) {
      logger.error('Error getting liquidity:', error);
      return BigInt(0);
    }
  }

  /**
   * Create a swap transaction
   * @param sender The address of the sender
   * @param recipient The address of the recipient
   * @param amountIn The amount of tokens to swap
   * @returns The transaction data
   */
  async swapTx(_sender: Address, recipient: Address, amountIn: bigint): Promise<string> {
    // Get the current timestamp plus 20 minutes for the deadline
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);

    // Get the minimum amount out with 0.5% slippage
    const amountOutMinimum = await this.getAmountOutMinimum(amountIn, 0.5);

    // Encode the function call
    const data = encodeFunctionData({
      abi: KITTENSWAP_ROUTER_ABI,
      functionName: 'swapExactTokensForTokensSimple',
      args: [
        amountIn,
        amountOutMinimum,
        this.tokenInType() as Address,
        this.tokenOutType() as Address,
        this.isStable,
        recipient,
        deadline,
      ],
    });

    return data;
  }

  /**
   * Get the minimum amount out with slippage
   * @param amountIn The amount of tokens to swap
   * @param slippagePercent The slippage percentage (e.g., 0.5 for 0.5%)
   * @returns The minimum amount out
   */
  private async getAmountOutMinimum(amountIn: bigint, slippagePercent: number): Promise<bigint> {
    try {
      const result = await this.publicClient.readContract({
        address: this.address(),
        abi: KITTENSWAP_PAIR_ABI,
        functionName: 'getAmountOut',
        args: [amountIn, this.tokenInType() as Address],
      });

      // Apply slippage to the amount out
      const amountOut = result as bigint;
      const slippageFactor = BigInt(Math.floor((100 - slippagePercent) * 1000)) / BigInt(1000);
      return (amountOut * slippageFactor) / BigInt(100);
    } catch (error) {
      logger.error('Error getting amount out minimum:', error);
      // Fallback to a simple estimation with 0.5% slippage
      return (amountIn * BigInt(995)) / BigInt(1000);
    }
  }

  /**
   * Find a pool for the given tokens
   * @param publicClient The public client
   * @param tokenA The first token
   * @param tokenB The second token
   * @param stable Whether to use a stable pool
   * @returns The pool address
   */
  static async findPool(
    publicClient: PublicClient,
    tokenA: Address,
    tokenB: Address,
    stable: boolean
  ): Promise<Address> {
    try {
      // Sort tokens to match the factory's expected order
      const [token0, token1] = tokenA < tokenB ? [tokenA, tokenB] : [tokenB, tokenA];

      const result = await publicClient.readContract({
        address: DEX_CONTRACTS.KITTENSWAP.FACTORY as Address,
        abi: KITTENSWAP_FACTORY_ABI,
        functionName: 'getPair',
        args: [token0, token1, stable],
      });

      return result as Address;
    } catch (error) {
      logger.error('Error finding pool:', error);
      throw new Error(`Pool not found for tokens ${tokenA} and ${tokenB} with stable=${stable}`);
    }
  }

  /**
   * Create a pool object for the given tokens
   * @param publicClient The public client
   * @param walletClient The wallet client
   * @param tokenA The first token
   * @param tokenB The second token
   * @param stable Whether to use a stable pool
   * @returns The KittenSwap DEX instance
   */
  static async createPool(
    publicClient: PublicClient,
    walletClient: WalletClient,
    tokenA: Token,
    tokenB: Token,
    stable: boolean
  ): Promise<KittenSwapDex> {
    const poolAddress = await KittenSwapDex.findPool(
      publicClient,
      tokenA.address as Address,
      tokenB.address as Address,
      stable
    );

    const pool: Pool = {
      protocol: stable ? Protocol.KittenSwapStable : Protocol.KittenSwap,
      address: poolAddress,
      tokens: [tokenA, tokenB],
    };

    return new KittenSwapDex(pool, publicClient, walletClient);
  }
}
