/**
 * Core types for arbitrage finding
 * Enhanced version based on Rust implementation
 */
import type { Address } from 'viem';
import type { Dex, Path } from '../defi/mod';
import type { Protocol, Source } from '../types';

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
  liquidity: bigint;
  weight: number; // Negative log of exchange rate
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
  source: Source;
  deadline?: number; // Optional deadline for time-sensitive opportunities
  createdAt: number; // Timestamp when the opportunity was created
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
  path?: Path;
  expectedProfit?: bigint;
  protocols?: Protocol[];
  gasEstimate?: bigint;
}

/**
 * Result of a trade simulation
 */
export interface TradeSimulationResult {
  amountOut: bigint;
  gasCost: bigint;
  profit: bigint;
  cacheMisses?: number; // For tracking simulation cache performance
}

/**
 * Result of a trial with a specific input amount
 */
export interface TrialResult {
  tokenType: string;
  amountIn: bigint;
  profit: bigint;
  tradePath: Path;
  cacheMisses: number;
}

/**
 * Entry in the arbitrage cache
 */
export interface ArbEntry {
  swapInfo: SwapInfo;
  generation: number;
  expiresAt: number;
  source: Source;
}

/**
 * Item in the priority heap for arbitrage opportunities
 */
export interface HeapItem {
  expiresAt: number;
  generation: number;
  key: string;
  expectedProfit: bigint;
}

/**
 * Context for a trade
 */
export interface TradeContext {
  sender: Address;
  amountIn: bigint;
  path: Path;
  slippage: number;
  gasPrice: bigint;
  flashloan?: boolean; // Whether to use flashloan
}

/**
 * Result of a flashloan operation
 */
export interface FlashResult {
  coinOut: any; // Token received from flashloan
  receipt: any; // Receipt for repaying the flashloan
  pool?: any; // Optional pool reference
}
