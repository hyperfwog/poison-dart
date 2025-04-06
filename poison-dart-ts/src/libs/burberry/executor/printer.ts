/**
 * Printer executor
 * An executor that prints actions to the console
 */

import { Executor } from '../types.js';
import { logger } from '../utils/logger.js';

/**
 * PrinterExecutor - prints actions to the console
 */
export class PrinterExecutor<A> implements Executor<A> {
  name(): string {
    return "PrinterExecutor";
  }

  async execute(action: A): Promise<void> {
    logger.info(`Action: ${JSON.stringify(action)}`);
    return Promise.resolve();
  }
}
