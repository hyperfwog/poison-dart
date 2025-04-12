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
      logger.debug(`Skipping tx ${tx.hash} - no input data`);
      return null;
    }
    
    // Check if the transaction is to a known router
    const to = tx.to as Address;
    const input = tx.input as `0x${string}`;
    
    // Check different DEX routers based on the transaction destination
    if (to === DEX_CONTRACTS.HYPERSWAP.V2_ROUTER) {
      return HyperSwapV2Dex.parseTransaction(this.publicClient, input);
    }
    
    if (to === DEX_CONTRACTS.HYPERSWAP.V3_ROUTER) {
      return HyperSwapV3Dex.parseTransaction(this.publicClient, input);
    }
    
    if (to === DEX_CONTRACTS.KITTENSWAP.ROUTER) {
      return KittenSwapDex.parseTransaction(this.publicClient, input);
    }
    
    if (to === DEX_CONTRACTS.SHADOW.ROUTER) {
      return ShadowDex.parseTransaction(this.publicClient, input);
    }
    
    if (to === DEX_CONTRACTS.SWAPX.ROUTER) {
      return SwapXDex.parseTransaction(this.publicClient, input);
    }
    
    logger.debug(`Transaction ${tx.hash} is not to a known DEX router: ${to}`);
    return null;
  }
}
