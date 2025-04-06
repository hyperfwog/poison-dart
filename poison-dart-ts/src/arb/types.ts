/**
 * Types for the arbitrage bot
 */
import { type Block, type Log, type Transaction, type Hash } from 'viem';
import { type Message } from '../libs/burberry/executor/telegram.js';

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
 * Action union type for all actions that can be executed by the arbitrage bot
 */
export type Action =
  | { type: ActionType.ExecuteTransaction; data: string } // Transaction data as hex string
  | { type: ActionType.NotifyViaTelegram; data: Message };

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
  Shadow = 'Shadow',
  SwapX = 'SwapX',
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
