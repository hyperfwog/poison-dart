import type { TelegramMessage } from 'frogberry/utils/telegram';
/**
 * Types for the arbitrage bot
 */
import type { Block, Hash, Log, Transaction } from 'viem';

/**
 * Event types that can be processed by the arbitrage strategy
 */
export enum EventType {
  Block = 'Block',
  Transaction = 'Transaction',
  Log = 'Log',
}

/**
 * Event union type for all events that can be processed by the arbitrage strategy
 */
export type Event =
  | { type: EventType.Block; data: Block }
  | { type: EventType.Transaction; data: Transaction }
  | { type: EventType.Log; data: Log };

/**
 * Action types that can be executed by the arbitrage bot
 */
export enum ActionType {
  ExecuteTransaction = 'ExecuteTransaction',
  NotifyViaTelegram = 'NotifyViaTelegram',
}

/**
 * Data for executing a transaction
 */
export interface ExecuteTransactionData {
  path: any; // Path object from the arbitrage opportunity
  inputAmount: bigint; // Amount to use for the arbitrage
  triggerTxHash: string; // Transaction hash that triggered the arbitrage
}

/**
 * Action union type for all actions that can be executed by the arbitrage bot
 */
export type Action =
  | { type: ActionType.ExecuteTransaction; data: ExecuteTransactionData }
  | { type: ActionType.NotifyViaTelegram; data: TelegramMessage };

/**
 * Source of an arbitrage opportunity
 */
export enum Source {
  Public = 'Public',
  Mempool = 'Mempool',
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
}
