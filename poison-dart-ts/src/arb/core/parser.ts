/**
 * Transaction parser for extracting swap information
 * Optimized version with improved performance and reliability
 */
import type { Address, PublicClient, Transaction } from 'viem';
import { Logger } from '../../libs/logger';
import { DEX_CONTRACTS } from '../config';
import { HyperSwapV2Dex } from '../defi/hyperswap-v2';
import { HyperSwapV3Dex } from '../defi/hyperswap-v3';
import { KittenSwapDex } from '../defi/kittenswap';
import { ShadowDex } from '../defi/shadow';
import { SwapXDex } from '../defi/swapx';
import { Protocol } from '../types';
import type { SwapInfo } from './types';

// Create a logger instance for the transaction parser
const logger = Logger.forContext('TxParser');

/**
 * Common DEX function signatures - centralized definition to avoid duplication
 * This is exported so it can be used by other modules
 */
export const DEX_SIGNATURES: Record<string, { name: string; protocol?: Protocol }> = {
  // Uniswap V2 function signatures
  '0x38ed1739': { name: 'swapExactTokensForTokens', protocol: Protocol.HyperSwapV2 },
  '0x8803dbee': { name: 'swapTokensForExactTokens', protocol: Protocol.HyperSwapV2 },
  '0x7ff36ab5': { name: 'swapExactETHForTokens', protocol: Protocol.HyperSwapV2 },
  '0x4a25d94a': { name: 'swapTokensForExactETH', protocol: Protocol.HyperSwapV2 },
  '0x18cbafe5': { name: 'swapExactTokensForETH', protocol: Protocol.HyperSwapV2 },
  '0xfb3bdb41': { name: 'swapETHForExactTokens', protocol: Protocol.HyperSwapV2 },

  // Uniswap V3 function signatures
  '0x414bf389': { name: 'exactInputSingle', protocol: Protocol.HyperSwapV3 },
  '0xc04b8d59': { name: 'exactInput', protocol: Protocol.HyperSwapV3 },
  '0xdb3e2198': { name: 'exactOutputSingle', protocol: Protocol.HyperSwapV3 },
  '0xf28c0498': { name: 'exactOutput', protocol: Protocol.HyperSwapV3 },

  // KittenSwap specific functions
  '0x42712a67': { name: 'swapExactTokensForTokensSimple', protocol: Protocol.KittenSwap },

  // Unknown DEX Router 2 functions
  '0xdd10b14e': { name: 'unknownFunction' },

  // Other common functions
  '0xac9650d8': { name: 'multicall' },
};

/**
 * Static mapping of router addresses to DEX implementations
 * This avoids recreating the map for each instance
 */
const ROUTER_MAP = new Map<
  string,
  {
    parser: (client: PublicClient, input: `0x${string}`) => Promise<SwapInfo | null>;
    name: string;
    protocol: Protocol;
  }
>();

// Initialize the router map
ROUTER_MAP.set(DEX_CONTRACTS.HYPERSWAP.V2_ROUTER.toLowerCase(), {
  parser: HyperSwapV2Dex.parseTransaction,
  name: 'HyperSwap V2',
  protocol: Protocol.HyperSwapV2,
});

ROUTER_MAP.set(DEX_CONTRACTS.HYPERSWAP.V3_ROUTER.toLowerCase(), {
  parser: HyperSwapV3Dex.parseTransaction,
  name: 'HyperSwap V3',
  protocol: Protocol.HyperSwapV3,
});

ROUTER_MAP.set(DEX_CONTRACTS.KITTENSWAP.ROUTER.toLowerCase(), {
  parser: KittenSwapDex.parseTransaction,
  name: 'KittenSwap',
  protocol: Protocol.KittenSwap,
});

ROUTER_MAP.set(DEX_CONTRACTS.SHADOW.ROUTER.toLowerCase(), {
  parser: ShadowDex.parseTransaction,
  name: 'Shadow',
  protocol: Protocol.Shadow,
});

ROUTER_MAP.set(DEX_CONTRACTS.SWAPX.ROUTER.toLowerCase(), {
  parser: SwapXDex.parseTransaction,
  name: 'SwapX',
  protocol: Protocol.SwapX,
});

// KittenSwap V3 is a Uniswap V3 fork
ROUTER_MAP.set(DEX_CONTRACTS.KITTENSWAP.V3_ROUTER.toLowerCase(), {
  parser: HyperSwapV3Dex.parseTransaction,
  name: 'KittenSwap V3',
  protocol: Protocol.KittenSwap,
});

// Unknown DEX Router 2
ROUTER_MAP.set(DEX_CONTRACTS.UNKNOWN_DEXES.ROUTER_2.toLowerCase(), {
  parser: async () => null, // No parser implemented yet
  name: 'Unknown DEX Router 2',
  protocol: Protocol.Unknown,
});

/**
 * Class for parsing transactions to extract swap information
 * Optimized for performance and reliability
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
    // Skip if transaction has no input data or no 'to' address
    if (!tx.input || tx.input === '0x' || !tx.to) {
      return null;
    }

    const to = (tx.to as Address).toLowerCase();
    const input = tx.input as `0x${string}`;

    // Get the function signature
    const signature = input.slice(0, 10);
    const functionInfo = DEX_SIGNATURES[signature];

    // Check if this is a known DEX router
    const routerInfo = ROUTER_MAP.get(to);
    if (routerInfo) {
      logger.info(`Transaction ${tx.hash} is to ${routerInfo.name} Router (${to})`);

      try {
        // Try to parse the transaction using the router's parser
        const swapInfo = await routerInfo.parser(this.publicClient, input);
        if (swapInfo) {
          return swapInfo;
        }

        // If we couldn't parse it but it has a known DEX function signature, log it
        if (functionInfo) {
          logger.info(
            `Transaction ${tx.hash} is to a known DEX router (${routerInfo.name}) but could not be parsed as a swap`
          );
          logger.info(`Transaction ${tx.hash} function signature: ${signature}`);

          // Log if it's a known DEX function
          logger.info(`Transaction ${tx.hash} contains ${functionInfo.name} function`);

          // Special handling for specific functions
          if (signature === '0x414bf389' || signature === '0xc04b8d59') {
            // exactInputSingle or exactInput
            this.tryExtractV3SwapParameters(tx, input, signature);
          }
        }
      } catch (error) {
        logger.error(`Error parsing transaction ${tx.hash}: ${error}`);
      }
    } else {
      // Not a known router, but check if it has a DEX function signature
      if (functionInfo) {
        logger.debug(
          `Transaction ${tx.hash} contains DEX function ${functionInfo.name} but is not to a known router: ${to}`
        );
      } else {
        logger.debug(`Transaction ${tx.hash} is not to a known DEX router: ${to}`);
      }
    }

    return null;
  }

  /**
   * Try to extract parameters from a V3 swap transaction
   * This is used for debugging purposes
   * @param tx Transaction
   * @param input Transaction input data
   * @param signature Function signature
   */
  private tryExtractV3SwapParameters(_tx: Transaction, input: string, signature: string): void {
    try {
      if (signature === '0x414bf389') {
        // exactInputSingle
        // Extract parameters from input data
        const tokenInHex = `0x${input.slice(34, 74)}`;
        const tokenOutHex = `0x${input.slice(98, 138)}`;
        const feeHex = `0x${input.slice(138, 202)}`;
        const amountInHex = `0x${input.slice(330, 394)}`;

        const tokenIn = tokenInHex;
        const tokenOut = tokenOutHex;
        const fee = Number(BigInt(feeHex));
        const amountIn = BigInt(amountInHex);

        logger.debug(`  TokenIn: ${tokenIn}`);
        logger.debug(`  TokenOut: ${tokenOut}`);
        logger.debug(`  Fee: ${fee}`);
        logger.debug(`  AmountIn: ${amountIn}`);
      } else if (signature === '0xc04b8d59') {
        // exactInput
        // This is more complex as the path is encoded in bytes
        logger.debug('  exactInput function detected, parameters not extracted');
      }
    } catch (error) {
      logger.debug(`Error extracting V3 swap parameters: ${error}`);
    }
  }

  /**
   * Check if a transaction contains a known DEX function signature
   * @param input Transaction input data
   * @returns Function info if found, null otherwise
   */
  static identifyDexFunction(input: string): { name: string; protocol?: Protocol } | null {
    if (!input || input.length < 10) return null;

    const signature = input.slice(0, 10);
    return DEX_SIGNATURES[signature] || null;
  }

  /**
   * Get the name of a router by its address
   * @param address Router address
   * @returns Router name if known, null otherwise
   */
  static getRouterName(address: string): string | null {
    const routerInfo = ROUTER_MAP.get(address.toLowerCase());
    return routerInfo ? routerInfo.name : null;
  }

  /**
   * Check if an address is a known DEX router
   * @param address Address to check
   * @returns True if the address is a known DEX router, false otherwise
   */
  static isKnownRouter(address: string): boolean {
    return ROUTER_MAP.has(address.toLowerCase());
  }
}
