/**
 * Simple example of using the Burberry framework
 */
import { Engine } from '../engine';
import { IntervalCollector } from '../collector/interval_collector';
import { Dummy } from '../executor/dummy';
import { PrinterExecutor } from '../executor/printer';
import { Strategy, ActionSubmitter } from '../types';
import { logger, LogLevel } from '../utils/logger';

// Set log level to debug
logger.setLevel(LogLevel.DEBUG);

// Define event and action types
type Event = Date;
type Action = string;

// Define a simple strategy
class SimpleStrategy implements Strategy<Event, Action> {
  name(): string {
    return "SimpleStrategy";
  }

  async processEvent(event: Event, submitter: ActionSubmitter<Action>): Promise<void> {
    const message = `Event received at ${event.toISOString()}`;
    logger.info(message);
    submitter.submit(message);
  }
}

// Create and run the engine
async function main() {
  // Create a new engine
  const engine = new Engine<Event, Action>();

  // Add a collector that emits events every second
  engine.addCollector(new IntervalCollector(1000));

  // Add a strategy to process events
  engine.addStrategy(new SimpleStrategy());

  // Add executors
  engine.addExecutor(new Dummy<Action>());
  engine.addExecutor(new PrinterExecutor<Action>());

  // Run the engine
  logger.info("Starting engine...");
  await engine.runAndJoin();
}

// Run the example
main().catch(err => {
  logger.error(`Error: ${err}`);
  process.exit(1);
});
