import type { Executor } from 'frogberry';
/**
 * Transaction executor for the arbitrage bot
 */
import type { PublicClient, WalletClient } from 'viem';
import { Logger } from '../libs/logger';
import { type Action, ActionType, type ExecuteTransactionData } from './types';
import { Trader } from './defi/mod';

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

      const txData = action.data as ExecuteTransactionData;
      logger.info(`Executing arbitrage transaction for opportunity from tx ${txData.triggerTxHash}`);
      
      // Create a trader instance
      const trader = new Trader(this.publicClient, this.walletClient);
      
      // Execute the trade
      const txHash = await trader.executeTrade({
        sender: this.walletClient.account.address,
        amountIn: txData.inputAmount,
        path: txData.path,
        slippage: 0.5, // 0.5% slippage
        gasPrice: await this.publicClient.getGasPrice(),
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
