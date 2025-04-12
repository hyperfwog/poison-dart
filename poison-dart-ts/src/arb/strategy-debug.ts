import type { ActionSubmitter, Strategy } from 'frogberry';
/**
 * Arbitrage strategy implementation with enhanced debugging
 */
import type { Block, Log, PublicClient, Transaction, WalletClient } from 'viem';
import { Logger } from '../libs/logger';
import type { ArbConfig } from './config';
import { DEX_CONTRACTS } from './config';
import { ArbitrageFinder, type ArbitrageOpportunity } from './core';
import { type Action, ActionType, type Event, EventType, Protocol } from './types';

// Create a logger instance for the strategy
const logger = Logger.forContext('Strategy');

/**
 * Enhanced debug version of the Arbitrage strategy
 */
export class ArbStrategyDebug implements Strategy<Event, Action> {
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient;
  private readonly config: ArbConfig;
  private readonly finder: ArbitrageFinder;
  private isInitialized = false;
  private knownRouters: Map<string, string> = new Map();

  constructor(publicClient: PublicClient, walletClient: WalletClient, config: ArbConfig) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.config = config;
    this.finder = new ArbitrageFinder(publicClient, walletClient, config);

    // Initialize known routers map for easier lookup and debugging
    this.initializeKnownRouters();
  }

  /**
   * Initialize the map of known DEX routers for easier lookup
   */
  private initializeKnownRouters() {
    // Add all known routers to the map with their protocol names
    this.knownRouters.set(DEX_CONTRACTS.HYPERSWAP.V2_ROUTER.toLowerCase(), 'HyperSwap V2');
    this.knownRouters.set(DEX_CONTRACTS.HYPERSWAP.V3_ROUTER.toLowerCase(), 'HyperSwap V3');
    this.knownRouters.set(DEX_CONTRACTS.KITTENSWAP.ROUTER.toLowerCase(), 'KittenSwap');
    //this.knownRouters.set(DEX_CONTRACTS.SHADOW.ROUTER.toLowerCase(), 'Shadow');
    //this.knownRouters.set(DEX_CONTRACTS.SWAPX.ROUTER.toLowerCase(), 'SwapX');
    this.knownRouters.set(DEX_CONTRACTS.KITTENSWAP.V3_ROUTER.toLowerCase(), 'KittenSwap V3');
    this.knownRouters.set(
      DEX_CONTRACTS.UNKNOWN_DEXES.ROUTER_2.toLowerCase(),
      'Unknown DEX Router 2'
    );

    logger.info(`Initialized ${this.knownRouters.size} known DEX routers`);
  }

  name(): string {
    return 'ArbStrategyDebug';
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
   * Process a new transaction with enhanced debugging
   * @param tx Transaction to parse
   * @param submitter The action submitter
   */
  private async processTransaction(
    tx: Transaction,
    submitter: ActionSubmitter<Action>
  ): Promise<void> {
    logger.info(`Processing transaction ${tx.hash}`);

    // Skip if transaction has no input data or no 'to' address
    if (!tx.input || tx.input === '0x' || !tx.to) {
      return;
    }

    // Enhanced debugging: Log transaction details
    this.logTransactionDetails(tx);

    // Get the function signature
    const signature = tx.input.slice(0, 10);

    // Check if the transaction is to a known DEX router
    const toAddress = tx.to.toLowerCase();
    const knownRouter = this.knownRouters.get(toAddress);

    // Use the TransactionParser to parse the transaction
    try {
      const swapInfo = await this.finder.parseTransaction(tx);

      // Process the swap if found
      if (swapInfo) {
        const protocolName = Protocol[swapInfo.protocol];
        logger.info(
          `Detected ${protocolName} swap in tx ${tx.hash}: ${swapInfo.tokenIn} -> ${swapInfo.tokenOut} (amount: ${swapInfo.amountIn})`
        );

        // Find arbitrage opportunities
        logger.info(`Finding arbitrage opportunities for tx ${tx.hash}...`);
        const startTime = performance.now();
        const opportunities = await this.finder.findArbitrageOpportunities(swapInfo);
        const endTime = performance.now();
        logger.info(`Arbitrage search completed in ${(endTime - startTime).toFixed(2)}ms`);

        // Log the opportunities
        if (opportunities.length > 0) {
          await this.logArbitrageOpportunities(opportunities, tx.hash, submitter);

          // Execute the best opportunity if auto-execution is enabled
          if (
            this.config.autoExecute &&
            opportunities[0].expectedProfit > this.config.minProfitThreshold
          ) {
            await this.executeArbitrageOpportunity(opportunities[0], tx.hash, submitter);
          }

          // Optimize the opportunity if configured
          if (this.config.optimizeInputAmount) {
            logger.info(`Optimizing input amount for tx ${tx.hash}...`);
            const startOptimizeTime = performance.now();
            const optimizedOpportunity = await this.finder.optimizeOpportunity(opportunities[0]);
            const endOptimizeTime = performance.now();
            logger.info(
              `Optimization completed in ${(endOptimizeTime - startOptimizeTime).toFixed(2)}ms`
            );

            logger.info(
              `Optimized opportunity: ${optimizedOpportunity.expectedProfit} profit with input ${optimizedOpportunity.inputAmount}`
            );

            // Execute the optimized opportunity if auto-execution is enabled
            if (
              this.config.autoExecute &&
              optimizedOpportunity.expectedProfit > this.config.minProfitThreshold
            ) {
              await this.executeArbitrageOpportunity(optimizedOpportunity, tx.hash, submitter);
            }
          }
        } else {
          logger.info(`No profitable arbitrage opportunities found for swap in tx ${tx.hash}`);
        }
      } else if (knownRouter) {
        // If it's a known router but couldn't be parsed as a swap, log more details
        logger.info(
          `Transaction ${tx.hash} is to a known DEX router (${knownRouter}) but could not be parsed as a swap`
        );
        logger.info(`Transaction ${tx.hash} function signature: ${signature}`);

        // Use the centralized DEX_SIGNATURES from the parser
        const { TransactionParser } = await import('./core/parser');
        const functionInfo = TransactionParser.identifyDexFunction(tx.input);

        if (functionInfo) {
          logger.info(`Transaction ${tx.hash} contains ${functionInfo.name} function`);

          // Extract parameters for common functions
          if (signature === '0x414bf389') {
            // exactInputSingle
            this.extractExactInputSingleParameters(tx.input);
          } else if (signature === '0xc04b8d59') {
            // exactInput
            this.extractExactInputParameters(tx.input);
          } else if (signature === '0xac9650d8') {
            // multicall
            logger.info(`Transaction ${tx.hash} contains multicall function`);
          }
        }
      } else {
        // Not a known router
        logger.debug(`Transaction ${tx.hash} is not to a known DEX router: ${tx.to}`);

        // Check if it has a DEX function signature
        const { TransactionParser } = await import('./core/parser');
        const functionInfo = TransactionParser.identifyDexFunction(tx.input);

        if (functionInfo) {
          logger.info(
            `Transaction ${tx.hash} contains DEX function ${functionInfo.name} but is not to a known router: ${tx.to}`
          );
        }
      }
    } catch (error) {
      logger.error(`Error processing transaction ${tx.hash}: ${error}`);
    }
  }

  /**
   * Log detailed transaction information for debugging
   * @param tx Transaction to log
   */
  private logTransactionDetails(tx: Transaction): void {
    logger.debug(`Transaction ${tx.hash} details:`);
    logger.debug(`  From: ${tx.from}`);
    logger.debug(`  To: ${tx.to}`);
    logger.debug(`  Value: ${tx.value}`);
    logger.debug(`  Gas: ${tx.gas}`);
    logger.debug(`  Gas Price: ${tx.gasPrice}`);
    logger.debug(`  Nonce: ${tx.nonce}`);
    logger.debug(`  Input data length: ${tx.input ? tx.input.length : 0}`);

    // Log the first 10 bytes (function signature) if available
    if (tx.input && tx.input.length >= 10) {
      logger.debug(`  Function signature: ${tx.input.slice(0, 10)}`);
    }
  }

  /**
   * Extract parameters from an exactInputSingle function call
   * @param input Transaction input data
   */
  private extractExactInputSingleParameters(input: string): void {
    try {
      // Extract parameters from input data
      const tokenInHex = `0x${input.slice(34, 74)}`;
      const tokenOutHex = `0x${input.slice(98, 138)}`;
      const feeHex = `0x${input.slice(138, 202)}`;
      const amountInHex = `0x${input.slice(330, 394)}`;

      const tokenIn = tokenInHex;
      const tokenOut = tokenOutHex;
      const fee = Number(BigInt(feeHex));
      const amountIn = BigInt(amountInHex);

      logger.debug(`  TokenIn: ${tokenIn}`);
      logger.debug(`  TokenOut: ${tokenOut}`);
      logger.debug(`  Fee: ${fee}`);
      logger.debug(`  AmountIn: ${amountIn}`);
    } catch (error) {
      logger.error(`Error extracting exactInputSingle parameters: ${error}`);
    }
  }

  /**
   * Extract parameters from an exactInput function call
   * @param input Transaction input data
   */
  private extractExactInputParameters(input: string): void {
    try {
      // Extract the path offset, which is the first parameter
      const pathOffsetHex = `0x${input.slice(10, 74)}`;
      const pathOffset = Number(BigInt(pathOffsetHex));

      // Extract the amountIn, which is the fourth parameter
      const amountInHex = `0x${input.slice(202, 266)}`;
      const amountIn = BigInt(amountInHex);

      // The path starts at the offset
      const pathLengthOffset = 10 + pathOffset * 2;
      const pathLengthHex = `0x${input.slice(pathLengthOffset, pathLengthOffset + 64)}`;
      const pathLength = Number(BigInt(pathLengthHex));

      logger.debug(`  Path length: ${pathLength}`);
      logger.debug(`  AmountIn: ${amountIn}`);
    } catch (error) {
      logger.error(`Error extracting exactInput parameters: ${error}`);
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
  private formatOpportunityMessage(opportunity: ArbitrageOpportunity, txHash: string): string {
    // Format the profit in ETH
    const profitEth = Number(opportunity.expectedProfit) / 1e18;

    // Format the input amount in ETH
    const inputEth = Number(opportunity.inputAmount) / 1e18;

    // Format the gas estimate in ETH
    const gasEth = Number(opportunity.gasEstimate) / 1e18;

    // Format the protocols
    const protocols = opportunity.protocols.join(' -> ');

    // Format the message
    return `🚨 Arbitrage Opportunity 🚨\n\nTransaction: ${txHash}\nProfit: ${profitEth.toFixed(6)} ETH\nInput: ${inputEth.toFixed(6)} ETH\nGas: ${gasEth.toFixed(6)} ETH\nPath: ${protocols}\nStart Token: ${opportunity.startToken}`;
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
        const message = `🚀 Executing Arbitrage 🚀\n\nTrigger Transaction: ${triggerTxHash}\nExpected Profit: ${(Number(opportunity.expectedProfit) / 1e18).toFixed(6)} ETH\nPath: ${opportunity.protocols.join(' -> ')}`;

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
        const message = `❌ Arbitrage Execution Failed ❌\n\nTrigger Transaction: ${triggerTxHash}\nError: ${error}`;

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
