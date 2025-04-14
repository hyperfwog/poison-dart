# Enhanced State Management System

This directory contains an enhanced state management system for the arbitrage bot, designed to efficiently collect and cache pool states.

## Components

### PoolStateManager

The `PoolStateManager` is responsible for managing pool states with efficient caching:

- **Efficient Lookups**: Provides fast lookups by pool address, token, token pair, and protocol
- **Generation Tracking**: Uses a generation counter to track state changes and avoid stale data
- **Event-Based Updates**: Updates pool states based on events (pool creation, updates, swaps, etc.)
- **Persistent Caching**: Saves pool states to disk for recovery after restarts
- **Statistics**: Tracks cache hits, misses, and other metrics for monitoring

### EnhancedEventCollector

The `EnhancedEventCollector` efficiently collects events from different sources:

- **Unified Collection**: Collects events from mempool, blocks, and logs in a unified way
- **Deduplication**: Avoids processing the same event multiple times
- **Protocol-Specific Processing**: Processes events differently based on the protocol
- **Memory Management**: Limits the size of internal data structures to avoid memory leaks
- **Subscription Management**: Properly manages subscriptions to avoid resource leaks

### State Events

The system uses a set of state events to communicate changes:

- **PoolCreated**: Fired when a new pool is created
- **PoolUpdated**: Fired when a pool's state changes
- **Swap**: Fired when a swap occurs in a pool
- **LiquidityAdded**: Fired when liquidity is added to a pool
- **LiquidityRemoved**: Fired when liquidity is removed from a pool

## Usage

```typescript
// Create a pool state manager
const stateManager = new PoolStateManager();

// Initialize the state manager
await stateManager.initialize(chainId);

// Create an event collector
const eventCollector = new EnhancedEventCollector(publicClient, stateManager);

// Start collecting events
await eventCollector.start();

// Subscribe to state events
stateManager.subscribe((event) => {
  // Handle state events
  console.log(`Received event: ${event.type}`);
});

// Get pools by token
const pools = stateManager.getPoolsByToken(tokenAddress);

// Get pools by token pair
const pools = stateManager.getPoolsByTokenPair(token0Address, token1Address);

// Get all pools
const allPools = stateManager.getAllPools();

// Stop collecting events
eventCollector.stop();

// Save pool states to cache
await stateManager.savePoolsToCache(chainId);
```

## Improvements Over Previous Implementation

1. **Efficient Event Collection**:
   - Replaced polling with WebSocket subscriptions where possible
   - Implemented a unified event collector that handles all event types efficiently
   - Added specialized event parsers for different DEX protocols
   - Implemented backpressure handling and rate limiting

2. **Optimized Pool State Management**:
   - Created a dedicated pool state manager that efficiently tracks changes
   - Implemented a two-tier caching system: in-memory for speed and persistent for durability
   - Used specialized data structures for different lookup patterns
   - Added versioning to track state changes and avoid stale data

3. **Improved Event Processing**:
   - Implemented specialized processors for different event types
   - Extract relevant information from events to update pool states
   - Added prioritization for high-value events
   - Implemented batched processing for efficiency

4. **Enhanced Caching Mechanism**:
   - Adopted generation-based caching for better consistency
   - Implemented efficient expiration and cleanup mechanisms
   - Added metrics and monitoring for cache performance
   - Optimized memory usage with appropriate data structures
