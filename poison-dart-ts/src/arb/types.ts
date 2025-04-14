import type { TelegramMessage } from 'frogberry/utils/telegram';
/**
 * Types for the arbitrage bot
 * Enhanced version based on Rust implementation
 */
import type { Block, Hash, Log, Transaction } from 'viem';
import type { Address } from 'viem';
import type { Path } from './defi/mod';

/**
 * Event types that can be processed by the arbitrage strategy
 */
export enum EventType {
  Block = 'Block',
  Transaction = 'Transaction',
  Log = 'Log',
  SwapEvent = 'SwapEvent',
}

/**
 * Event union type for all events that can be processed by the arbitrage strategy
 */
export type Event =
  | { type: EventType.Block; data: Block }
  | { type: EventType.Transaction; data: Transaction }
  | { type: EventType.Log; data: Log }
  | { type: EventType.SwapEvent; data: SwapEvent };

/**
 * Action types that can be executed by the arbitrage bot
 */
export enum ActionType {
  ExecuteTransaction = 'ExecuteTransaction',
  NotifyViaTelegram = 'NotifyViaTelegram',
  SubmitBid = 'SubmitBid',
}

/**
 * Data for executing a transaction
 */
export interface ExecuteTransactionData {
  path: Path; // Path object from the arbitrage opportunity
  inputAmount: bigint; // Amount to use for the arbitrage
  triggerTxHash: string; // Transaction hash that triggered the arbitrage
  flashloan?: boolean; // Whether to use flashloan
  deadline?: number; // Optional deadline for time-sensitive opportunities
}

/**
 * Data for submitting a bid
 */
export interface SubmitBidData {
  path: Path; // Path object from the arbitrage opportunity
  inputAmount: bigint; // Amount to use for the arbitrage
  bidAmount: bigint; // Amount to bid
  triggerTxHash: string; // Transaction hash that triggered the arbitrage
  deadline: number; // Deadline for the bid
}

/**
 * Action union type for all actions that can be executed by the arbitrage bot
 */
export type Action =
  | { type: ActionType.ExecuteTransaction; data: ExecuteTransactionData }
  | { type: ActionType.NotifyViaTelegram; data: TelegramMessage }
  | { type: ActionType.SubmitBid; data: SubmitBidData };

/**
 * Source of an arbitrage opportunity
 */
export enum Source {
  Public = 'Public',
  Mempool = 'Mempool',
  Private = 'Private',
}

/**
 * Represents a token with its address and decimals
 */
export interface Token {
  address: string;
  symbol: string;
  decimals: number;
}

/**
 * Represents a DEX protocol
 */
export enum Protocol {
  Unknown = 'Unknown',
  Shadow = 'Shadow',
  SwapX = 'SwapX',
  KittenSwap = 'KittenSwap',
  KittenSwapStable = 'KittenSwapStable',
  HyperSwapV2 = 'HyperSwapV2',
  HyperSwapV3 = 'HyperSwapV3',
}

/**
 * Represents a pool on a DEX
 */
export interface Pool {
  protocol: Protocol;
  address: string;
  tokens: Token[];
  fee?: number;
  tickSpacing?: number;
  reserves?: [bigint, bigint]; // Token reserves for constant product pools
  liquidity?: bigint; // Liquidity for concentrated liquidity pools
  sqrtPriceX96?: bigint; // Current price for concentrated liquidity pools
}

/**
 * Represents a swap event
 */
export interface SwapEvent {
  protocol: Protocol;
  pool: string;
  tokensIn: string[];
  tokensOut: string[];
  amountsIn: bigint[];
  amountsOut: bigint[];
  transaction: Hash;
  blockNumber: number;
  timestamp: number;
}

/**
 * Trade type
 */
export enum TradeType {
  Swap = 'Swap',
  Flashloan = 'Flashloan',
}
