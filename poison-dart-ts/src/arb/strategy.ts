import type { ActionSubmitter, Strategy } from 'frogberry';
/**
 * Arbitrage strategy implementation
 */
import type { Block, Log, PublicClient, Transaction, WalletClient } from 'viem';
import { Logger } from '../libs/logger';
import type { ArbConfig } from './config';
import { DEX_CONTRACTS } from './config';
import { ArbitrageFinder, ArbitrageOpportunity } from './core';
import { type Action, ActionType, type Event, EventType, Protocol } from './types';

// Create a logger instance for the strategy
const logger = Logger.forContext('Strategy');

/**
 * Arbitrage strategy
 */
export class ArbStrategy implements Strategy<Event, Action> {
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient;
  private readonly config: ArbConfig;
  private readonly finder: ArbitrageFinder;
  private isInitialized: boolean = false;

  constructor(publicClient: PublicClient, walletClient: WalletClient, config: ArbConfig) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.config = config;
    this.finder = new ArbitrageFinder(publicClient, walletClient, config);
  }

  name(): string {
    return 'ArbStrategy';
  }

  async processEvent(event: Event, submitter: ActionSubmitter<Action>): Promise<void> {
    // Initialize the arbitrage finder if not already initialized
    if (!this.isInitialized) {
      await this.initialize();
      this.isInitialized = true;
    }

    switch (event.type) {
      case EventType.Block:
        await this.processBlock(event.data, submitter);
        break;
      case EventType.Log:
        await this.processLog(event.data, submitter);
        break;
      case EventType.Transaction:
        await this.processTransaction(event.data, submitter);
        break;
    }
  }

  /**
   * Initialize the arbitrage finder
   */
  private async initialize(): Promise<void> {
    logger.info('Initializing arbitrage finder...');
    await this.finder.initialize();
    logger.info('Arbitrage finder initialized');
  }

  /**
   * Process a new block
   * @param block The new block
   * @param submitter The action submitter
   */
  private async processBlock(block: Block, submitter: ActionSubmitter<Action>): Promise<void> {
    logger.info(`Processing block ${block.number}`);

    // For now, we'll just send a notification
    submitter.submit({
      type: ActionType.NotifyViaTelegram,
      data: {
        botToken: this.config.telegram?.botToken || '',
        chatId: this.config.telegram?.chatId || '',
        text: `New block: ${block.number} with ${block.transactions.length} transactions`,
      },
    });
  }

  /**
   * Process a new log
   * @param log The new log
   * @param submitter The action submitter
   */
  private async processLog(log: Log, submitter: ActionSubmitter<Action>): Promise<void> {
    logger.info(`Processing log from ${log.address}`);

    // For now, we'll just send a notification for USDC transfers
    if (
      log.address === '0x04068DA6C83AFCFA0e13ba15A6696662335D5B75' &&
      log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
    ) {
      submitter.submit({
        type: ActionType.NotifyViaTelegram,
        data: {
          botToken: this.config.telegram?.botToken || '',
          chatId: this.config.telegram?.chatId || '',
          text: `USDC transfer detected in transaction ${log.transactionHash}`,
        },
      });
    }
  }

  /**
   * Process a new transaction
   * @param tx Transaction to parse
   * @param submitter The action submitter
   */
  private async processTransaction(
    tx: Transaction,
    submitter: ActionSubmitter<Action>
  ): Promise<void> {
    logger.info(`Processing transaction ${tx.hash}`);

    // Skip if transaction has no input data
    if (!tx.input || tx.input === '0x') {
      logger.debug(`Skipping tx ${tx.hash} - no input data`);
      return;
    }

    // Check if the transaction is to a known router
    const to = tx.to;
    if (!to) {
      logger.debug(`Skipping tx ${tx.hash} - no 'to' address`);
      return;
    }

    // Log if the transaction is to a known DEX router
    if (to === DEX_CONTRACTS.HYPERSWAP.V2_ROUTER) {
      logger.info(`Transaction ${tx.hash} is to HyperSwap V2 Router`);
    } else if (to === DEX_CONTRACTS.HYPERSWAP.V3_ROUTER) {
      logger.info(`Transaction ${tx.hash} is to HyperSwap V3 Router`);
    } else if (to === DEX_CONTRACTS.KITTENSWAP.ROUTER) {
      logger.info(`Transaction ${tx.hash} is to KittenSwap Router`);
    } else if (to === DEX_CONTRACTS.SHADOW.ROUTER) {
      logger.info(`Transaction ${tx.hash} is to Shadow Router`);
    } else if (to === DEX_CONTRACTS.SWAPX.ROUTER) {
      logger.info(`Transaction ${tx.hash} is to SwapX Router`);
    } else {
      logger.debug(`Transaction ${tx.hash} is not to a known DEX router: ${to}`);
      return;
    }

    // Try to parse the transaction as a swap
    try {
      const swapInfo = await this.finder.parseTransaction(tx);
      
      // Log all detected swaps, even if they don't lead to arbitrage opportunities
      if (swapInfo) {
        const protocolName = Protocol[swapInfo.protocol];
        logger.info(
          `Detected ${protocolName} swap in tx ${tx.hash}: ${swapInfo.tokenIn} -> ${swapInfo.tokenOut} (amount: ${swapInfo.amountIn})`
        );
      } else {
        logger.info(`Transaction ${tx.hash} is to a known DEX router but could not be parsed as a swap`);
      }
    } catch (error) {
      logger.error(`Error parsing transaction ${tx.hash}: ${error}`);
      return;
    }

    // Try to parse the transaction as a swap again for the log
    const swapInfo = await this.finder.parseTransaction(tx);
    
    // Log all detected swaps, even if they don't lead to arbitrage opportunities
    if (swapInfo) {
      const protocolName = Protocol[swapInfo.protocol];
      logger.info(
        `Detected ${protocolName} swap in tx ${tx.hash}: ${swapInfo.tokenIn} -> ${swapInfo.tokenOut} (amount: ${swapInfo.amountIn})`
      );
      
      // Find arbitrage opportunities
      const opportunities = await this.finder.findArbitrageOpportunities(swapInfo);
      
      // Log the opportunities
      if (opportunities.length > 0) {
        await this.logArbitrageOpportunities(opportunities, tx.hash, submitter);
        
        // Execute the best opportunity if auto-execution is enabled
        if (this.config.autoExecute && opportunities[0].expectedProfit > this.config.minProfitThreshold) {
          await this.executeArbitrageOpportunity(opportunities[0], tx.hash, submitter);
        }
      } else {
        logger.info(`No profitable arbitrage opportunities found for swap in tx ${tx.hash}`);
      }
      
      // Log golden search progress if applicable
      if (this.config.optimizeInputAmount && opportunities.length > 0) {
        logger.info(`Running golden section search for optimal input amount for tx ${tx.hash}...`);
        const optimizedOpportunity = await this.finder.optimizeOpportunity(opportunities[0]);
        logger.info(
          `Optimized opportunity: ${optimizedOpportunity.expectedProfit} profit with input ${optimizedOpportunity.inputAmount}`
        );
        
        // Execute the optimized opportunity if auto-execution is enabled
        if (this.config.autoExecute && optimizedOpportunity.expectedProfit > this.config.minProfitThreshold) {
          await this.executeArbitrageOpportunity(optimizedOpportunity, tx.hash, submitter);
        }
      }
    }
  }

  /**
   * Log arbitrage opportunities
   * @param opportunities List of arbitrage opportunities
   * @param txHash Transaction hash
   * @param submitter Action submitter
   */
  private async logArbitrageOpportunities(
    opportunities: ArbitrageOpportunity[],
    txHash: string,
    submitter: ActionSubmitter<Action>
  ): Promise<void> {
    // Log each opportunity
    for (const opportunity of opportunities) {
      logger.info(
        `Found arbitrage opportunity in tx ${txHash}: ` +
        `${opportunity.expectedProfit} profit with ` +
        `${opportunity.protocols.join(' -> ')}`
      );
      
      // Send a notification
      if (this.config.telegram) {
        const message = this.formatOpportunityMessage(opportunity, txHash);
        
        submitter.submit({
          type: ActionType.NotifyViaTelegram,
          data: {
            botToken: this.config.telegram.botToken,
            chatId: this.config.telegram.chatId,
            text: message,
          },
        });
      }
    }
  }

  /**
   * Format an arbitrage opportunity message
   * @param opportunity Arbitrage opportunity
   * @param txHash Transaction hash
   * @returns Formatted message
   */
  private formatOpportunityMessage(
    opportunity: ArbitrageOpportunity,
    txHash: string
  ): string {
    // Format the profit in ETH
    const profitEth = Number(opportunity.expectedProfit) / 1e18;
    
    // Format the input amount in ETH
    const inputEth = Number(opportunity.inputAmount) / 1e18;
    
    // Format the gas estimate in ETH
    const gasEth = Number(opportunity.gasEstimate) / 1e18;
    
    // Format the protocols
    const protocols = opportunity.protocols.join(' -> ');
    
    // Format the message
    return `🚨 Arbitrage Opportunity 🚨\n\n` +
      `Transaction: ${txHash}\n` +
      `Profit: ${profitEth.toFixed(6)} ETH\n` +
      `Input: ${inputEth.toFixed(6)} ETH\n` +
      `Gas: ${gasEth.toFixed(6)} ETH\n` +
      `Path: ${protocols}\n` +
      `Start Token: ${opportunity.startToken}`;
  }

  /**
   * Execute an arbitrage opportunity
   * @param opportunity Arbitrage opportunity to execute
   * @param triggerTxHash Transaction hash that triggered the opportunity
   * @param submitter Action submitter
   */
  private async executeArbitrageOpportunity(
    opportunity: ArbitrageOpportunity,
    triggerTxHash: string,
    submitter: ActionSubmitter<Action>
  ): Promise<void> {
    logger.info(`Executing arbitrage opportunity from tx ${triggerTxHash}...`);
    
    try {
      // Submit the transaction
      submitter.submit({
        type: ActionType.ExecuteTransaction,
        data: {
          path: opportunity.path,
          inputAmount: opportunity.inputAmount,
          triggerTxHash,
        },
      });
      
      logger.info(`Arbitrage transaction submitted for opportunity from tx ${triggerTxHash}`);
      
      // Send a notification
      if (this.config.telegram) {
        const message = `🚀 Executing Arbitrage 🚀\n\n` +
          `Trigger Transaction: ${triggerTxHash}\n` +
          `Expected Profit: ${(Number(opportunity.expectedProfit) / 1e18).toFixed(6)} ETH\n` +
          `Path: ${opportunity.protocols.join(' -> ')}`;
        
        submitter.submit({
          type: ActionType.NotifyViaTelegram,
          data: {
            botToken: this.config.telegram.botToken,
            chatId: this.config.telegram.chatId,
            text: message,
          },
        });
      }
    } catch (error) {
      logger.error(`Error executing arbitrage opportunity: ${error}`);
      
      // Send a notification about the error
      if (this.config.telegram) {
        const message = `❌ Arbitrage Execution Failed ❌\n\n` +
          `Trigger Transaction: ${triggerTxHash}\n` +
          `Error: ${error}`;
        
        submitter.submit({
          type: ActionType.NotifyViaTelegram,
          data: {
            botToken: this.config.telegram.botToken,
            chatId: this.config.telegram.chatId,
            text: message,
          },
        });
      }
    }
  }
}
