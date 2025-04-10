/**
 * Telegram executor for sending notifications
 * Uses the unified TelegramClient from utils/telegram.ts
 */
import { Executor } from '../types';
import { TelegramClient, TelegramMessage, TelegramConfig } from '../utils/telegram';
import { logger } from '../utils/logger';

/**
 * Executor for sending messages to Telegram
 */
export class TelegramExecutor implements Executor<TelegramMessage> {
  private client: TelegramClient;

  /**
   * Create a new TelegramExecutor
   * @param config The Telegram configuration
   */
  constructor(config: TelegramConfig) {
    this.client = new TelegramClient(config);
  }

  name(): string {
    return 'TelegramExecutor';
  }

  /**
   * Execute a message by sending it to Telegram
   * @param message The message to send
   */
  async execute(message: TelegramMessage): Promise<void> {
    try {
      await this.client.sendMessage(message);
    } catch (error) {
      logger.error(`Failed to send Telegram message: ${error}`);
      throw error;
    }
  }
}
