/**
 * Token graph implementation for finding arbitrage paths
 */
import { type Address, type PublicClient } from 'viem';
import { Logger } from '../../libs/logger';
import { type Dex, Path } from '../defi/mod';
import { type Pool, Protocol } from '../types';
import { type EdgeInfo, type TokenNode } from './types';

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
  addNode(token: Address, symbol: string = '', decimals: number = 18): TokenNode {
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
   */
  addEdge(
    fromToken: Address,
    toToken: Address,
    dex: Dex,
    protocol: Protocol,
    poolAddress: Address
  ): void {
    // Get or create source token node
    const fromNode = this.addNode(fromToken);
    
    // Create edge info
    const edgeInfo: EdgeInfo = {
      targetToken: toToken,
      dex,
      protocol,
      poolAddress,
    };
    
    // Add edge to source token
    fromNode.connections.set(toToken, edgeInfo);
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
    
    // Add edges in both directions
    this.addEdge(tokenA, tokenB, dexA2B, pool.protocol, pool.address as Address);
    this.addEdge(tokenB, tokenA, dexB2A, pool.protocol, pool.address as Address);
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
   * Find potential arbitrage paths starting from a token
   * @param startToken Token to start from
   * @param maxHops Maximum number of hops
   * @returns List of potential arbitrage paths
   */
  findArbitragePaths(startToken: Address, maxHops: number): Address[][] {
    const paths: Address[][] = [];
    
    // Helper function for DFS
    const dfs = (currentToken: Address, currentPath: Address[], depth: number) => {
      // If we've reached the maximum depth, check if we can get back to the start
      if (depth >= maxHops) {
        const tokenNode = this.graph.get(currentToken);
        if (tokenNode && tokenNode.connections.has(startToken)) {
          // We can get back to the start, add the complete cycle
          paths.push([...currentPath, startToken]);
        }
        return;
      }
      
      // Get the token node
      const tokenNode = this.graph.get(currentToken);
      if (!tokenNode) {
        return;
      }
      
      // Try each connection
      for (const [nextToken, _] of tokenNode.connections) {
        // Skip if we've already visited this token
        if (currentPath.includes(nextToken)) {
          continue;
        }
        
        // Add the token to the path and continue DFS
        dfs(nextToken, [...currentPath, nextToken], depth + 1);
      }
    };
    
    // Start DFS from the start token
    dfs(startToken, [startToken], 0);
    
    return paths;
  }

  /**
   * Create a Path object from a list of tokens
   * @param tokens List of tokens
   * @returns Path object
   */
  createPathFromTokens(tokens: Address[]): Path {
    const dexes: Dex[] = [];
    
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
      dexes.push(edge.dex);
    }
    
    return new Path(dexes);
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
      if (tokenNode && tokenNode.symbol) {
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
    } catch (error) {
      // Default values if we can't get the info
      return {
        symbol: token.slice(0, 6),
        decimals: 18,
      };
    }
  }
}
