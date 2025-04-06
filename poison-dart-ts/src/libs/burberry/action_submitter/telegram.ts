/**
 * Telegram action submitter
 * Ported from Rust crate burberry/src/action_submitter/telegram.rs
 */

import { ActionSubmitter } from '../types.js';
import { logger } from '../utils/logger.js';

/**
 * Message to be sent to Telegram
 */
export interface Message {
  botToken: string;
  chatId: string;
  threadId?: string;
  text: string;
  disableNotification?: boolean;
  protectContent?: boolean;
  disableLinkPreview?: boolean;
  parseMode?: string;
}

/**
 * TelegramMessageDispatcher - sends messages to Telegram
 */
export class TelegramMessageDispatcher {
  private errorReportBotToken?: string;
  private errorReportChatId?: string;
  private errorReportThreadId?: string;

  /**
   * Create a new TelegramMessageDispatcher
   * @param errorReportBotToken Bot token for error reporting
   * @param errorReportChatId Chat ID for error reporting
   * @param errorReportThreadId Thread ID for error reporting
   */
  constructor(
    errorReportBotToken?: string,
    errorReportChatId?: string,
    errorReportThreadId?: string
  ) {
    this.errorReportBotToken = errorReportBotToken;
    this.errorReportChatId = errorReportChatId;
    this.errorReportThreadId = errorReportThreadId;
  }

  /**
   * Get the URL for sending a message
   * @param botToken The bot token
   * @returns The URL
   */
  private getUrl(botToken: string): string {
    return `https://api.telegram.org/bot${botToken}/sendMessage`;
  }

  /**
   * Send a message to Telegram
   * @param message The message to send
   */
  async sendMessage(message: Message): Promise<void> {
    const url = this.getUrl(message.botToken);

    const data: Record<string, any> = {
      chat_id: message.chatId,
      text: message.text,
      parse_mode: message.parseMode || 'MarkdownV2',
    };

    if (message.threadId) {
      data.message_thread_id = message.threadId;
    }

    if (message.disableNotification !== undefined) {
      data.disable_notification = message.disableNotification;
    }

    if (message.protectContent !== undefined) {
      data.protect_content = message.protectContent;
    }

    if (message.disableLinkPreview !== undefined) {
      data.link_preview_options = {
        is_disabled: message.disableLinkPreview,
      };
    }

    logger.debug(`Sending message to Telegram: ${JSON.stringify(data)}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Response status: ${response.status}, body: ${body}`);
      }

      const responseData = await response.json();
      logger.debug(`Response: ${JSON.stringify(responseData)}`);
    } catch (e) {
      logger.error(`Failed to send message to Telegram: ${e}`);
      await this.reportError(message, `${e}`);
    }
  }

  /**
   * Report an error to Telegram
   * @param originalMessage The original message
   * @param errorMessage The error message
   */
  async reportError(originalMessage: Message, errorMessage: string): Promise<void> {
    if (!this.errorReportBotToken) {
      logger.warn('Telegram message fails to send but error reporting is disabled');
      return;
    }

    const url = this.getUrl(this.errorReportBotToken);

    const data: Record<string, any> = {
      chat_id: this.errorReportChatId,
      link_preview_options: {
        is_disabled: true,
      },
      text: `❌ Fail to send message\n\nOriginal message: ${JSON.stringify(originalMessage.text)}\nError: ${errorMessage}`,
    };

    if (this.errorReportThreadId) {
      data.message_thread_id = this.errorReportThreadId;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const body = await response.text();
        logger.error(`Failed to send error report to Telegram: Response status: ${response.status}, body: ${body}`);
      }
    } catch (e) {
      logger.error(`Failed to send error report to Telegram: ${e}`);
    }
  }

  /**
   * Execute a message
   * @param action The message to execute
   */
  async execute(action: Message): Promise<void> {
    logger.debug(`Received message: ${JSON.stringify(action)}`);
    await this.sendMessage(action);
  }
}

/**
 * TelegramSubmitter - submits messages to Telegram
 */
export class TelegramSubmitter implements ActionSubmitter<Message> {
  private executor: TelegramMessageDispatcher;
  private redirectTo?: {
    botToken: string;
    chatId: string;
    threadId?: string;
  };

  /**
   * Create a new TelegramSubmitter with redirection
   * @param botToken The bot token to redirect to
   * @param chatId The chat ID to redirect to
   * @param threadId The thread ID to redirect to
   */
  static newWithRedirect(botToken: string, chatId: string, threadId?: string): TelegramSubmitter {
    const submitter = new TelegramSubmitter();
    submitter.redirectTo = { botToken, chatId, threadId };
    return submitter;
  }

  /**
   * Create a new TelegramSubmitter
   */
  constructor() {
    this.executor = new TelegramMessageDispatcher();
  }

  /**
   * Submit a message to Telegram
   * @param action The message to submit
   */
  submit(action: Message): void {
    let finalAction = action;

    if (this.redirectTo) {
      finalAction = {
        ...action,
        botToken: this.redirectTo.botToken,
        chatId: this.redirectTo.chatId,
        threadId: this.redirectTo.threadId,
      };
    }

    // In TypeScript, we'll use a Promise instead of spawning a thread
    this.sendMessage(finalAction).catch(e => {
      logger.error(`Error sending message: ${e}`);
    });
  }

  /**
   * Send a message to Telegram
   * @param action The message to send
   */
  private async sendMessage(action: Message): Promise<void> {
    await this.executor.sendMessage(action);
  }
}

/**
 * Escape special characters in a string for Telegram MarkdownV2
 * @param raw The raw string
 * @returns The escaped string
 */
export function escape(raw: string): string {
  const escapedCharacters = '\\*_[]~`>#-|{}.!+()=';
  return raw
    .split('')
    .map(c => (escapedCharacters.includes(c) ? `\\${c}` : c))
    .join('');
}
