/**
 * Action printer
 * Ported from Rust crate burberry/src/action_submitter/printer.rs
 */

import { ActionSubmitter } from '../types';
import { logger } from '../utils/logger';

/**
 * ActionPrinter - prints actions to the console
 */
export class ActionPrinter<A> implements ActionSubmitter<A> {
  /**
   * Create a new ActionPrinter
   */
  constructor() {}

  /**
   * Submit an action by printing it to the console
   * @param action The action to submit
   */
  submit(action: A): void {
    logger.info(`Action: ${JSON.stringify(action)}`);
  }
}
