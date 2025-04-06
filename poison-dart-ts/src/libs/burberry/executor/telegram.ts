/**
 * Telegram executor for sending notifications
 */
import { Executor } from '../types.js';

/**
 * Message to be sent to Telegram
 */
export interface Message {
  text: string;
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disable_web_page_preview?: boolean;
  disable_notification?: boolean;
}

/**
 * Configuration for the Telegram executor
 */
export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

/**
 * Executor for sending messages to Telegram
 */
export class TelegramExecutor<T extends Message> implements Executor<T> {
  private config: TelegramConfig;

  constructor(config: TelegramConfig) {
    this.config = config;
  }

  name(): string {
    return 'TelegramExecutor';
  }

  async execute(action: T): Promise<void> {
    const url = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`;
    
    const body = JSON.stringify({
      chat_id: this.config.chatId,
      text: action.text,
      parse_mode: action.parse_mode,
      disable_web_page_preview: action.disable_web_page_preview,
      disable_notification: action.disable_notification,
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Telegram API error: ${JSON.stringify(errorData)}`);
      }
    } catch (error) {
      console.error('Failed to send Telegram message:', error);
      throw error;
    }
  }
}
