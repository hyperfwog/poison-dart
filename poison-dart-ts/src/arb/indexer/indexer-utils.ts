/**
 * Utility functions for the DEX indexer
 */
import type { Address, PublicClient } from 'viem';
import { Logger } from '../../libs/logger';
import { Token } from '../types';

// Create a logger instance
const logger = Logger.forContext('IndexerUtils');

/**
 * Get token information
 * @param publicClient Public client for blockchain interaction
 * @param address Token address
 * @param tokenCache Token cache map
 * @returns Token information
 */
export async function getTokenInfo(
  publicClient: PublicClient,
  address: Address,
  tokenCache: Map<string, Token>
): Promise<Token> {
  // Check if token info is already cached
  const cachedToken = tokenCache.get(address.toLowerCase());
  if (cachedToken) {
    return cachedToken;
  }
  
  try {
    // Get token info from contract
    const symbol = await publicClient.readContract({
      address,
      abi: [
        {
          inputs: [],
          name: 'symbol',
          outputs: [{ internalType: 'string', name: '', type: 'string' }],
          stateMutability: 'view',
          type: 'function',
        },
      ],
      functionName: 'symbol',
    }) as string;
    
    const decimals = await publicClient.readContract({
      address,
      abi: [
        {
          inputs: [],
          name: 'decimals',
          outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
          stateMutability: 'view',
          type: 'function',
        },
      ],
      functionName: 'decimals',
    }) as number;
    
    // Create token
    const token: Token = {
      address: address.toLowerCase(),
      symbol,
      decimals,
    };
    
    // Cache token
    tokenCache.set(address.toLowerCase(), token);
    
    return token;
  } catch (error) {
    // Return default token info
    const token: Token = {
      address: address.toLowerCase(),
      symbol: address.slice(0, 6),
      decimals: 18,
    };
    
    // Cache token
    tokenCache.set(address.toLowerCase(), token);
    
    return token;
  }
}
