/**
 * Core types for arbitrage finding
 */
import { type Address } from 'viem';
import { type Dex, Path } from '../defi/mod';
import { Protocol } from '../types';

/**
 * Represents a token in the arbitrage graph
 */
export interface TokenNode {
  address: Address;
  symbol: string;
  decimals: number;
  connections: Map<Address, EdgeInfo>;
}

/**
 * Represents an edge in the arbitrage graph
 */
export interface EdgeInfo {
  targetToken: Address;
  dex: Dex;
  protocol: Protocol;
  poolAddress: Address;
}

/**
 * Represents an arbitrage opportunity
 */
export interface ArbitrageOpportunity {
  path: Path;
  expectedProfit: bigint;
  inputAmount: bigint;
  protocols: Protocol[];
  startToken: Address;
  gasEstimate: bigint;
}

/**
 * Represents swap information extracted from a transaction
 */
export interface SwapInfo {
  protocol: Protocol;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  amountOut: bigint;
  poolAddress: Address;
}

/**
 * Result of a trade simulation
 */
export interface TradeSimulationResult {
  amountOut: bigint;
  gasCost: bigint;
  profit: bigint;
}
