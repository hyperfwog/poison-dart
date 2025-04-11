/**
 * Colorful Logger Utility
 *
 * A utility class for colorful console logging with different log levels
 * and timestamp support.
 */

/**
 * Log levels with corresponding colors
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS',
}

/**
 * ANSI color codes for terminal output
 */
const Colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',

  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
};

/**
 * Logger configuration options
 */
export interface LoggerOptions {
  /** Minimum log level to display */
  minLevel?: LogLevel;
  /** Whether to include timestamps in logs */
  showTimestamp?: boolean;
  /** Whether to show log level in logs */
  showLevel?: boolean;
  /** Whether to use colors in logs */
  useColors?: boolean;
  /** Optional context to include in all logs */
  context?: string;
}

/**
 * Default logger options
 */
const DEFAULT_OPTIONS: LoggerOptions = {
  minLevel: LogLevel.DEBUG,
  showTimestamp: true,
  showLevel: true,
  useColors: true,
  context: undefined,
};

/**
 * Colorful Logger class
 */
export class Logger {
  private options: LoggerOptions;

  /**
   * Create a new Logger instance
   * @param options Logger configuration options
   */
  constructor(options: LoggerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Create a new Logger instance with a specific context
   * @param context The context name
   * @param options Additional logger options
   * @returns A new Logger instance with the specified context
   */
  static forContext(context: string, options: LoggerOptions = {}): Logger {
    return new Logger({ ...options, context });
  }

  /**
   * Log a debug message
   * @param message The message to log
   * @param args Additional arguments to log
   */
  debug(message: string, ...args: unknown[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }

  /**
   * Log an info message
   * @param message The message to log
   * @param args Additional arguments to log
   */
  info(message: string, ...args: unknown[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }

  /**
   * Log a warning message
   * @param message The message to log
   * @param args Additional arguments to log
   */
  warn(message: string, ...args: unknown[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }

  /**
   * Log an error message
   * @param message The message to log
   * @param args Additional arguments to log
   */
  error(message: string, ...args: unknown[]): void {
    this.log(LogLevel.ERROR, message, ...args);
  }

  /**
   * Log a success message
   * @param message The message to log
   * @param args Additional arguments to log
   */
  success(message: string, ...args: unknown[]): void {
    this.log(LogLevel.SUCCESS, message, ...args);
  }

  /**
   * Log a message with the specified level
   * @param level The log level
   * @param message The message to log
   * @param args Additional arguments to log
   */
  log(level: LogLevel, message: string, ...args: unknown[]): void {
    // Skip if below minimum log level
    if (this.shouldSkip(level)) {
      return;
    }

    const { useColors, showTimestamp, showLevel, context } = this.options;

    // Build the log prefix
    let prefix = '';

    // Add timestamp if enabled
    if (showTimestamp) {
      const timestamp = new Date().toISOString();
      prefix += useColors ? `${Colors.gray}${timestamp}${Colors.reset} ` : `${timestamp} `;
    }

    // Add log level if enabled
    if (showLevel) {
      const levelColor = this.getLevelColor(level);
      const levelStr = level.padEnd(7); // Pad to align levels
      prefix += useColors ? `${levelColor}${levelStr}${Colors.reset} ` : `${levelStr} `;
    }

    // Add context if provided
    if (context) {
      prefix += useColors ? `${Colors.cyan}[${context}]${Colors.reset} ` : `[${context}] `;
    }

    // Log the message with the prefix
    if (args.length > 0) {
      console.info(`${prefix}${message}`, ...args);
    } else {
      console.info(`${prefix}${message}`);
    }
  }

  /**
   * Check if a log message should be skipped based on its level
   * @param level The log level to check
   * @returns Whether the log should be skipped
   */
  private shouldSkip(level: LogLevel): boolean {
    const levels = Object.values(LogLevel);
    const minLevelIndex = levels.indexOf(this.options.minLevel || LogLevel.DEBUG);
    const currentLevelIndex = levels.indexOf(level);
    return currentLevelIndex < minLevelIndex;
  }

  /**
   * Get the color for a log level
   * @param level The log level
   * @returns The ANSI color code for the level
   */
  private getLevelColor(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return Colors.gray;
      case LogLevel.INFO:
        return Colors.blue;
      case LogLevel.WARN:
        return Colors.yellow;
      case LogLevel.ERROR:
        return Colors.red;
      case LogLevel.SUCCESS:
        return Colors.green;
      default:
        return Colors.reset;
    }
  }
}

/**
 * Create a default global logger instance
 */
export const logger = new Logger();

/**
 * Export a default instance for easy imports
 */
export default logger;
