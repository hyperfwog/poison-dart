/**
 * HyperSwap V2 DEX implementation (Uniswap V2 fork)
 */
import { type Address, type PublicClient, type WalletClient, encodeFunctionData } from 'viem';
import { DEX_CONTRACTS } from '../config';
import { type Pool, Protocol, type Token } from '../types';
import { BaseDex } from './mod';

// HyperSwap V2 Router ABI
const HYPERSWAP_V2_ROUTER_ABI = [
  {
    inputs: [
      { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
      { internalType: 'uint256', name: 'amountOutMin', type: 'uint256' },
      { internalType: 'address[]', name: 'path', type: 'address[]' },
      { internalType: 'address', name: 'to', type: 'address' },
      { internalType: 'uint256', name: 'deadline', type: 'uint256' },
    ],
    name: 'swapExactTokensForTokens',
    outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
      { internalType: 'address[]', name: 'path', type: 'address[]' },
    ],
    name: 'getAmountsOut',
    outputs: [{ internalType: 'uint256[]', name: 'amounts', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
];

// HyperSwap V2 Factory ABI
const HYPERSWAP_V2_FACTORY_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'tokenA', type: 'address' },
      { internalType: 'address', name: 'tokenB', type: 'address' },
    ],
    name: 'getPair',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
];

// HyperSwap V2 Pair ABI
const HYPERSWAP_V2_PAIR_ABI = [
  {
    inputs: [],
    name: 'getReserves',
    outputs: [
      { internalType: 'uint112', name: '_reserve0', type: 'uint112' },
      { internalType: 'uint112', name: '_reserve1', type: 'uint112' },
      { internalType: 'uint32', name: '_blockTimestampLast', type: 'uint32' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'token0',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'token1',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
];

/**
 * HyperSwap V2 DEX implementation
 */
export class HyperSwapV2Dex extends BaseDex {
  private poolLiquidity: bigint | null = null;

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
        abi: HYPERSWAP_V2_PAIR_ABI,
        functionName: 'getReserves',
      });

      // Sum of both reserves as a simple liquidity measure
      const reserve0 = (result as any[])[0] as bigint;
      const reserve1 = (result as any[])[1] as bigint;
      this.poolLiquidity = reserve0 + reserve1;
      return this.poolLiquidity;
    } catch (error) {
      console.error('Error getting liquidity:', error);
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
  async swapTx(sender: Address, recipient: Address, amountIn: bigint): Promise<string> {
    // Get the current timestamp plus 20 minutes for the deadline
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);

    // Get the minimum amount out with 0.5% slippage
    const amountOutMinimum = await this.getAmountOutMinimum(amountIn, 0.5);

    // Create the path
    const path = [this.tokenInType() as Address, this.tokenOutType() as Address];

    // Encode the function call
    const data = encodeFunctionData({
      abi: HYPERSWAP_V2_ROUTER_ABI,
      functionName: 'swapExactTokensForTokens',
      args: [amountIn, amountOutMinimum, path, recipient, deadline],
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
      const path = [this.tokenInType() as Address, this.tokenOutType() as Address];

      const result = await this.publicClient.readContract({
        address: DEX_CONTRACTS.HYPERSWAP.V2_ROUTER as Address,
        abi: HYPERSWAP_V2_ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [amountIn, path],
      });

      // Apply slippage to the amount out
      const amounts = result as bigint[];
      const amountOut = amounts[amounts.length - 1];
      const slippageFactor = BigInt(Math.floor((100 - slippagePercent) * 1000)) / BigInt(1000);
      return (amountOut * slippageFactor) / BigInt(100);
    } catch (error) {
      console.error('Error getting amount out minimum:', error);
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
      // Sort tokens to match the factory's expected order
      const [token0, token1] = tokenA < tokenB ? [tokenA, tokenB] : [tokenB, tokenA];

      const result = await publicClient.readContract({
        address: DEX_CONTRACTS.HYPERSWAP.V2_FACTORY as Address,
        abi: HYPERSWAP_V2_FACTORY_ABI,
        functionName: 'getPair',
        args: [token0, token1],
      });

      return result as Address;
    } catch (error) {
      console.error('Error finding pool:', error);
      throw new Error(`Pool not found for tokens ${tokenA} and ${tokenB}`);
    }
  }

  /**
   * Create a pool object for the given tokens
   * @param publicClient The public client
   * @param walletClient The wallet client
   * @param tokenA The first token
   * @param tokenB The second token
   * @returns The HyperSwap V2 DEX instance
   */
  static async createPool(
    publicClient: PublicClient,
    walletClient: WalletClient,
    tokenA: Token,
    tokenB: Token
  ): Promise<HyperSwapV2Dex> {
    const poolAddress = await HyperSwapV2Dex.findPool(
      publicClient,
      tokenA.address as Address,
      tokenB.address as Address
    );

    const pool: Pool = {
      protocol: Protocol.HyperSwapV2,
      address: poolAddress,
      tokens: [tokenA, tokenB],
    };

    return new HyperSwapV2Dex(pool, publicClient, walletClient);
  }
}
