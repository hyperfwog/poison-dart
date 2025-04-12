/**
 * Trade simulator for calculating expected profits
 */
import type { Address, PublicClient, WalletClient } from 'viem';
import { Logger } from '../../libs/logger';
import { type Path, Trader } from '../defi/mod';
import type { TradeSimulationResult } from './types';

// Create a logger instance for the trade simulator
const logger = Logger.forContext('Simulator');

/**
 * Class for simulating trades to calculate expected profits
 */
export class TradeSimulator {
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private trader: Trader;

  constructor(publicClient: PublicClient, walletClient: WalletClient) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.trader = new Trader(publicClient, walletClient);
  }

  /**
   * Simulate a trade to calculate expected profit
   * @param path Path to simulate
   * @param amountIn Input amount
   * @param sender Sender address
   * @param gasPrice Gas price in wei
   * @param slippage Slippage percentage (e.g., 0.5 for 0.5%)
   * @returns Trade simulation result
   */
  async simulateTrade(
    path: Path,
    amountIn: bigint,
    sender: Address,
    gasPrice: bigint,
    slippage = 0.5
  ): Promise<TradeSimulationResult> {
    // Skip if path is empty
    if (path.isEmpty()) {
      return {
        amountOut: BigInt(0),
        gasCost: BigInt(0),
        profit: BigInt(0),
      };
    }

    // Create trade context
    const tradeContext = {
      sender,
      amountIn,
      path,
      slippage,
      gasPrice,
    };

    try {
      // Simulate the trade
      const result = await this.trader.simulateTrade(tradeContext);

      // Calculate profit
      const profit =
        result.amountOut > amountIn ? result.amountOut - amountIn - result.gasCost : BigInt(0);

      return {
        amountOut: result.amountOut,
        gasCost: result.gasCost,
        profit,
      };
    } catch (error) {
      logger.error('Error simulating trade:', error);
      return {
        amountOut: BigInt(0),
        gasCost: BigInt(0),
        profit: BigInt(0),
      };
    }
  }

  /**
   * Find the optimal input amount for maximum profit
   * @param path Path to optimize
   * @param minAmount Minimum input amount
   * @param maxAmount Maximum input amount
   * @param steps Number of steps to try
   * @param sender Sender address
   * @param gasPrice Gas price in wei
   * @returns Best trade simulation result and input amount
   */
  async findOptimalInputAmount(
    path: Path,
    minAmount: bigint,
    maxAmount: bigint,
    steps: number,
    sender: Address,
    gasPrice: bigint
  ): Promise<{ result: TradeSimulationResult; inputAmount: bigint }> {
    // Skip if path is empty
    if (path.isEmpty()) {
      return {
        result: {
          amountOut: BigInt(0),
          gasCost: BigInt(0),
          profit: BigInt(0),
        },
        inputAmount: BigInt(0),
      };
    }

    // Calculate step size
    const stepSize = (maxAmount - minAmount) / BigInt(steps);

    // Try different input amounts
    const results: { result: TradeSimulationResult; inputAmount: bigint }[] = [];

    for (let i = 0; i <= steps; i++) {
      const inputAmount = minAmount + stepSize * BigInt(i);
      const result = await this.simulateTrade(path, inputAmount, sender, gasPrice);

      results.push({
        result,
        inputAmount,
      });
    }

    // Find the best result
    let bestResult = results[0];

    for (let i = 1; i < results.length; i++) {
      if (results[i].result.profit > bestResult.result.profit) {
        bestResult = results[i];
      }
    }

    return bestResult;
  }

  /**
   * Use golden section search to find the optimal input amount for maximum profit
   * @param path Path to optimize
   * @param minAmount Minimum input amount
   * @param maxAmount Maximum input amount
   * @param tolerance Tolerance for convergence
   * @param sender Sender address
   * @param gasPrice Gas price in wei
   * @returns Best trade simulation result and input amount
   */
  async goldenSectionSearch(
    path: Path,
    minAmount: bigint,
    maxAmount: bigint,
    tolerance: bigint,
    sender: Address,
    gasPrice: bigint
  ): Promise<{ result: TradeSimulationResult; inputAmount: bigint }> {
    // Skip if path is empty
    if (path.isEmpty()) {
      return {
        result: {
          amountOut: BigInt(0),
          gasCost: BigInt(0),
          profit: BigInt(0),
        },
        inputAmount: BigInt(0),
      };
    }

    // Golden ratio
    const _phi = BigInt(1618033988749895) / BigInt(1000000000000000);

    // Calculate initial points
    let a = minAmount;
    let b = maxAmount;
    let c = b - ((b - a) * BigInt(1000000000000000)) / BigInt(1618033988749895);
    let d = a + ((b - a) * BigInt(1000000000000000)) / BigInt(1618033988749895);

    // Evaluate function at c and d
    const fc = await this.simulateTrade(path, c, sender, gasPrice);
    const fd = await this.simulateTrade(path, d, sender, gasPrice);

    // Iterate until convergence
    while (b - a > tolerance) {
      if (fc.profit > fd.profit) {
        b = d;
        d = c;
        c = b - ((b - a) * BigInt(1000000000000000)) / BigInt(1618033988749895);

        // Re-use fd for the new d
        const _fdOld = fd;
        fd.profit = fc.profit;
        fd.amountOut = fc.amountOut;
        fd.gasCost = fc.gasCost;

        // Evaluate function at c
        const fcNew = await this.simulateTrade(path, c, sender, gasPrice);
        fc.profit = fcNew.profit;
        fc.amountOut = fcNew.amountOut;
        fc.gasCost = fcNew.gasCost;
      } else {
        a = c;
        c = d;
        d = a + ((b - a) * BigInt(1000000000000000)) / BigInt(1618033988749895);

        // Re-use fc for the new c
        const _fcOld = fc;
        fc.profit = fd.profit;
        fc.amountOut = fd.amountOut;
        fc.gasCost = fd.gasCost;

        // Evaluate function at d
        const fdNew = await this.simulateTrade(path, d, sender, gasPrice);
        fd.profit = fdNew.profit;
        fd.amountOut = fdNew.amountOut;
        fd.gasCost = fdNew.gasCost;
      }
    }

    // Return the best result
    if (fc.profit > fd.profit) {
      return {
        result: fc,
        inputAmount: c,
      };
    }
    return {
      result: fd,
      inputAmount: d,
    };
  }
}
