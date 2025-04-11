import type { Executor } from 'frogberry';
/**
 * Transaction executor for the arbitrage bot
 */
import type { PublicClient, WalletClient } from 'viem';
import { Logger } from '../libs/logger';
import { type Action, ActionType } from './types';

// Create a logger instance for the executor
const logger = Logger.forContext('Executor');

/**
 * Executor for sending transactions
 */
export class TransactionExecutor implements Executor<Action> {
  private walletClient: WalletClient;
  private publicClient: PublicClient;

  constructor(walletClient: WalletClient, publicClient: PublicClient) {
    this.walletClient = walletClient;
    this.publicClient = publicClient;
  }

  name(): string {
    return 'TransactionExecutor';
  }

  async execute(action: Action): Promise<void> {
    // Only handle ExecuteTransaction actions
    if (action.type !== ActionType.ExecuteTransaction) {
      return;
    }

    try {
      // Check if we have an account
      if (!this.walletClient.account) {
        throw new Error('No account available in wallet client');
      }

      // Send the transaction
      const txHash = await this.walletClient.sendTransaction({
        account: this.walletClient.account,
        data: action.data as `0x${string}`,
        chain: this.publicClient.chain,
      });

      logger.info(`Transaction sent: ${txHash}`);

      // Wait for the transaction to be mined
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
      logger.success(`Transaction mined: ${txHash}, status: ${receipt.status}`);
    } catch (error) {
      logger.error('Failed to execute transaction:', error);
      throw error;
    }
  }
}
