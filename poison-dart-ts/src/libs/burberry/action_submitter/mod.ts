/**
 * Action submitter module
 * Ported from Rust crate burberry/src/action_submitter/mod.rs
 */

import { ActionSubmitter } from '../types';
import { BroadcastChannel } from '../utils/broadcast_channel';
import { logger } from '../utils/logger';

// Export components from separate files
export { ActionSubmitterMap } from './map';
export { ActionPrinter } from './printer';
export { TelegramSubmitter, TelegramMessageDispatcher, escape } from './telegram';

/**
 * ActionChannelSubmitter - submits actions to a broadcast channel
 */
export class ActionChannelSubmitter<A> implements ActionSubmitter<A> {
  private channel: BroadcastChannel<A>;

  /**
   * Create a new ActionChannelSubmitter
   * @param channel The broadcast channel to submit actions to
   */
  constructor(channel: BroadcastChannel<A>) {
    this.channel = channel;
  }

  /**
   * Submit an action to the channel
   * @param action The action to submit
   */
  submit(action: A): void {
    try {
      this.channel.send(action);
    } catch (e) {
      logger.error(`Error submitting action: ${e}`);
    }
  }
}
