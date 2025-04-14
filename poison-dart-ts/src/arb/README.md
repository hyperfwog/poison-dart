# Arbitrage Bot

This module implements an arbitrage bot for finding and executing profitable trading opportunities across different DEXes on the HyperEVM chain.

## Architecture

The arbitrage bot is composed of several key components:

### Core Components

- **Graph**: Implements a token graph with the Bellman-Ford algorithm for finding negative cycles (arbitrage opportunities).
- **Simulator**: Simulates trades to calculate expected profits, with grid search and golden section search for optimal input amounts.
- **ArbitrageCache**: Manages arbitrage opportunities with priority queue based on expected profit.
- **Worker/WorkerPool**: Evaluates arbitrage opportunities in parallel.
- **Finder**: Discovers arbitrage opportunities using the token graph.

### Data Collection and State Management

- **Enhanced State Management**: Efficiently manages pool states with generation-based caching and optimized lookups.
- **Enhanced Event Collector**: Collects events from different sources (mempool, blocks, logs) with improved efficiency.
- **Indexer**: Discovers and tracks DEX pools.

### Execution

- **ArbitrageBot**: Main bot implementation that ties everything together.

## How It Works

1. **Pool Discovery**: The bot discovers pools from different DEXes (HyperSwap V2, HyperSwap V3, KittenSwap) and builds a token graph.
2. **Opportunity Detection**: The bot uses the Bellman-Ford algorithm to find negative cycles in the token graph, which represent arbitrage opportunities.
3. **Opportunity Evaluation**: The bot evaluates each opportunity by simulating trades and calculating expected profits.
4. **Opportunity Execution**: The bot executes profitable opportunities by sending transactions to the blockchain.

## Arbitrage Evaluation Process

1. **Graph Construction**: Each token is a node, and each pool is an edge with a weight equal to the negative logarithm of the exchange rate.
2. **Negative Cycle Detection**: The Bellman-Ford algorithm is used to find negative cycles in the graph, which represent arbitrage opportunities.
3. **Input Amount Optimization**: Grid search and golden section search are used to find the optimal input amount for maximum profit.
4. **Profit Calculation**: The expected profit is calculated by simulating the trade and subtracting gas costs.

## Event Collection and State Management

The bot uses an enhanced state management system for efficient data collection and caching:

- **Unified Event Collection**: Collects events from mempool, blocks, and logs in a unified way with deduplication.
- **Efficient Pool State Management**: Manages pool states with generation-based caching and optimized lookups.
- **Event-Based Updates**: Updates pool states based on events (pool creation, updates, swaps, etc.).
- **Persistent Caching**: Saves pool states to disk for recovery after restarts.

The bot collects events from different sources:

- **Mempool**: Monitors pending transactions for potential arbitrage opportunities with WebSocket subscriptions.
- **Blocks**: Processes new blocks to update the token graph and search for arbitrage opportunities.
- **Logs**: Monitors DEX events (e.g., swap events) to update pool reserves and detect price changes with optimized polling.

## Configuration

The bot can be configured through the `config.ts` file, which includes:

- **Base Tokens**: Tokens to use for arbitrage (e.g., WETH, USDC, USDT, DAI).
- **Gas Settings**: Gas price multiplier and maximum gas to use.
- **Profit Threshold**: Minimum profit threshold for executing arbitrage.
- **DEX Contracts**: Addresses of DEX contracts.

## Usage

To run the arbitrage bot:

```bash
# Set private key
export PRIVATE_KEY=your_private_key

# Run the bot
npm run start:arb
```

## Development

To develop the arbitrage bot:

```bash
# Install dependencies
npm install

# Build the bot
npm run build

# Run the bot in development mode
npm run dev:arb
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
