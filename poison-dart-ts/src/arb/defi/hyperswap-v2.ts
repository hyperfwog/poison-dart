/**
 * HyperSwap V2 DEX implementation (Uniswap V2 fork)
 */
import { type Address, type PublicClient, type Transaction, type WalletClient, encodeFunctionData } from 'viem';
import { Logger } from '../../libs/logger';
import { DEX_CONTRACTS } from '../config';
import { type Pool, Protocol, type Token } from '../types';
import { type SwapInfo } from '../core/types';
import { BaseDex } from './mod';

// Create a logger instance for HyperSwapV2Dex
const logger = Logger.forContext('HyperSwapV2');

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
  /**
   * Parse a HyperSwap V2 transaction
   * @param publicClient The public client
   * @param input Transaction input data
   * @returns Swap information if the transaction is a swap, null otherwise
   */
  static async parseTransaction(
    publicClient: PublicClient,
    input: `0x${string}`
  ): Promise<SwapInfo | null> {
    // Function signatures for HyperSwap V2
    const swapExactTokensForTokens = '0x38ed1739'; // swapExactTokensForTokens(uint256,uint256,address[],address,uint256)
    const swapTokensForExactTokens = '0x8803dbee'; // swapTokensForExactTokens(uint256,uint256,address[],address,uint256)
    const swapExactETHForTokens = '0x7ff36ab5'; // swapExactETHForTokens(uint256,address[],address,uint256)
    const swapTokensForExactETH = '0x4a25d94a'; // swapTokensForExactETH(uint256,uint256,address[],address,uint256)
    const swapExactTokensForETH = '0x18cbafe5'; // swapExactTokensForETH(uint256,uint256,address[],address,uint256)
    const swapETHForExactTokens = '0xfb3bdb41'; // swapETHForExactTokens(uint256,address[],address,uint256)
    
    // Check function signature
    const signature = input.slice(0, 10);
    
    // Handle different swap functions
    if (signature === swapExactTokensForTokens || signature === swapTokensForExactTokens || 
        signature === swapExactTokensForETH) {
      // This is a simplified parser and doesn't handle all edge cases
      // In a real implementation, you would use a proper ABI decoder
      
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
      
      // Find the pool address
      try {
        const poolAddress = await HyperSwapV2Dex.findPool(
          publicClient,
          tokenIn,
          tokenOut
        );
        
        // For simplicity, we'll set amountOut to 0 since we don't know it yet
        return {
          protocol: Protocol.HyperSwapV2,
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
