/**
 * HyperSwap V3 pool discovery
 */
import type { Address, PublicClient } from 'viem';
import { Logger } from '../../libs/logger';
import { Pool, Protocol } from '../types';
import { HyperSwapV3Dex } from '../defi/hyperswap-v3';
import { getTokenInfo } from './indexer-utils';

// Create a logger instance
const logger = Logger.forContext('HyperSwapV3Pools');

/**
 * Discover HyperSwap V3 pools
 * @param publicClient Public client for blockchain interaction
 * @param poolsMap Map to store discovered pools
 * @param tokensMap Map to store discovered tokens
 */
export async function discoverHyperSwapV3Pools(
  publicClient: PublicClient,
  poolsMap: Map<string, Pool>,
  tokensMap: Map<string, any>
): Promise<void> {
  logger.info('Discovering HyperSwap V3 pools...');
  
  try {
    // For V3, we'll use a different approach since there's no easy way to get all pools
    // We'll use the factory to check if pools exist for common token pairs with different fee tiers
    
    // Common tokens to check
    const commonTokens = [
      '0x039e2fB66102314Ce7b64Ce5Ce3E5183bc94aD38', // wS
      '0x29219dd400f2Bf60E5a23d13Be72B486D4038894', // USDC
      '0x6047828dc181963ba44974801ff68e538da5eaf9', // USDT
      '0x50c42dEAcD8Fc9773493ED674b675bE577f2634b', // WETH
      '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', // WBTC
    ];
    
    // Fee tiers
    const feeTiers = [500, 3000, 10000]; // 0.05%, 0.3%, 1%
    
    // Check all pairs of tokens with all fee tiers
    for (let i = 0; i < commonTokens.length; i++) {
      for (let j = i + 1; j < commonTokens.length; j++) {
        const token0 = commonTokens[i] as Address;
        const token1 = commonTokens[j] as Address;
        
        for (const fee of feeTiers) {
          try {
            // Get pool address
            const poolAddress = await HyperSwapV3Dex.findPool(
              publicClient,
              token0,
              token1,
              fee
            );
            
            if (poolAddress) {
              // Get token info
              const token0Info = await getTokenInfo(publicClient, token0, tokensMap);
              const token1Info = await getTokenInfo(publicClient, token1, tokensMap);
              
              // Get liquidity and sqrt price
              const slot0 = await publicClient.readContract({
                address: poolAddress,
                abi: [
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
                ],
                functionName: 'slot0',
              }) as any;
              
              const liquidity = await publicClient.readContract({
                address: poolAddress,
                abi: [
                  {
                    inputs: [],
                    name: 'liquidity',
                    outputs: [{ internalType: 'uint128', name: '', type: 'uint128' }],
                    stateMutability: 'view',
                    type: 'function',
                  },
                ],
                functionName: 'liquidity',
              }) as bigint;
              
              // Create pool
              const pool: Pool = {
                protocol: Protocol.HyperSwapV3,
                address: poolAddress,
                tokens: [
                  { address: token0, symbol: token0Info.symbol, decimals: token0Info.decimals },
                  { address: token1, symbol: token1Info.symbol, decimals: token1Info.decimals },
                ],
                fee,
                liquidity,
                sqrtPriceX96: slot0[0],
              };
              
              // Add pool to map
              const poolKey = `${Protocol.HyperSwapV3}-${poolAddress}`;
              poolsMap.set(poolKey, pool);
              
              logger.debug(`Indexed HyperSwap V3 pool ${poolAddress}: ${token0Info.symbol}/${token1Info.symbol} (${fee})`);
            }
          } catch (error) {
            // Pool doesn't exist, ignore
          }
        }
      }
    }
    
    logger.info(`Indexed ${poolsMap.size} HyperSwap V3 pools`);
  } catch (error) {
    logger.error(`Error discovering HyperSwap V3 pools: ${error}`);
  }
}
