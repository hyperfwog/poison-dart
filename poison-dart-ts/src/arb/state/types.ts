/**
 * Types for the enhanced state management system
 */
import type { Address, Hash } from 'viem';
import type { Protocol, Pool, Token, Source, SwapEvent } from '../types';

/**
 * Event types that can be processed by the state manager
 */
export enum StateEventType {
  PoolCreated = 'PoolCreated',
  PoolUpdated = 'PoolUpdated',
  Swap = 'Swap',
  LiquidityAdded = 'LiquidityAdded',
  LiquidityRemoved = 'LiquidityRemoved',
}

/**
 * Base interface for all state events
 */
export interface BaseStateEvent {
  type: StateEventType;
  protocol: Protocol;
  poolAddress: Address;
  timestamp: number;
  source: Source;
  transactionHash?: Hash;
}

/**
 * Event for pool creation
 */
export interface PoolCreatedEvent extends BaseStateEvent {
  type: StateEventType.PoolCreated;
  pool: Pool;
}

/**
 * Event for pool updates
 */
export interface PoolUpdatedEvent extends BaseStateEvent {
  type: StateEventType.PoolUpdated;
  pool: Pool;
  changes: PoolChanges;
}

/**
 * Event for swaps
 */
export interface SwapStateEvent extends BaseStateEvent {
  type: StateEventType.Swap;
  swapEvent: SwapEvent;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  amountOut: bigint;
}

/**
 * Event for liquidity additions
 */
export interface LiquidityAddedEvent extends BaseStateEvent {
  type: StateEventType.LiquidityAdded;
  tokens: Address[];
  amounts: bigint[];
}

/**
 * Event for liquidity removals
 */
export interface LiquidityRemovedEvent extends BaseStateEvent {
  type: StateEventType.LiquidityRemoved;
  tokens: Address[];
  amounts: bigint[];
}

/**
 * Union type for all state events
 */
export type StateEvent =
  | PoolCreatedEvent
  | PoolUpdatedEvent
  | SwapStateEvent
  | LiquidityAddedEvent
  | LiquidityRemovedEvent;

/**
 * Changes to a pool's state
 */
export interface PoolChanges {
  reserves?: [bigint, bigint];
  liquidity?: bigint;
  sqrtPriceX96?: bigint;
  fee?: number;
  tickSpacing?: number;
}

/**
 * Pool state with generation tracking
 */
export interface PoolState {
  pool: Pool;
  generation: number;
  lastUpdated: number;
}

/**
 * Token pair key for lookups
 */
export type TokenPairKey = `${string}-${string}`;

/**
 * Cache statistics
 */
export interface CacheStats {
  poolCount: number;
  tokenCount: number;
  tokenPairCount: number;
  hitCount: number;
  missCount: number;
  evictionCount: number;
  generationCount: number;
}

/**
 * Pool lookup by different keys
 */
export interface PoolLookup {
  byAddress: Map<string, PoolState>;
  byToken: Map<string, Set<string>>;
  byTokenPair: Map<TokenPairKey, Set<string>>;
  byProtocol: Map<Protocol, Set<string>>;
}

/**
 * Event processor function type
 */
export type EventProcessor = (event: StateEvent) => Promise<void>;

/**
 * Event subscription callback
 */
export type EventSubscription = (event: StateEvent) => void;
