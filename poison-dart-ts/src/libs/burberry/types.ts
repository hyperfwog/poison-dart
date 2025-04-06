/**
 * Core types for the Burberry framework
 * Ported from Rust crate burberry/src/types.rs
 */

// In TypeScript, we use AsyncIterator instead of Rust's Stream
export type CollectorStream<E> = AsyncIterator<E>;

/**
 * Collector interface - collects events from various sources
 */
export interface Collector<E> {
  name(): string;
  getEventStream(): Promise<CollectorStream<E>>;
}

/**
 * ActionSubmitter interface - submits actions to be executed
 */
export interface ActionSubmitter<A> {
  submit(action: A): void;
}

/**
 * Strategy interface - processes events and submits actions
 */
export interface Strategy<E, A> {
  name(): string;
  syncState?(submitter: ActionSubmitter<A>): Promise<void>;
  processEvent(event: E, submitter: ActionSubmitter<A>): Promise<void>;
}

/**
 * Executor interface - executes actions
 */
export interface Executor<A> {
  name(): string;
  execute(action: A): Promise<void>;
}

/**
 * CollectorMap - maps events from one type to another
 */
export class CollectorMap<E1, E2> implements Collector<E2> {
  private inner: Collector<E1>;
  private f: (e: E1) => E2;

  constructor(collector: Collector<E1>, f: (e: E1) => E2) {
    this.inner = collector;
    this.f = f;
  }

  name(): string {
    return this.inner.name();
  }

  async getEventStream(): Promise<CollectorStream<E2>> {
    const stream = await this.inner.getEventStream();
    const f = this.f;

    // Create a new async iterator that maps values from the inner stream
    return {
      async next(): Promise<IteratorResult<E2>> {
        const result = await stream.next();
        if (result.done) {
          return { done: true, value: undefined as any };
        }
        return { done: false, value: f(result.value) };
      }
    };
  }
}

/**
 * CollectorFilterMap - maps and filters events
 */
export class CollectorFilterMap<E1, E2> implements Collector<E2> {
  private inner: Collector<E1>;
  private f: (e: E1) => E2 | null | undefined;

  constructor(collector: Collector<E1>, f: (e: E1) => E2 | null | undefined) {
    this.inner = collector;
    this.f = f;
  }

  name(): string {
    return this.inner.name();
  }

  async getEventStream(): Promise<CollectorStream<E2>> {
    const stream = await this.inner.getEventStream();
    const f = this.f;

    // Create a new async iterator that maps and filters values from the inner stream
    return {
      async next(): Promise<IteratorResult<E2>> {
        while (true) {
          const result = await stream.next();
          if (result.done) {
            return { done: true, value: undefined as any };
          }
          
          const mapped = f(result.value);
          if (mapped !== null && mapped !== undefined) {
            return { done: false, value: mapped };
          }
          // If mapped is null or undefined, continue to the next item
        }
      }
    };
  }
}

/**
 * ExecutorMap - maps actions from one type to another
 */
export class ExecutorMap<A1, A2> implements Executor<A1> {
  private inner: Executor<A2>;
  private f: (a: A1) => A2 | null | undefined;

  constructor(executor: Executor<A2>, f: (a: A1) => A2 | null | undefined) {
    this.inner = executor;
    this.f = f;
  }

  name(): string {
    return this.inner.name();
  }

  async execute(action: A1): Promise<void> {
    const mappedAction = this.f(action);
    if (mappedAction !== null && mappedAction !== undefined) {
      return this.inner.execute(mappedAction);
    }
    return Promise.resolve();
  }
}
