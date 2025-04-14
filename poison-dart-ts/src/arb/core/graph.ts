/**
 * Token graph implementation for finding arbitrage paths
 * Enhanced version with Bellman-Ford algorithm for negative cycle detection
 */
import type { Address, PublicClient } from 'viem';
import { Logger } from '../../libs/logger';
import type { Pool, Protocol } from '../types';
import type { Dex, EdgeInfo, TokenNode } from './types';
import { Path } from './trader';

// Create a logger instance for the token graph
const logger = Logger.forContext('TokenGraph');

/**
 * Class for managing the token graph
 */
export class TokenGraph {
  private graph: Map<Address, TokenNode> = new Map();
  private publicClient: PublicClient;

  constructor(publicClient: PublicClient) {
    this.publicClient = publicClient;
  }

  /**
   * Get the number of tokens in the graph
   */
  get size(): number {
    return this.graph.size;
  }

  /**
   * Get a token node from the graph
   * @param token Token address
   * @returns Token node or undefined if not found
   */
  getNode(token: Address): TokenNode | undefined {
    return this.graph.get(token);
  }

  /**
   * Add a token node to the graph
   * @param token Token address
   * @param symbol Token symbol
   * @param decimals Token decimals
   * @returns The token node
   */
  addNode(token: Address, symbol = '', decimals = 18): TokenNode {
    let node = this.graph.get(token);
    if (!node) {
      node = {
        address: token,
        symbol,
        decimals,
        connections: new Map(),
      };
      this.graph.set(token, node);
    }
    return node;
  }

  /**
   * Add an edge to the graph
   * @param fromToken Source token
   * @param toToken Target token
   * @param dex DEX that connects the tokens
   * @param protocol Protocol of the DEX
   * @param poolAddress Address of the pool
   * @param liquidity Liquidity of the pool
   */
  addEdge(
    fromToken: Address,
    toToken: Address,
    dex: Dex,
    protocol: Protocol,
    poolAddress: Address,
    liquidity: bigint = BigInt(0)
  ): void {
    // Get or create source token node
    const fromNode = this.addNode(fromToken);

    // Calculate exchange rate and weight
    // Weight is negative log of exchange rate for Bellman-Ford
    const exchangeRate = this.calculateExchangeRate(dex);
    const weight = -Math.log(Number(exchangeRate));

    // Create edge info
    const edgeInfo: EdgeInfo = {
      targetToken: toToken,
      dex,
      protocol,
      poolAddress,
      liquidity,
      weight,
    };

    // Add edge to source token
    fromNode.connections.set(toToken, edgeInfo);
  }

  /**
   * Calculate exchange rate for a DEX
   * @param dex DEX to calculate exchange rate for
   * @returns Exchange rate
   */
  private calculateExchangeRate(dex: Dex): number {
    try {
      // This is a simplified version - in a real implementation, you would
      // need to get the actual exchange rate from the DEX
      // For constant product pools, this would be based on reserves
      // For concentrated liquidity pools, this would be based on the current price
      return 0.98; // Simplified: 2% slippage
    } catch (error) {
      logger.error('Error calculating exchange rate:', error);
      return 1.0;
    }
  }

  /**
   * Add edges for a pool in both directions
   * @param pool Pool to add
   * @param dexA2B DEX instance for A to B direction
   * @param dexB2A DEX instance for B to A direction
   */
  addPool(pool: Pool, dexA2B: Dex, dexB2A: Dex): void {
    const tokenA = pool.tokens[0].address as Address;
    const tokenB = pool.tokens[1].address as Address;

    // Add token nodes with symbol and decimals
    this.addNode(tokenA, pool.tokens[0].symbol, pool.tokens[0].decimals);
    this.addNode(tokenB, pool.tokens[1].symbol, pool.tokens[1].decimals);

    // Calculate liquidity
    const liquidity = pool.liquidity || (pool.reserves ? pool.reserves[0] + pool.reserves[1] : BigInt(0));

    // Add edges in both directions
    this.addEdge(tokenA, tokenB, dexA2B, pool.protocol, pool.address as Address, liquidity);
    this.addEdge(tokenB, tokenA, dexB2A, pool.protocol, pool.address as Address, liquidity);
  }

  /**
   * Update token information
   * @param token Token address
   * @param symbol Token symbol
   * @param decimals Token decimals
   */
  updateTokenInfo(token: Address, symbol: string, decimals: number): void {
    const node = this.graph.get(token);
    if (node) {
      node.symbol = symbol;
      node.decimals = decimals;
    }
  }

  /**
   * Find arbitrage opportunities using Bellman-Ford algorithm
   * @param startToken Token to start from
   * @returns List of arbitrage paths
   */
  findArbitrageOpportunities(startToken: Address): Path[] {
    logger.info(`Finding arbitrage opportunities starting from ${startToken}`);
    
    // Initialize distances and predecessors
    const distances = new Map<Address, number>();
    const predecessors = new Map<Address, { token: Address; dex: Dex } | null>();
    
    // Set initial distances
    for (const [token, _] of this.graph.entries()) {
      distances.set(token, token === startToken ? 0 : Infinity);
      predecessors.set(token, null);
    }
    
    // Relax edges |V| - 1 times
    const nodeCount = this.graph.size;
    for (let i = 0; i < nodeCount - 1; i++) {
      let updated = false;
      
      for (const [token, node] of this.graph.entries()) {
        const tokenDist = distances.get(token)!;
        if (tokenDist === Infinity) continue;
        
        for (const [targetToken, edge] of node.connections.entries()) {
          const targetDist = distances.get(targetToken)!;
          const newDist = tokenDist + edge.weight;
          
          if (newDist < targetDist) {
            distances.set(targetToken, newDist);
            predecessors.set(targetToken, { token, dex: edge.dex });
            updated = true;
          }
        }
      }
      
      if (!updated) break;
    }
    
    // Check for negative cycles
    const negativeCycles: Path[] = [];
    
    // For each edge, check if it can be relaxed further
    for (const [token, node] of this.graph.entries()) {
      for (const [targetToken, edge] of node.connections.entries()) {
        const tokenDist = distances.get(token)!;
        const targetDist = distances.get(targetToken)!;
        
        if (tokenDist !== Infinity && tokenDist + edge.weight < targetDist) {
          // Negative cycle detected
          logger.info(`Negative cycle detected involving ${token} -> ${targetToken}`);
          
          // Reconstruct the cycle
          const cycle = this.reconstructCycle(token, targetToken, predecessors);
          
          if (cycle.length > 0) {
            // Create a Path object from the cycle
            const path = this.createPathFromCycle(cycle);
            
            if (!path.isEmpty()) {
              negativeCycles.push(path);
            }
          }
        }
      }
    }
    
    logger.info(`Found ${negativeCycles.length} arbitrage opportunities`);
    return negativeCycles;
  }

  /**
   * Reconstruct a cycle from a negative cycle detection
   * @param start Start token of the relaxed edge
   * @param end End token of the relaxed edge
   * @param predecessors Map of predecessors
   * @returns Array of tokens in the cycle
   */
  private reconstructCycle(
    start: Address,
    end: Address,
    predecessors: Map<Address, { token: Address; dex: Dex } | null>
  ): { token: Address; dex: Dex }[] {
    // Find a node in the cycle
    let current = start;
    const visited = new Set<Address>();
    
    while (!visited.has(current)) {
      visited.add(current);
      const pred = predecessors.get(current);
      if (!pred) break;
      current = pred.token;
    }
    
    // If we didn't find a cycle, return empty array
    if (!visited.has(current)) {
      return [];
    }
    
    // Reconstruct the cycle
    const cycle: { token: Address; dex: Dex }[] = [];
    let cycleStart = current;
    let token = current;
    
    do {
      const pred = predecessors.get(token);
      if (!pred) break;
      
      cycle.push({ token: pred.token, dex: pred.dex });
      token = pred.token;
    } while (token !== cycleStart);
    
    // Add the final edge to complete the cycle
    const finalEdge = this.graph.get(cycle[cycle.length - 1].token)?.connections.get(cycleStart);
    if (finalEdge) {
      cycle.push({ token: cycleStart, dex: finalEdge.dex });
    }
    
    return cycle;
  }

  /**
   * Create a Path object from a cycle
   * @param cycle Cycle to create a path from
   * @returns Path object
   */
  private createPathFromCycle(cycle: { token: Address; dex: Dex }[]): Path {
    const path = new Path();
    
    // Add each DEX to the path
    for (const { dex } of cycle) {
      if (dex.pool) {
        path.addPool(dex.pool, false);
      }
    }
    
    return path;
  }

  /**
   * Create a Path object from a list of tokens
   * @param tokens List of tokens
   * @returns Path object
   */
  createPathFromTokens(tokens: Address[]): Path {
    const path = new Path();

    // For each pair of tokens, find a DEX
    for (let i = 0; i < tokens.length - 1; i++) {
      const tokenA = tokens[i];
      const tokenB = tokens[i + 1];

      // Get the token node
      const tokenNode = this.graph.get(tokenA);
      if (!tokenNode) {
        return new Path();
      }

      // Get the edge
      const edge = tokenNode.connections.get(tokenB);
      if (!edge) {
        return new Path();
      }

      // Add the DEX to the path
      if (edge.dex.pool) {
        path.addPool(edge.dex.pool, false);
      }
    }

    return path;
  }

  /**
   * Get all tokens in the graph
   * @returns Array of token nodes
   */
  getTokens(): TokenNode[] {
    return Array.from(this.graph.values());
  }

  /**
   * Get token information (symbol and decimals)
   * @param token Token address
   * @returns Token information
   */
  async getTokenInfo(token: Address): Promise<{ symbol: string; decimals: number }> {
    try {
      // Try to get token info from the token graph
      const tokenNode = this.graph.get(token);
      if (tokenNode?.symbol) {
        return {
          symbol: tokenNode.symbol,
          decimals: tokenNode.decimals,
        };
      }

      // Get token info from the blockchain
      const [symbol, decimals] = await Promise.all([
        this.publicClient.readContract({
          address: token,
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
        }),
        this.publicClient.readContract({
          address: token,
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
        }),
      ]);

      // Update token graph
      this.updateTokenInfo(token, symbol as string, decimals as number);

      return {
        symbol: symbol as string,
        decimals: decimals as number,
      };
    } catch (_error) {
      // Default values if we can't get the info
      return {
        symbol: token.slice(0, 6),
        decimals: 18,
      };
    }
  }
}
