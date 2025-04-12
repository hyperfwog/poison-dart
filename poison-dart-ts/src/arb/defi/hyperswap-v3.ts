/**
 * HyperSwap V3 DEX implementation (Uniswap V3 fork)
 */
import {
  type Address,
  type PublicClient,
  type Transaction,
  type WalletClient,
  encodeFunctionData,
} from 'viem';
import { Logger } from '../../libs/logger';
import { DEX_CONTRACTS } from '../config';
import type { SwapInfo } from '../core/types';
import { type Pool, Protocol, type Token } from '../types';
import { BaseDex } from './mod';

// Create a logger instance for HyperSwapV3Dex
const logger = Logger.forContext('HyperSwapV3');

// HyperSwap V3 Router ABI
const HYPERSWAP_V3_ROUTER_ABI = [
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
];

// HyperSwap V3 Quoter ABI
const HYPERSWAP_V3_QUOTER_ABI = [
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

// HyperSwap V3 Factory ABI
const HYPERSWAP_V3_FACTORY_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'tokenA', type: 'address' },
      { internalType: 'address', name: 'tokenB', type: 'address' },
      { internalType: 'uint24', name: 'fee', type: 'uint24' },
    ],
    name: 'getPool',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
];

// HyperSwap V3 Pool ABI
const HYPERSWAP_V3_POOL_ABI = [
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
  {
    inputs: [],
    name: 'fee',
    outputs: [{ internalType: 'uint24', name: '', type: 'uint24' }],
    stateMutability: 'view',
    type: 'function',
  },
];

/**
 * HyperSwap V3 DEX implementation
 */
export class HyperSwapV3Dex extends BaseDex {
  /**
   * Parse a HyperSwap V3 transaction
   * @param publicClient The public client
   * @param input Transaction input data
   * @returns Swap information if the transaction is a swap, null otherwise
   */
  static async parseTransaction(
    publicClient: PublicClient,
    input: `0x${string}`
  ): Promise<SwapInfo | null> {
    // Function signatures for HyperSwap V3
    const exactInputSingle = '0x414bf389'; // exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))
    const exactInput = '0xc04b8d59'; // exactInput((bytes,address,uint256,uint256,uint256))
    const _exactOutputSingle = '0xdb3e2198'; // exactOutputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))
    const _exactOutput = '0xf28c0498'; // exactOutput((bytes,address,uint256,uint256,uint256))
    const multicall = '0xac9650d8'; // multicall(bytes[])

    // Check function signature
    const signature = input.slice(0, 10);

    // Create a logger instance
    const logger = Logger.forContext('HyperSwapV3');

    // Handle exactInputSingle
    if (signature === exactInputSingle) {
      try {
        // Extract parameters from input data using a more robust approach
        // Format: exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96))

        // Skip function signature (4 bytes) and get the struct parameters
        // The struct starts at offset 4 (after function signature)
        // Each parameter is 32 bytes, and we need to extract specific parts

        // tokenIn is at offset 4 + 32 = 36, but we need to skip the first 12 bytes of the 32-byte word
        const tokenInHex = `0x${input.slice(34, 74)}`;
        // tokenOut is at offset 4 + 64 = 68, but we need to skip the first 12 bytes of the 32-byte word
        const tokenOutHex = `0x${input.slice(98, 138)}`;
        // fee is at offset 4 + 96 = 100
        const feeHex = `0x${input.slice(138, 202)}`;
        // amountIn is at offset 4 + 160 = 164
        const amountInHex = `0x${input.slice(330, 394)}`;

        const tokenIn = tokenInHex as `0x${string}` as Address;
        const tokenOut = tokenOutHex as `0x${string}` as Address;
        const fee = Number(BigInt(feeHex));
        const amountIn = BigInt(amountInHex);

        // Log the extracted parameters for debugging
        logger.debug(`  TokenIn: ${tokenIn}`);
        logger.debug(`  TokenOut: ${tokenOut}`);
        logger.debug(`  Fee: ${fee}`);
        logger.debug(`  AmountIn: ${amountIn}`);

        // Find the pool address
        const poolAddress = await HyperSwapV3Dex.findPool(publicClient, tokenIn, tokenOut, fee);

        // For simplicity, we'll set amountOut to 0 since we don't know it yet
        return {
          protocol: Protocol.HyperSwapV3,
          tokenIn,
          tokenOut,
          amountIn,
          amountOut: BigInt(0),
          poolAddress,
        };
      } catch (error) {
        // Log the error but don't throw
        logger.error(`Error parsing exactInputSingle: ${error}`);
        return null;
      }
    }

    // Handle exactInput
    if (signature === exactInput) {
      try {
        // Format: exactInput((bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum))

        // This is more complex as the path is encoded in bytes
        // Extract the path offset, which is the first parameter (32 bytes after the function signature)
        const pathOffsetHex = `0x${input.slice(10, 74)}`;
        const pathOffset = Number(BigInt(pathOffsetHex));

        // Extract the amountIn, which is the fourth parameter (32*3 bytes after the function signature)
        const amountInHex = `0x${input.slice(202, 266)}`;
        const amountIn = BigInt(amountInHex);

        // The path starts at the offset (relative to the start of the function parameters)
        // First, we need to get the length of the path bytes
        const pathLengthOffset = 10 + pathOffset * 2; // Convert byte offset to hex string offset
        const pathLengthHex = `0x${input.slice(pathLengthOffset, pathLengthOffset + 64)}`;
        const pathLength = Number(BigInt(pathLengthHex));

        // Now we can extract the path bytes
        const pathBytesOffset = pathLengthOffset + 64;
        const pathBytes = `0x${input.slice(pathBytesOffset, pathBytesOffset + pathLength * 2)}`;

        // The path is encoded as a sequence of addresses with 3-byte fee values in between
        // For example: tokenA + fee + tokenB + fee + tokenC
        // We need at least the first and last token

        // Try to extract the first token (first 20 bytes of the path)
        let tokenIn: Address | null = null;
        let tokenOut: Address | null = null;

        if (pathLength >= 20) {
          tokenIn = `0x${pathBytes.slice(2, 42)}` as `0x${string}` as Address;
        }

        // Try to extract the last token (last 20 bytes of the path)
        if (pathLength >= 43) {
          // 20 (first token) + 3 (fee) + 20 (last token)
          // The last token starts at offset pathLength - 20
          const lastTokenOffset = 2 + (pathLength - 20) * 2;
          tokenOut =
            `0x${pathBytes.slice(lastTokenOffset, lastTokenOffset + 40)}` as `0x${string}` as Address;
        }

        logger.debug(`  Detected exactInput with path length: ${pathLength}`);
        logger.debug(`  First token in path: ${tokenIn}`);
        logger.debug(`  Last token in path: ${tokenOut}`);
        logger.debug(`  AmountIn: ${amountIn}`);

        // If we have both tokens, we can return swap info
        if (tokenIn && tokenOut) {
          // We don't know the exact pool address for multi-hop paths
          // For simplicity, we'll just use a placeholder
          return {
            protocol: Protocol.HyperSwapV3,
            tokenIn,
            tokenOut,
            amountIn,
            amountOut: BigInt(0),
            poolAddress: '0x0000000000000000000000000000000000000000' as Address,
          };
        }

        logger.info(`Detected exactInput function, but couldn't extract complete path`);
        return null;
      } catch (error) {
        logger.error(`Error parsing exactInput: ${error}`);
        return null;
      }
    }

    // Handle multicall (which often contains swap functions)
    if (signature === multicall) {
      try {
        // Format: multicall(bytes[] data)
        // This is complex as it contains multiple function calls

        // Extract the data array offset, which is the first parameter (32 bytes after the function signature)
        const dataArrayOffsetHex = `0x${input.slice(10, 74)}`;
        const dataArrayOffset = Number(BigInt(dataArrayOffsetHex));

        // The array starts at the offset (relative to the start of the function parameters)
        // First, we need to get the length of the array
        const arrayLengthOffset = 10 + dataArrayOffset * 2; // Convert byte offset to hex string offset
        const arrayLengthHex = `0x${input.slice(arrayLengthOffset, arrayLengthOffset + 64)}`;
        const arrayLength = Number(BigInt(arrayLengthHex));

        logger.debug(`  Multicall with ${arrayLength} calls`);

        // For each call in the array, we need to extract the call data
        // This is quite complex and would require recursive parsing
        // For now, we'll just check if any of the calls are swap functions

        // Start at the array length offset + 32 bytes (the length itself)
        let currentOffset = arrayLengthOffset + 64;

        for (let i = 0; i < arrayLength && i < 10; i++) {
          // Limit to 10 calls to avoid excessive processing
          // Each element in the array is a bytes value, which starts with an offset
          const elementOffsetHex = `0x${input.slice(currentOffset, currentOffset + 64)}`;
          const elementOffset = Number(BigInt(elementOffsetHex));

          // The element starts at the array offset + element offset
          const elementStart = arrayLengthOffset + elementOffset * 2;

          // First, get the length of the bytes
          const elementLengthHex = `0x${input.slice(elementStart, elementStart + 64)}`;
          const elementLength = Number(BigInt(elementLengthHex));

          // Now we can extract the bytes
          const elementBytesStart = elementStart + 64;
          const elementBytes = `0x${input.slice(elementBytesStart, elementBytesStart + elementLength * 2)}`;

          // Check if this is a swap function
          if (elementLength >= 4) {
            const callSignature = elementBytes.slice(0, 10);

            if (callSignature === exactInputSingle || callSignature === exactInput) {
              logger.debug(`  Found swap function in multicall: ${callSignature}`);

              // Try to parse this call recursively
              const swapInfo = await HyperSwapV3Dex.parseTransaction(
                publicClient,
                elementBytes as `0x${string}`
              );
              if (swapInfo) {
                return swapInfo;
              }
            }
          }

          // Move to the next element
          currentOffset += 64;
        }

        logger.info('Detected multicall function, but no swap functions found or parsing failed');
        return null;
      } catch (error) {
        logger.error(`Error parsing multicall: ${error}`);
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
        abi: HYPERSWAP_V3_POOL_ABI,
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
      abi: HYPERSWAP_V3_ROUTER_ABI,
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
        address: DEX_CONTRACTS.HYPERSWAP.V3_QUOTER as Address,
        abi: HYPERSWAP_V3_QUOTER_ABI,
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
      // Sort tokens to match the factory's expected order
      const [token0, token1] = tokenA < tokenB ? [tokenA, tokenB] : [tokenB, tokenA];

      const result = await publicClient.readContract({
        address: DEX_CONTRACTS.HYPERSWAP.V3_FACTORY as Address,
        abi: HYPERSWAP_V3_FACTORY_ABI,
        functionName: 'getPool',
        args: [token0, token1, fee],
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
   * @returns The HyperSwap V3 DEX instance
   */
  static async createPool(
    publicClient: PublicClient,
    walletClient: WalletClient,
    tokenA: Token,
    tokenB: Token,
    fee: number
  ): Promise<HyperSwapV3Dex> {
    const poolAddress = await HyperSwapV3Dex.findPool(
      publicClient,
      tokenA.address as Address,
      tokenB.address as Address,
      fee
    );

    const pool: Pool = {
      protocol: Protocol.HyperSwapV3,
      address: poolAddress,
      tokens: [tokenA, tokenB],
      fee,
    };

    return new HyperSwapV3Dex(pool, publicClient, walletClient);
  }
}
