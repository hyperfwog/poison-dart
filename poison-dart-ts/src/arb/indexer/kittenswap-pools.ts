/**
 * KittenSwap pool discovery
 */
import type { Address, PublicClient } from 'viem';
import { Logger } from '../../libs/logger';
import { DEX_CONTRACTS } from '../config';
import { Pool, Protocol } from '../types';
import { getTokenInfo } from './indexer-utils';

// Create a logger instance
const logger = Logger.forContext('KittenSwapPools');

/**
 * Discover KittenSwap pools
 * @param publicClient Public client for blockchain interaction
 * @param poolsMap Map to store discovered pools
 * @param tokensMap Map to store discovered tokens
 */
export async function discoverKittenSwapPools(
  publicClient: PublicClient,
  poolsMap: Map<string, Pool>,
  tokensMap: Map<string, any>
): Promise<void> {
  logger.info('Discovering KittenSwap pools...');
  
  try {
    const factoryAddress = DEX_CONTRACTS.KITTENSWAP.FACTORY as Address;
    
    // Get pool count from factory
    const poolCount = await publicClient.readContract({
      address: factoryAddress,
      abi: [
        {
          inputs: [],
          name: 'allPairsLength',
          outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
          stateMutability: 'view',
          type: 'function',
        },
      ],
      functionName: 'allPairsLength',
    }) as bigint;
    
    logger.info(`Found ${poolCount} KittenSwap pools`);
    
    // Limit the number of pools to index for performance
    const maxPools = 100;
    const poolsToIndex = Number(poolCount) > maxPools ? maxPools : Number(poolCount);
    
    // Get pools in batches
    const batchSize = 10;
    for (let i = 0; i < poolsToIndex; i += batchSize) {
      const batch = [];
      for (let j = i; j < Math.min(i + batchSize, poolsToIndex); j++) {
        batch.push(j);
      }
      
      // Get pools in parallel
      await Promise.all(
        batch.map(async (index) => {
          try {
            // Get pool address
            const poolAddress = await publicClient.readContract({
              address: factoryAddress,
              abi: [
                {
                  inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
                  name: 'allPairs',
                  outputs: [{ internalType: 'address', name: '', type: 'address' }],
                  stateMutability: 'view',
                  type: 'function',
                },
              ],
              functionName: 'allPairs',
              args: [BigInt(index)],
            }) as Address;
            
            // Get token addresses
            const token0 = await publicClient.readContract({
              address: poolAddress,
              abi: [
                {
                  inputs: [],
                  name: 'token0',
                  outputs: [{ internalType: 'address', name: '', type: 'address' }],
                  stateMutability: 'view',
                  type: 'function',
                },
              ],
              functionName: 'token0',
            }) as Address;
            
            const token1 = await publicClient.readContract({
              address: poolAddress,
              abi: [
                {
                  inputs: [],
                  name: 'token1',
                  outputs: [{ internalType: 'address', name: '', type: 'address' }],
                  stateMutability: 'view',
                  type: 'function',
                },
              ],
              functionName: 'token1',
            }) as Address;
            
            const isStable = await publicClient.readContract({
              address: poolAddress,
              abi: [
                {
                  inputs: [],
                  name: 'stable',
                  outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
                  stateMutability: 'view',
                  type: 'function',
                },
              ],
              functionName: 'stable',
            }) as boolean;
            
            // Get token info
            const token0Info = await getTokenInfo(publicClient, token0, tokensMap);
            const token1Info = await getTokenInfo(publicClient, token1, tokensMap);
            
            // Get reserves
            const reserves = await publicClient.readContract({
              address: poolAddress,
              abi: [
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
              ],
              functionName: 'getReserves',
            }) as [bigint, bigint, bigint];
            
            // Create pool
            const pool: Pool = {
              protocol: isStable ? Protocol.KittenSwapStable : Protocol.KittenSwap,
              address: poolAddress,
              tokens: [
                { address: token0, symbol: token0Info.symbol, decimals: token0Info.decimals },
                { address: token1, symbol: token1Info.symbol, decimals: token1Info.decimals },
              ],
              reserves: [reserves[0], reserves[1]],
            };
            
            // Add pool to map
            const poolKey = `${isStable ? Protocol.KittenSwapStable : Protocol.KittenSwap}-${poolAddress}`;
            poolsMap.set(poolKey, pool);
            
            logger.debug(`Indexed KittenSwap ${isStable ? 'stable' : 'volatile'} pool ${poolAddress}: ${token0Info.symbol}/${token1Info.symbol}`);
          } catch (error) {
            logger.error(`Error indexing KittenSwap pool at index ${index}: ${error}`);
          }
        })
      );
    }
    
    logger.info(`Indexed ${poolsMap.size} KittenSwap pools`);
  } catch (error) {
    logger.error(`Error discovering KittenSwap pools: ${error}`);
  }
}
