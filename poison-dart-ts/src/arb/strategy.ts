import type { ActionSubmitter, Strategy } from 'frogberry';
/**
 * Arbitrage strategy implementation
 */
import type { Address, Block, Log, PublicClient, Transaction, WalletClient } from 'viem';
import { Logger } from '../libs/logger';
import type { ArbConfig } from './config';
import { type Dex, Path } from './defi';
import { HyperSwapV2Dex, HyperSwapV3Dex, KittenSwapDex, ShadowDex, SwapXDex } from './defi';
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
  private knownDexes: Map<string, Dex> = new Map();

  constructor(publicClient: PublicClient, walletClient: WalletClient, config: ArbConfig) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.config = config;
  }

  name(): string {
    return 'ArbStrategy';
  }

  async processEvent(event: Event, submitter: ActionSubmitter<Action>): Promise<void> {
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
   * Process a new block
   * @param block The new block
   * @param submitter The action submitter
   */
  private async processBlock(block: Block, submitter: ActionSubmitter<Action>): Promise<void> {
    logger.info(`Processing block ${block.number}`);

    // In a real implementation, we would scan for arbitrage opportunities here
    // For this example, we'll just send a notification
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

    // In a real implementation, we would look for swap events and update our price models
    // For this example, we'll just send a notification for USDC transfers
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
   * @param tx The new transaction
   * @param submitter The action submitter
   */
  private async processTransaction(
    tx: Transaction,
    _submitter: ActionSubmitter<Action>
  ): Promise<void> {
    logger.info(`Processing transaction ${tx.hash}`);

    // In a real implementation, we would look for pending swaps and try to front-run them
    // For now, we'll just log the transaction hash
    // We've disabled high-value transaction notifications as requested
  }

  /**
   * Find DEXes that support trading between the given token types
   * @param tokenInType The token type to trade from
   * @param tokenOutType The token type to trade to
   * @returns A list of DEXes
   */
  private async findDexes(tokenInType: string, tokenOutType: string): Promise<Dex[]> {
    const dexes: Dex[] = [];

    // Check if we already know about DEXes for this pair
    const key = `${tokenInType}-${tokenOutType}`;
    if (this.knownDexes.has(key)) {
      return [this.knownDexes.get(key)!];
    }

    // Check if we're on HyperEVM chain
    const isHyperEVM = this.config.chainId === 999;

    // In a real implementation, we would query the DEX factories to find pools
    // For this example, we'll just return a hardcoded list
    if (!isHyperEVM) {
      // Sonic chain DEXes
      try {
        // Try to find a Shadow DEX pool
        const shadowPool = await ShadowDex.findPool(
          this.publicClient,
          tokenInType as Address,
          tokenOutType as Address,
          3000 // 0.3% fee
        );

        const shadowDex = new ShadowDex(
          {
            protocol: Protocol.Shadow,
            address: shadowPool,
            tokens: [
              { address: tokenInType, symbol: 'TOKEN_A', decimals: 18 },
              { address: tokenOutType, symbol: 'TOKEN_B', decimals: 18 },
            ],
            fee: 3000,
          },
          this.publicClient,
          this.walletClient
        );

        dexes.push(shadowDex);
        this.knownDexes.set(key, shadowDex);
      } catch (_error) {
        logger.debug(`No Shadow DEX pool found for ${tokenInType}-${tokenOutType}`);
      }

      try {
        // Try to find a SwapX DEX pool
        const swapXPool = await SwapXDex.findPool(
          this.publicClient,
          tokenInType as Address,
          tokenOutType as Address
        );

        const swapXDex = new SwapXDex(
          {
            protocol: Protocol.SwapX,
            address: swapXPool,
            tokens: [
              { address: tokenInType, symbol: 'TOKEN_A', decimals: 18 },
              { address: tokenOutType, symbol: 'TOKEN_B', decimals: 18 },
            ],
          },
          this.publicClient,
          this.walletClient
        );

        dexes.push(swapXDex);
        this.knownDexes.set(key, swapXDex);
      } catch (_error) {
        logger.debug(`No SwapX DEX pool found for ${tokenInType}-${tokenOutType}`);
      }
    } else {
      // HyperEVM chain DEXes
      try {
        // Try to find a KittenSwap volatile pool
        const kittenSwapPool = await KittenSwapDex.findPool(
          this.publicClient,
          tokenInType as Address,
          tokenOutType as Address,
          false // volatile pool
        );

        const kittenSwapDex = new KittenSwapDex(
          {
            protocol: Protocol.KittenSwap,
            address: kittenSwapPool,
            tokens: [
              { address: tokenInType, symbol: 'TOKEN_A', decimals: 18 },
              { address: tokenOutType, symbol: 'TOKEN_B', decimals: 18 },
            ],
          },
          this.publicClient,
          this.walletClient
        );

        dexes.push(kittenSwapDex);
        this.knownDexes.set(key, kittenSwapDex);
      } catch (_error) {
        logger.debug(`No KittenSwap volatile pool found for ${tokenInType}-${tokenOutType}`);
      }

      try {
        // Try to find a KittenSwap stable pool
        const kittenSwapStablePool = await KittenSwapDex.findPool(
          this.publicClient,
          tokenInType as Address,
          tokenOutType as Address,
          true // stable pool
        );

        const kittenSwapStableDex = new KittenSwapDex(
          {
            protocol: Protocol.KittenSwapStable,
            address: kittenSwapStablePool,
            tokens: [
              { address: tokenInType, symbol: 'TOKEN_A', decimals: 18 },
              { address: tokenOutType, symbol: 'TOKEN_B', decimals: 18 },
            ],
          },
          this.publicClient,
          this.walletClient
        );

        dexes.push(kittenSwapStableDex);
        this.knownDexes.set(`${key}-stable`, kittenSwapStableDex);
      } catch (_error) {
        logger.debug(`No KittenSwap stable pool found for ${tokenInType}-${tokenOutType}`);
      }

      // Try to find HyperSwap V2 pool
      try {
        const hyperSwapV2Pool = await HyperSwapV2Dex.findPool(
          this.publicClient,
          tokenInType as Address,
          tokenOutType as Address
        );

        const hyperSwapV2Dex = new HyperSwapV2Dex(
          {
            protocol: Protocol.HyperSwapV2,
            address: hyperSwapV2Pool,
            tokens: [
              { address: tokenInType, symbol: 'TOKEN_A', decimals: 18 },
              { address: tokenOutType, symbol: 'TOKEN_B', decimals: 18 },
            ],
          },
          this.publicClient,
          this.walletClient
        );

        dexes.push(hyperSwapV2Dex);
        this.knownDexes.set(`${key}-hyperv2`, hyperSwapV2Dex);
      } catch (_error) {
        logger.debug(`No HyperSwap V2 pool found for ${tokenInType}-${tokenOutType}`);
      }

      // Try to find HyperSwap V3 pools with different fee tiers
      const feeTiers = [500, 3000, 10000]; // 0.05%, 0.3%, 1%
      for (const fee of feeTiers) {
        try {
          const hyperSwapV3Pool = await HyperSwapV3Dex.findPool(
            this.publicClient,
            tokenInType as Address,
            tokenOutType as Address,
            fee
          );

          const hyperSwapV3Dex = new HyperSwapV3Dex(
            {
              protocol: Protocol.HyperSwapV3,
              address: hyperSwapV3Pool,
              tokens: [
                { address: tokenInType, symbol: 'TOKEN_A', decimals: 18 },
                { address: tokenOutType, symbol: 'TOKEN_B', decimals: 18 },
              ],
              fee,
            },
            this.publicClient,
            this.walletClient
          );

          dexes.push(hyperSwapV3Dex);
          this.knownDexes.set(`${key}-hyperv3-${fee}`, hyperSwapV3Dex);
        } catch (_error) {
          logger.debug(
            `No HyperSwap V3 pool found for ${tokenInType}-${tokenOutType} with fee ${fee}`
          );
        }
      }
    }

    return dexes;
  }

  /**
   * Find a test path for the given tokens
   * @param path The list of token addresses to test
   * @returns A path object
   */
  private async findTestPath(path: Address[]): Promise<Path> {
    if (path.length < 2) {
      return new Path();
    }

    const dexes: Dex[] = [];

    // Find DEXes for each pair in the path
    for (let i = 0; i < path.length - 1; i++) {
      const tokenIn = path[i];
      const tokenOut = path[i + 1];

      const dexesForPair = await this.findDexes(tokenIn, tokenOut);
      if (dexesForPair.length === 0) {
        return new Path();
      }

      dexes.push(dexesForPair[0]);
    }

    return new Path(dexes);
  }
}
