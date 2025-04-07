/**
 * Core engine for the Burberry framework
 * Ported from Rust crate burberry/src/engine.rs
 */

import { ActionChannelSubmitter } from './action_submitter';
import { Collector, Executor, Strategy } from './types';
import { BroadcastChannel } from './utils/broadcast_channel';
import { logger } from './utils/logger';

/**
 * Engine class - coordinates collectors, strategies, and executors
 */
export class Engine<E, A> {
  private collectors: Array<Collector<E>> = [];
  private strategies: Array<Strategy<E, A>> = [];
  private executors: Array<Executor<A>> = [];

  private eventChannelCapacity: number = 512;
  private actionChannelCapacity: number = 512;

  /**
   * Create a new Engine instance
   */
  constructor() {}

  /**
   * Set the event channel capacity
   */
  withEventChannelCapacity(capacity: number): Engine<E, A> {
    this.eventChannelCapacity = capacity;
    return this;
  }

  /**
   * Set the action channel capacity
   */
  withActionChannelCapacity(capacity: number): Engine<E, A> {
    this.actionChannelCapacity = capacity;
    return this;
  }

  /**
   * Get the number of strategies
   */
  strategyCount(): number {
    return this.strategies.length;
  }

  /**
   * Get the number of executors
   */
  executorCount(): number {
    return this.executors.length;
  }

  /**
   * Add a collector to the engine
   */
  addCollector(collector: Collector<E>): void {
    this.collectors.push(collector);
  }

  /**
   * Add a strategy to the engine
   */
  addStrategy(strategy: Strategy<E, A>): void {
    this.strategies.push(strategy);
  }

  /**
   * Add an executor to the engine
   */
  addExecutor(executor: Executor<A>): void {
    this.executors.push(executor);
  }

  /**
   * Run the engine and wait for it to complete
   */
  async runAndJoin(): Promise<void> {
    const tasks = await this.run();
    
    // Wait for all tasks to complete
    await Promise.all(tasks).catch(err => {
      logger.error(`Task terminated unexpectedly: ${err}`);
    });
  }

  /**
   * Run the engine and return the tasks
   */
  async run(): Promise<Promise<void>[]> {
    // Create broadcast channels for events and actions
    const eventChannel = new BroadcastChannel<E>(this.eventChannelCapacity);
    const actionChannel = new BroadcastChannel<A>(this.actionChannelCapacity);

    const tasks: Promise<void>[] = [];

    // Validate that we have executors, collectors, and strategies
    if (this.executors.length === 0) {
      throw new Error("No executors");
    }

    if (this.collectors.length === 0) {
      throw new Error("No collectors");
    }

    if (this.strategies.length === 0) {
      throw new Error("No strategies");
    }

    // Spawn executors
    for (const executor of this.executors) {
      const receiver = actionChannel.subscribe();
      
      tasks.push((async () => {
        logger.debug(`Starting executor: ${executor.name()}`);

        try {
          for await (const action of receiver) {
            try {
              await executor.execute(action);
            } catch (e) {
              logger.error(`Error executing action in ${executor.name()}: ${e}`);
            }
          }
        } catch (e) {
          if (e instanceof Error && e.message === 'Channel closed') {
            logger.error(`Action channel closed for ${executor.name()}!`);
          } else if (e instanceof Error && e.message.startsWith('Channel lagged by')) {
            logger.warn(`Action channel lagged for ${executor.name()}: ${e.message}`);
          } else {
            logger.error(`Unexpected error in executor ${executor.name()}: ${e}`);
          }
        }
      })());
    }

    // Spawn strategies
    for (const strategy of this.strategies) {
      const eventReceiver = eventChannel.subscribe();
      const actionSubmitter = new ActionChannelSubmitter<A>(actionChannel);

      // Sync state if the strategy implements it
      if (strategy.syncState) {
        try {
          await strategy.syncState(actionSubmitter);
        } catch (e) {
          throw new Error(`Failed to sync state: ${e}`);
        }
      }

      tasks.push((async () => {
        logger.debug(`Starting strategy: ${strategy.name()}`);

        try {
          for await (const event of eventReceiver) {
            await strategy.processEvent(event, actionSubmitter);
          }
        } catch (e) {
          if (e instanceof Error && e.message === 'Channel closed') {
            logger.error(`Event channel closed for ${strategy.name()}!`);
          } else if (e instanceof Error && e.message.startsWith('Channel lagged by')) {
            logger.warn(`Event channel lagged for ${strategy.name()}: ${e.message}`);
          } else {
            logger.error(`Unexpected error in strategy ${strategy.name()}: ${e}`);
          }
        }
      })());
    }

    // Spawn collectors
    for (const collector of this.collectors) {
      tasks.push((async () => {
        logger.debug(`Starting collector: ${collector.name()}`);
        
        try {
          const eventStream = await collector.getEventStream();
          
          while (true) {
            const result = await eventStream.next();
            if (result.done) {
              break;
            }
            
            try {
              eventChannel.send(result.value);
            } catch (e) {
              logger.error(`Error sending event from ${collector.name()}: ${e}`);
            }
          }
          
          logger.error(`Event stream ended for ${collector.name()}!`);
        } catch (e) {
          logger.error(`Error in collector ${collector.name()}: ${e}`);
        }
      })());
    }

    return tasks;
  }
}
