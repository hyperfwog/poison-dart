/**
 * SwapX DEX implementation (Algebra V4 fork)
 */
import { type Address, type PublicClient, type WalletClient, encodeFunctionData } from 'viem';
import { Logger } from '../../libs/logger';
import { DEX_CONTRACTS } from '../config';
import { type Pool, Protocol, type Token } from '../types';
import { BaseDex } from './mod';

// Create a logger instance for SwapXDex
const logger = Logger.forContext('SwapX');

// SwapX Router ABI (Algebra V4 compatible)
const SWAPX_ROUTER_ABI = [
  {
    inputs: [
      {
        components: [
          { internalType: 'address', name: 'tokenIn', type: 'address' },
          { internalType: 'address', name: 'tokenOut', type: 'address' },
          { internalType: 'address', name: 'recipient', type: 'address' },
          { internalType: 'uint256', name: 'deadline', type: 'uint256' },
          { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
          { internalType: 'uint256', name: 'amountOutMinimum', type: 'uint256' },
          { internalType: 'uint160', name: 'limitSqrtPrice', type: 'uint160' },
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

// SwapX Quoter ABI
const SWAPX_QUOTER_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'tokenIn', type: 'address' },
      { internalType: 'address', name: 'tokenOut', type: 'address' },
      { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
      { internalType: 'uint160', name: 'limitSqrtPrice', type: 'uint160' },
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

// SwapX Factory ABI
const SWAPX_FACTORY_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'tokenA', type: 'address' },
      { internalType: 'address', name: 'tokenB', type: 'address' },
    ],
    name: 'poolByPair',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
];

// SwapX Pool ABI
const SWAPX_POOL_ABI = [
  {
    inputs: [],
    name: 'liquidity',
    outputs: [{ internalType: 'uint128', name: '', type: 'uint128' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'globalState',
    outputs: [
      { internalType: 'uint160', name: 'price', type: 'uint160' },
      { internalType: 'int24', name: 'tick', type: 'int24' },
      { internalType: 'uint16', name: 'fee', type: 'uint16' },
      { internalType: 'uint16', name: 'timepointIndex', type: 'uint16' },
      { internalType: 'uint8', name: 'communityFeeToken0', type: 'uint8' },
      { internalType: 'uint8', name: 'communityFeeToken1', type: 'uint8' },
      { internalType: 'bool', name: 'unlocked', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];

/**
 * SwapX DEX implementation
 */
export class SwapXDex extends BaseDex {
  private poolLiquidity: bigint | null = null;
  private fee: number | null = null;

  constructor(pool: Pool, publicClient: PublicClient, walletClient: WalletClient, isA2B = true) {
    super(pool, publicClient, walletClient, isA2B);
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
        abi: SWAPX_POOL_ABI,
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
   * Get the fee of the pool
   */
  async getFee(): Promise<number> {
    if (this.fee !== null) {
      return this.fee;
    }

    try {
      const result = await this.publicClient.readContract({
        address: this.address(),
        abi: SWAPX_POOL_ABI,
        functionName: 'globalState',
      });

      // Fee is in basis points (1/100 of a percent)
      this.fee =
        Number((result as [unknown, unknown, number, unknown, unknown, unknown, unknown])[2]) /
        10000;
      return this.fee;
    } catch (error) {
      logger.error('Error getting fee:', error);
      return 0.003; // Default to 0.3%
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
      recipient,
      deadline,
      amountIn,
      amountOutMinimum,
      limitSqrtPrice: BigInt(0), // No price limit
    };

    // Encode the function call
    const data = encodeFunctionData({
      abi: SWAPX_ROUTER_ABI,
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
        address: DEX_CONTRACTS.SWAPX.QUOTER as Address,
        abi: SWAPX_QUOTER_ABI,
        functionName: 'quoteExactInputSingle',
        args: [
          this.tokenInType() as Address,
          this.tokenOutType() as Address,
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
   * Find a pool for the given tokens
   * @param publicClient The public client
   * @param tokenA The first token
   * @param tokenB The second token
   * @returns The pool address
   */
  static async findPool(
    publicClient: PublicClient,
    tokenA: Address,
    tokenB: Address
  ): Promise<Address> {
    try {
      const result = await publicClient.readContract({
        address: DEX_CONTRACTS.SWAPX.FACTORY as Address,
        abi: SWAPX_FACTORY_ABI,
        functionName: 'poolByPair',
        args: [tokenA, tokenB],
      });

      return result as Address;
    } catch (error) {
      logger.error('Error finding pool:', error);
      throw new Error(`Pool not found for tokens ${tokenA} and ${tokenB}`);
    }
  }

  /**
   * Create a pool object for the given tokens
   * @param publicClient The public client
   * @param walletClient The wallet client
   * @param tokenA The first token
   * @param tokenB The second token
   * @returns The SwapX DEX instance
   */
  static async createPool(
    publicClient: PublicClient,
    walletClient: WalletClient,
    tokenA: Token,
    tokenB: Token
  ): Promise<SwapXDex> {
    const poolAddress = await SwapXDex.findPool(
      publicClient,
      tokenA.address as Address,
      tokenB.address as Address
    );

    const pool: Pool = {
      protocol: Protocol.SwapX,
      address: poolAddress,
      tokens: [tokenA, tokenB],
    };

    return new SwapXDex(pool, publicClient, walletClient);
  }
}
