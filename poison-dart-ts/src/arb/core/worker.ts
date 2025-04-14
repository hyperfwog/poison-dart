/**
 * Worker for parallel opportunity evaluation
 */
import type { Address, PublicClient, WalletClient } from 'viem';
import { Logger } from '../../libs/logger';
import type { ArbitrageOpportunity } from './types';
import { TradeSimulator } from './simulator';

// Create a logger instance for the worker
const logger = Logger.forContext('Worker');

/**
 * Class for evaluating arbitrage opportunities in parallel
 */
export class Worker {
  private id: number;
  private idle: boolean = true;
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private simulator: TradeSimulator;
  private onComplete: (result: { opportunity: ArbitrageOpportunity; profit: bigint }) => void;

  constructor(
    id: number,
    publicClient: PublicClient,
    walletClient: WalletClient,
    onComplete: (result: { opportunity: ArbitrageOpportunity; profit: bigint }) => void
  ) {
    this.id = id;
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.simulator = new TradeSimulator(publicClient, walletClient);
    this.onComplete = onComplete;
  }

  /**
   * Check if the worker is idle
   * @returns Whether the worker is idle
   */
  isIdle(): boolean {
    return this.idle;
  }

  /**
   * Process an arbitrage opportunity
   * @param opportunity Opportunity to process
   */
  async processOpportunity(opportunity: ArbitrageOpportunity): Promise<void> {
    this.idle = false;
    logger.info(`Worker ${this.id} processing opportunity with expected profit ${opportunity.expectedProfit}`);

    try {
      // Get sender address
      const sender = this.walletClient.account?.address as Address;
      if (!sender) {
        throw new Error('No sender address available');
      }

      // Get gas price
      const gasPrice = await this.publicClient.getGasPrice();

      // Optimize input amount if needed
      if (opportunity.inputAmount === BigInt(0)) {
        // Use grid search to find optimal input amount
        const minAmount = BigInt('1000000000000000'); // 0.001 token
        const maxAmount = BigInt('1000000000000000000'); // 1 token
        const steps = 10;

        logger.info(`Worker ${this.id} performing grid search for optimal input amount`);
        const gridResult = await this.simulator.gridSearch(
          opportunity.path,
          minAmount,
          maxAmount,
          steps,
          sender,
          gasPrice
        );

        // If grid search found a profitable amount, use golden section search to refine
        if (gridResult.result.profit > BigInt(0)) {
          logger.info(`Worker ${this.id} performing golden section search to refine input amount`);
          const goldenResult = await this.simulator.goldenSectionSearch(
            opportunity.path,
            gridResult.inputAmount / BigInt(2),
            gridResult.inputAmount * BigInt(2),
            BigInt('1000000000000000'), // 0.001 token tolerance
            sender,
            gasPrice
          );

          // Update opportunity with optimal input amount
          opportunity.inputAmount = goldenResult.inputAmount;
          opportunity.expectedProfit = goldenResult.result.profit;
        } else {
          // No profitable amount found
          logger.info(`Worker ${this.id} found no profitable input amount`);
          this.idle = true;
          return;
        }
      } else {
        // Simulate with the provided input amount
        logger.info(`Worker ${this.id} simulating with provided input amount ${opportunity.inputAmount}`);
        const result = await this.simulator.simulateTrade(
          opportunity.path,
          opportunity.inputAmount,
          sender,
          gasPrice
        );

        // Update expected profit
        opportunity.expectedProfit = result.profit;
      }

      // Check if opportunity is profitable
      if (opportunity.expectedProfit <= BigInt(0)) {
        logger.info(`Worker ${this.id} found opportunity is not profitable`);
        this.idle = true;
        return;
      }

      // Complete the opportunity
      logger.info(`Worker ${this.id} completed opportunity with profit ${opportunity.expectedProfit}`);
      this.onComplete({
        opportunity,
        profit: opportunity.expectedProfit,
      });
    } catch (error) {
      logger.error(`Worker ${this.id} error:`, error);
    } finally {
      this.idle = true;
    }
  }

  /**
   * Start the worker
   */
  start(): void {
    logger.info(`Worker ${this.id} started`);
    this.idle = true;
  }

  /**
   * Stop the worker
   */
  stop(): void {
    logger.info(`Worker ${this.id} stopped`);
    this.idle = false;
  }
}

/**
 * Class for managing a pool of workers
 */
export class WorkerPool {
  private workers: Worker[] = [];
  private queue: ArbitrageOpportunity[] = [];
  private running: boolean = false;
  private onComplete: (result: { opportunity: ArbitrageOpportunity; profit: bigint }) => void;

  constructor(
    numWorkers: number,
    publicClient: PublicClient,
    walletClient: WalletClient,
    onComplete: (result: { opportunity: ArbitrageOpportunity; profit: bigint }) => void
  ) {
    this.onComplete = onComplete;

    // Create workers
    for (let i = 0; i < numWorkers; i++) {
      this.workers.push(new Worker(i, publicClient, walletClient, this.handleWorkerComplete.bind(this)));
    }
  }

  /**
   * Handle worker completion
   * @param result Worker result
   */
  private handleWorkerComplete(result: { opportunity: ArbitrageOpportunity; profit: bigint }): void {
    // Call the onComplete callback
    this.onComplete(result);

    // Process the next opportunity in the queue
    this.processQueue();
  }

  /**
   * Start the worker pool
   */
  start(): void {
    this.running = true;
    for (const worker of this.workers) {
      worker.start();
    }
    logger.info(`Worker pool started with ${this.workers.length} workers`);
  }

  /**
   * Stop the worker pool
   */
  stop(): void {
    this.running = false;
    for (const worker of this.workers) {
      worker.stop();
    }
    logger.info('Worker pool stopped');
  }

  /**
   * Add an opportunity to the queue
   * @param opportunity Opportunity to add
   */
  addOpportunity(opportunity: ArbitrageOpportunity): void {
    this.queue.push(opportunity);
    logger.debug(`Added opportunity to queue, queue size: ${this.queue.length}`);
    this.processQueue();
  }

  /**
   * Process the queue
   */
  private processQueue(): void {
    if (!this.running) return;

    // Find idle workers
    const idleWorkers = this.workers.filter(w => w.isIdle());
    logger.debug(`Processing queue, ${idleWorkers.length} idle workers, ${this.queue.length} opportunities in queue`);

    // Assign opportunities to idle workers
    while (idleWorkers.length > 0 && this.queue.length > 0) {
      const worker = idleWorkers.pop()!;
      const opportunity = this.queue.shift()!;
      worker.processOpportunity(opportunity);
    }
  }

  /**
   * Get the number of opportunities in the queue
   * @returns Number of opportunities in the queue
   */
  queueSize(): number {
    return this.queue.length;
  }

  /**
   * Get the number of workers
   * @returns Number of workers
   */
  workerCount(): number {
    return this.workers.length;
  }

  /**
   * Get the number of idle workers
   * @returns Number of idle workers
   */
  idleWorkerCount(): number {
    return this.workers.filter(w => w.isIdle()).length;
  }
}
