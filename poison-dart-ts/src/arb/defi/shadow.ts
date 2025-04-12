/**
 * Shadow DEX implementation (Uniswap V3 fork)
 */
import {
  type Address,
  type PublicClient,
  type Transaction,
  type WalletClient,
  encodeFunctionData,
  parseUnits,
} from 'viem';
import { Logger } from '../../libs/logger';
import { DEX_CONTRACTS } from '../config';
import type { SwapInfo } from '../core/types';
import { type Pool, Protocol, type Token } from '../types';
import { BaseDex } from './mod';

// Create a logger instance for ShadowDex
const logger = Logger.forContext('Shadow');

// Shadow Router ABI (Uniswap V3 compatible)
const SHADOW_ROUTER_ABI = [
  {
    inputs: [
      {
        components: [
          { internalType: 'address', name: 'tokenIn', type: 'address' },
          { internalType: 'address', name: 'tokenOut', type: 'address' },
          { internalType: 'uint24', name: 'fee', type: 'uint24' },
          { internalType: 'address', name: 'recipient', type: 'address' },
          { internalType: 'uint256', name: 'deadline', type: 'uint256' },
          { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
          { internalType: 'uint256', name: 'amountOutMinimum', type: 'uint256' },
          { internalType: 'uint160', name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
        internalType: 'struct ISwapRouter.ExactInputSingleParams',
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'exactInputSingle',
    outputs: [{ internalType: 'uint256', name: 'amountOut', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          { internalType: 'bytes', name: 'path', type: 'bytes' },
          { internalType: 'address', name: 'recipient', type: 'address' },
          { internalType: 'uint256', name: 'deadline', type: 'uint256' },
          { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
          { internalType: 'uint256', name: 'amountOutMinimum', type: 'uint256' },
        ],
        internalType: 'struct ISwapRouter.ExactInputParams',
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'exactInput',
    outputs: [{ internalType: 'uint256', name: 'amountOut', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
];

// Shadow Quoter ABI
const SHADOW_QUOTER_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'tokenIn', type: 'address' },
      { internalType: 'address', name: 'tokenOut', type: 'address' },
      { internalType: 'uint24', name: 'fee', type: 'uint24' },
      { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
      { internalType: 'uint160', name: 'sqrtPriceLimitX96', type: 'uint160' },
    ],
    name: 'quoteExactInputSingle',
    outputs: [
      { internalType: 'uint256', name: 'amountOut', type: 'uint256' },
      { internalType: 'uint160', name: 'sqrtPriceX96After', type: 'uint160' },
      { internalType: 'uint32', name: 'initializedTicksCrossed', type: 'uint32' },
      { internalType: 'uint256', name: 'gasEstimate', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

// Shadow Factory ABI
const SHADOW_FACTORY_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'tokenA', type: 'address' },
      { internalType: 'address', name: 'tokenB', type: 'address' },
      { internalType: 'uint24', name: 'fee', type: 'uint24' },
    ],
    name: 'getPool',
    outputs: [{ internalType: 'address', name: 'pool', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
];

// Shadow Pool ABI
const SHADOW_POOL_ABI = [
  {
    inputs: [],
    name: 'liquidity',
    outputs: [{ internalType: 'uint128', name: '', type: 'uint128' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'slot0',
    outputs: [
      { internalType: 'uint160', name: 'sqrtPriceX96', type: 'uint160' },
      { internalType: 'int24', name: 'tick', type: 'int24' },
      { internalType: 'uint16', name: 'observationIndex', type: 'uint16' },
      { internalType: 'uint16', name: 'observationCardinality', type: 'uint16' },
      { internalType: 'uint16', name: 'observationCardinalityNext', type: 'uint16' },
      { internalType: 'uint8', name: 'feeProtocol', type: 'uint8' },
      { internalType: 'bool', name: 'unlocked', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];

/**
 * Shadow DEX implementation
 */
export class ShadowDex extends BaseDex {
  /**
   * Parse a Shadow transaction
   * @param publicClient The public client
   * @param input Transaction input data
   * @returns Swap information if the transaction is a swap, null otherwise
   */
  static async parseTransaction(
    publicClient: PublicClient,
    input: `0x${string}`
  ): Promise<SwapInfo | null> {
    // Function signatures for Shadow (Uniswap V3 fork)
    const exactInputSingle = '0x414bf389'; // exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))

    // Check function signature
    const signature = input.slice(0, 10);

    // For simplicity, we'll just handle exactInputSingle
    if (signature === exactInputSingle) {
      // Extract parameters from input data
      // Format: exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96))

      // Skip function signature (4 bytes) and get the struct parameters
      const tokenInHex = `0x${input.slice(34, 74)}`;
      const tokenOutHex = `0x${input.slice(98, 138)}`;
      const feeHex = `0x${input.slice(138, 202)}`;
      const amountInHex = `0x${input.slice(330, 394)}`;

      const tokenIn = tokenInHex as `0x${string}` as Address;
      const tokenOut = tokenOutHex as `0x${string}` as Address;
      const fee = Number(BigInt(feeHex));
      const amountIn = BigInt(amountInHex);

      // Find the pool address
      try {
        const poolAddress = await ShadowDex.findPool(publicClient, tokenIn, tokenOut, fee);

        // For simplicity, we'll set amountOut to 0 since we don't know it yet
        return {
          protocol: Protocol.Shadow,
          tokenIn,
          tokenOut,
          amountIn,
          amountOut: BigInt(0),
          poolAddress,
        };
      } catch (_error) {
        // Pool not found
        return null;
      }
    }

    return null;
  }

  private fee: number;
  private poolLiquidity: bigint | null = null;

  constructor(pool: Pool, publicClient: PublicClient, walletClient: WalletClient, isA2B = true) {
    super(pool, publicClient, walletClient, isA2B);
    this.fee = pool.fee || 3000; // Default to 0.3% fee if not specified
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
        abi: SHADOW_POOL_ABI,
        functionName: 'liquidity',
      });

      this.poolLiquidity = result as bigint;
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

    // Create the swap parameters
    const params = {
      tokenIn: this.tokenInType() as Address,
      tokenOut: this.tokenOutType() as Address,
      fee: this.fee,
      recipient,
      deadline,
      amountIn,
      amountOutMinimum,
      sqrtPriceLimitX96: BigInt(0), // No price limit
    };

    // Encode the function call
    const data = encodeFunctionData({
      abi: SHADOW_ROUTER_ABI,
      functionName: 'exactInputSingle',
      args: [params],
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
        address: DEX_CONTRACTS.SHADOW.QUOTER as Address,
        abi: SHADOW_QUOTER_ABI,
        functionName: 'quoteExactInputSingle',
        args: [
          this.tokenInType() as Address,
          this.tokenOutType() as Address,
          this.fee,
          amountIn,
          BigInt(0), // No price limit
        ],
      });

      // Apply slippage to the amount out
      const amountOut = (result as [bigint, unknown, unknown, unknown])[0];
      const slippageFactor = BigInt(Math.floor((100 - slippagePercent) * 1000)) / BigInt(1000);
      return (amountOut * slippageFactor) / BigInt(100);
    } catch (error) {
      logger.error('Error getting amount out minimum:', error);
      // Fallback to a simple estimation with 0.5% slippage
      return (amountIn * BigInt(995)) / BigInt(1000);
    }
  }

  /**
   * Find a pool for the given tokens and fee
   * @param publicClient The public client
   * @param tokenA The first token
   * @param tokenB The second token
   * @param fee The fee tier
   * @returns The pool address
   */
  static async findPool(
    publicClient: PublicClient,
    tokenA: Address,
    tokenB: Address,
    fee: number
  ): Promise<Address> {
    try {
      const result = await publicClient.readContract({
        address: DEX_CONTRACTS.SHADOW.FACTORY as Address,
        abi: SHADOW_FACTORY_ABI,
        functionName: 'getPool',
        args: [tokenA, tokenB, fee],
      });

      return result as Address;
    } catch (error) {
      logger.error('Error finding pool:', error);
      throw new Error(`Pool not found for tokens ${tokenA} and ${tokenB} with fee ${fee}`);
    }
  }

  /**
   * Create a pool object for the given tokens and fee
   * @param publicClient The public client
   * @param walletClient The wallet client
   * @param tokenA The first token
   * @param tokenB The second token
   * @param fee The fee tier
   * @returns The Shadow DEX instance
   */
  static async createPool(
    publicClient: PublicClient,
    walletClient: WalletClient,
    tokenA: Token,
    tokenB: Token,
    fee: number
  ): Promise<ShadowDex> {
    const poolAddress = await ShadowDex.findPool(
      publicClient,
      tokenA.address as Address,
      tokenB.address as Address,
      fee
    );

    const pool: Pool = {
      protocol: Protocol.Shadow,
      address: poolAddress,
      tokens: [tokenA, tokenB],
      fee,
    };

    return new ShadowDex(pool, publicClient, walletClient);
  }
}
