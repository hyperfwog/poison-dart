/**
 * BroadcastChannel implementation
 * A TypeScript equivalent of Tokio's broadcast channel
 */

/**
 * Receiver for a broadcast channel
 */
export class BroadcastReceiver<T> implements AsyncIterator<T> {
  private channel: BroadcastChannel<T>;
  private buffer: T[] = [];
  private closed = false;
  private resolvers: ((value: IteratorResult<T>) => void)[] = [];
  private lagCount = 0;
  private readonly maxLag: number;

  constructor(channel: BroadcastChannel<T>, maxLag: number) {
    this.channel = channel;
    this.maxLag = maxLag;
    
    // Register this receiver with the channel
    channel.addReceiver(this);
  }

  /**
   * Receive a value from the channel
   */
  receive(value: T): void {
    if (this.closed) return;
    
    // If we have waiting resolvers, resolve them immediately
    if (this.resolvers.length > 0) {
      const resolver = this.resolvers.shift()!;
      resolver({ done: false, value });
      return;
    }
    
    // Otherwise, add to buffer, potentially dropping old messages
    this.buffer.push(value);
    if (this.buffer.length > this.maxLag) {
      this.buffer.shift();
      this.lagCount++;
      
      if (this.lagCount % 100 === 0) {
        throw new Error(`Channel lagged by ${this.lagCount}`);
      }
    }
  }

  /**
   * Close the receiver
   */
  close(): void {
    this.closed = true;
    
    // Resolve any waiting resolvers with done
    for (const resolver of this.resolvers) {
      resolver({ done: true, value: undefined as any });
    }
    this.resolvers = [];
    
    // Remove this receiver from the channel
    this.channel.removeReceiver(this);
  }

  /**
   * AsyncIterator next method
   */
  async next(): Promise<IteratorResult<T>> {
    if (this.closed) {
      return { done: true, value: undefined as any };
    }
    
    // If we have buffered values, return one immediately
    if (this.buffer.length > 0) {
      const value = this.buffer.shift()!;
      return { done: false, value };
    }
    
    // Otherwise, wait for a value
    return new Promise<IteratorResult<T>>(resolve => {
      this.resolvers.push(resolve);
    });
  }

  /**
   * Make the receiver iterable with for-await-of
   */
  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this;
  }
}

/**
 * BroadcastChannel - a multi-producer, multi-consumer channel
 */
export class BroadcastChannel<T> {
  private receivers: Set<BroadcastReceiver<T>> = new Set();
  private capacity: number;
  private closed = false;

  constructor(capacity: number = 512) {
    this.capacity = capacity;
  }

  /**
   * Send a value to all receivers
   */
  send(value: T): void {
    if (this.closed) {
      throw new Error('Channel closed');
    }
    
    for (const receiver of this.receivers) {
      receiver.receive(value);
    }
  }

  /**
   * Subscribe to the channel
   */
  subscribe(): BroadcastReceiver<T> {
    if (this.closed) {
      throw new Error('Channel closed');
    }
    
    return new BroadcastReceiver<T>(this, this.capacity);
  }

  /**
   * Close the channel
   */
  close(): void {
    this.closed = true;
    
    for (const receiver of this.receivers) {
      receiver.close();
    }
    
    this.receivers.clear();
  }

  /**
   * Add a receiver to the channel (internal use)
   */
  addReceiver(receiver: BroadcastReceiver<T>): void {
    this.receivers.add(receiver);
  }

  /**
   * Remove a receiver from the channel (internal use)
   */
  removeReceiver(receiver: BroadcastReceiver<T>): void {
    this.receivers.delete(receiver);
  }
}
