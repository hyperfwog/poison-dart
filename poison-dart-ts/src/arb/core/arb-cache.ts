/**
 * Arbitrage cache for managing opportunities
 */
import type { Address } from 'viem';
import { Logger } from '../../libs/logger';
import type { Protocol, Source, SwapEvent } from '../types';
import type { ArbitrageOpportunity, ArbEntry, HeapItem, SwapInfo } from './types';

// Create a logger instance for the arbitrage cache
const logger = Logger.forContext('ArbCache');

/**
 * Binary heap implementation for priority queue
 */
class BinaryHeap<T> {
  private heap: T[] = [];
  private compare: (a: T, b: T) => boolean;

  constructor(compare: (a: T, b: T) => boolean) {
    this.compare = compare;
  }

  /**
   * Get the size of the heap
   */
  size(): number {
    return this.heap.length;
  }

  /**
   * Push an item onto the heap
   * @param item Item to push
   */
  push(item: T): void {
    // Add the item to the end of the heap
    this.heap.push(item);
    
    // Bubble up
    let index = this.heap.length - 1;
    const element = this.heap[index];
    
    while (index > 0) {
      // Compute the parent index
      const parentIndex = Math.floor((index - 1) / 2);
      const parent = this.heap[parentIndex];
      
      // If the parent is less than or equal to the element, we're done
      if (!this.compare(element, parent)) {
        break;
      }
      
      // Otherwise, swap the parent with the current element
      this.heap[parentIndex] = element;
      this.heap[index] = parent;
      index = parentIndex;
    }
  }

  /**
   * Pop the top item from the heap
   * @returns The top item or undefined if the heap is empty
   */
  pop(): T | undefined {
    // If the heap is empty, return undefined
    if (this.heap.length === 0) {
      return undefined;
    }
    
    // Get the top item
    const result = this.heap[0];
    
    // Get the last item
    const end = this.heap.pop();
    
    // If the heap is not empty, put the last item at the top and sift down
    if (this.heap.length > 0 && end !== undefined) {
      this.heap[0] = end;
      
      // Sift down
      let index = 0;
      const length = this.heap.length;
      const element = this.heap[0];
      
      while (true) {
        // Compute the child indices
        const leftChildIndex = 2 * index + 1;
        const rightChildIndex = 2 * index + 2;
        
        let leftChild: T | undefined;
        let rightChild: T | undefined;
        let swap: number | null = null;
        
        // If the left child exists
        if (leftChildIndex < length) {
          leftChild = this.heap[leftChildIndex];
          
          // If the left child is greater than the element, we need to swap
          if (this.compare(leftChild, element)) {
            swap = leftChildIndex;
          }
        }
        
        // If the right child exists
        if (rightChildIndex < length) {
          rightChild = this.heap[rightChildIndex];
          
          // If the right child is greater than the element and the left child
          if (
            (swap === null && this.compare(rightChild!, element)) ||
            (swap !== null && this.compare(rightChild!, leftChild!))
          ) {
            swap = rightChildIndex;
          }
        }
        
        // If we don't need to swap, we're done
        if (swap === null) {
          break;
        }
        
        // Otherwise, swap and continue
        this.heap[index] = this.heap[swap];
        this.heap[swap] = element;
        index = swap;
      }
    }
    
    return result;
  }

  /**
   * Peek at the top item without removing it
   * @returns The top item or undefined if the heap is empty
   */
  peek(): T | undefined {
    return this.heap[0];
  }
}

/**
 * Class for managing arbitrage opportunities
 */
export class ArbitrageCache {
  private map: Map<string, ArbEntry> = new Map();
  private heap: BinaryHeap<HeapItem> = new BinaryHeap((a, b) => a.expectedProfit > b.expectedProfit);
  private generationCounter: number = 0;
  private expirationDuration: number;
  
  constructor(expirationDuration: number = 60000) {
    this.expirationDuration = expirationDuration;
  }
  
  /**
   * Insert or update an arbitrage opportunity
   * @param token Token address
   * @param poolId Pool ID
   * @param swapInfo Swap information
   * @param source Source of the opportunity
   */
  insert(
    token: Address,
    poolId: Address | null,
    swapInfo: SwapInfo,
    source: Source
  ): void {
    const now = Date.now();
    this.generationCounter++;
    const generation = this.generationCounter;
    const expiresAt = now + this.expirationDuration;
    
    // Create key
    const key = `${token}-${poolId || 'null'}`;
    
    // Insert into map
    this.map.set(key, {
      swapInfo,
      generation,
      expiresAt,
      source
    });
    
    // Insert into heap
    this.heap.push({
      expiresAt,
      generation,
      key,
      expectedProfit: swapInfo.expectedProfit || BigInt(0)
    });
    
    logger.debug(`Inserted arbitrage opportunity for ${token} with pool ${poolId || 'null'}`);
  }
  
  /**
   * Remove expired entries
   * @returns List of expired keys
   */
  removeExpired(): string[] {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    while (this.heap.size() > 0) {
      const top = this.heap.peek();
      if (!top) break;
      
      // Check if entry is stale or expired
      const entry = this.map.get(top.key);
      if (!entry) {
        // Stale entry in heap, remove it
        this.heap.pop();
        continue;
      }
      
      if (entry.generation !== top.generation) {
        // Stale entry in heap, remove it
        this.heap.pop();
        continue;
      }
      
      if (entry.expiresAt <= now) {
        // Expired entry, remove from map and heap
        expiredKeys.push(top.key);
        this.map.delete(top.key);
        this.heap.pop();
        continue;
      }
      
      // Not expired, we're done
      break;
    }
    
    logger.debug(`Removed ${expiredKeys.length} expired arbitrage opportunities`);
    return expiredKeys;
  }
  
  /**
   * Get the next opportunity to evaluate
   * @returns Arbitrage opportunity or null if none available
   */
  popOne(): ArbitrageOpportunity | null {
    // Remove expired entries
    this.removeExpired();
    
    // Get the top entry
    const top = this.heap.pop();
    if (!top) {
      return null;
    }
    
    // Get the entry from the map
    const entry = this.map.get(top.key);
    if (!entry) {
      return null;
    }
    
    // Remove from map
    this.map.delete(top.key);
    
    // Check if we have a valid path
    if (!entry.swapInfo.path) {
      logger.warn(`Skipping opportunity with no path: ${top.key}`);
      return null;
    }
    
    // Create arbitrage opportunity
    const opportunity: ArbitrageOpportunity = {
      path: entry.swapInfo.path,
      expectedProfit: entry.swapInfo.expectedProfit || BigInt(0),
      inputAmount: entry.swapInfo.amountIn,
      protocols: entry.swapInfo.protocols || [],
      startToken: entry.swapInfo.tokenIn,
      gasEstimate: entry.swapInfo.gasEstimate || BigInt(0),
      source: entry.source,
      createdAt: Date.now(),
    };
    
    logger.debug(`Popped arbitrage opportunity with expected profit ${opportunity.expectedProfit}`);
    return opportunity;
  }
  
  /**
   * Get the number of opportunities in the cache
   * @returns Number of opportunities
   */
  size(): number {
    return this.map.size;
  }
  
  /**
   * Clear the cache
   */
  clear(): void {
    this.map.clear();
    // Create a new heap since we can't clear the existing one
    this.heap = new BinaryHeap<HeapItem>((a, b) => a.expectedProfit > b.expectedProfit);
    logger.debug('Cleared arbitrage cache');
  }
}
