/**
 * Transaction parser for extracting swap information
 */
import { type Address, type PublicClient, type Transaction } from 'viem';
import { Logger } from '../../libs/logger';
import { DEX_CONTRACTS } from '../config';
import { HyperSwapV2Dex } from '../defi/hyperswap-v2';
import { HyperSwapV3Dex } from '../defi/hyperswap-v3';
import { KittenSwapDex } from '../defi/kittenswap';
import { ShadowDex } from '../defi/shadow';
import { SwapXDex } from '../defi/swapx';
import { Protocol } from '../types';
import { type SwapInfo } from './types';

// Create a logger instance for the transaction parser
const logger = Logger.forContext('TxParser');

/**
 * Class for parsing transactions to extract swap information
 */
export class TransactionParser {
  private publicClient: PublicClient;

  constructor(publicClient: PublicClient) {
    this.publicClient = publicClient;
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
    
    // Check if the transaction is to a known router
    const to = tx.to as Address;
    const input = tx.input as `0x${string}`;
    
    // Check different DEX routers based on the transaction destination
    if (to === DEX_CONTRACTS.HYPERSWAP.V2_ROUTER) {
      return this.parseHyperSwapV2Transaction(input);
    }
    
    if (to === DEX_CONTRACTS.HYPERSWAP.V3_ROUTER) {
      return this.parseHyperSwapV3Transaction(input);
    }
    
    if (to === DEX_CONTRACTS.KITTENSWAP.ROUTER) {
      return this.parseKittenSwapTransaction(input);
    }
    
    if (to === DEX_CONTRACTS.SHADOW.ROUTER) {
      return this.parseShadowTransaction(input);
    }
    
    if (to === DEX_CONTRACTS.SWAPX.ROUTER) {
      return this.parseSwapXTransaction(input);
    }
    
    return null;
  }

  /**
   * Parse a HyperSwap V2 transaction
   * @param input Transaction input data
   * @returns Swap information if the transaction is a swap, null otherwise
   */
  private async parseHyperSwapV2Transaction(input: `0x${string}`): Promise<SwapInfo | null> {
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
          this.publicClient,
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

  /**
   * Parse a HyperSwap V3 transaction
   * @param input Transaction input data
   * @returns Swap information if the transaction is a swap, null otherwise
   */
  private async parseHyperSwapV3Transaction(input: `0x${string}`): Promise<SwapInfo | null> {
    // Function signatures for HyperSwap V3
    const exactInputSingle = '0x414bf389'; // exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))
    const exactInput = '0xc04b8d59'; // exactInput((bytes,address,uint256,uint256,uint256))
    const exactOutputSingle = '0xdb3e2198'; // exactOutputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))
    const exactOutput = '0xf28c0498'; // exactOutput((bytes,address,uint256,uint256,uint256))
    
    // Check function signature
    const signature = input.slice(0, 10);
    
    // Handle exactInputSingle
    if (signature === exactInputSingle) {
      // Extract parameters from input data
      // Format: exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96))
      
      // Skip function signature (4 bytes) and get the struct parameters
      const tokenInHex = '0x' + input.slice(34, 74);
      const tokenOutHex = '0x' + input.slice(98, 138);
      const feeHex = '0x' + input.slice(138, 202);
      const amountInHex = '0x' + input.slice(330, 394);
      
      const tokenIn = tokenInHex as `0x${string}` as Address;
      const tokenOut = tokenOutHex as `0x${string}` as Address;
      const fee = Number(BigInt(feeHex));
      const amountIn = BigInt(amountInHex);
      
      // Find the pool address
      try {
        const poolAddress = await HyperSwapV3Dex.findPool(
          this.publicClient,
          tokenIn,
          tokenOut,
          fee
        );
        
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
        // Pool not found
        return null;
      }
    }
    
    return null;
  }

  /**
   * Parse a KittenSwap transaction
   * @param input Transaction input data
   * @returns Swap information if the transaction is a swap, null otherwise
   */
  private async parseKittenSwapTransaction(input: `0x${string}`): Promise<SwapInfo | null> {
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
          this.publicClient,
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
          this.publicClient,
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

  /**
   * Parse a Shadow transaction
   * @param input Transaction input data
   * @returns Swap information if the transaction is a swap, null otherwise
   */
  private async parseShadowTransaction(input: `0x${string}`): Promise<SwapInfo | null> {
    // Function signatures for Shadow (Uniswap V3 fork)
    const exactInputSingle = '0x414bf389'; // exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))
    
    // Check function signature
    const signature = input.slice(0, 10);
    
    // For simplicity, we'll just handle exactInputSingle
    if (signature === exactInputSingle) {
      // Extract parameters from input data
      // Format: exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96))
      
      // Skip function signature (4 bytes) and get the struct parameters
      const tokenInHex = '0x' + input.slice(34, 74);
      const tokenOutHex = '0x' + input.slice(98, 138);
      const feeHex = '0x' + input.slice(138, 202);
      const amountInHex = '0x' + input.slice(330, 394);
      
      const tokenIn = tokenInHex as `0x${string}` as Address;
      const tokenOut = tokenOutHex as `0x${string}` as Address;
      const fee = Number(BigInt(feeHex));
      const amountIn = BigInt(amountInHex);
      
      // Find the pool address
      try {
        const poolAddress = await ShadowDex.findPool(
          this.publicClient,
          tokenIn,
          tokenOut,
          fee
        );
        
        // For simplicity, we'll set amountOut to 0 since we don't know it yet
        return {
          protocol: Protocol.Shadow,
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

  /**
   * Parse a SwapX transaction
   * @param input Transaction input data
   * @returns Swap information if the transaction is a swap, null otherwise
   */
  private async parseSwapXTransaction(input: `0x${string}`): Promise<SwapInfo | null> {
    // Function signatures for SwapX (Algebra V4)
    const exactInputSingle = '0xc36442b5'; // exactInputSingle((address,address,address,uint256,uint256,uint160))
    
    // Check function signature
    const signature = input.slice(0, 10);
    
    // For simplicity, we'll just handle exactInputSingle
    if (signature === exactInputSingle) {
      // Extract parameters from input data
      // Format: exactInputSingle((address tokenIn, address tokenOut, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96))
      
      // Skip function signature (4 bytes) and get the struct parameters
      const tokenInHex = '0x' + input.slice(34, 74);
      const tokenOutHex = '0x' + input.slice(98, 138);
      const amountInHex = '0x' + input.slice(202, 266);
      
      const tokenIn = tokenInHex as `0x${string}` as Address;
      const tokenOut = tokenOutHex as `0x${string}` as Address;
      const amountIn = BigInt(amountInHex);
      
      // Find the pool address
      try {
        const poolAddress = await SwapXDex.findPool(
          this.publicClient,
          tokenIn,
          tokenOut
        );
        
        // For simplicity, we'll set amountOut to 0 since we don't know it yet
        return {
          protocol: Protocol.SwapX,
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
}
