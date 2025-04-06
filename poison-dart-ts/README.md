# Poison Dart

A TypeScript and Bun implementation of a Sui blockchain arbitrage bot, converted from the original Rust implementation.

## Overview

Poison Dart is designed to find and execute arbitrage opportunities across various DEXes on the Sui blockchain. It uses simulation to identify profitable trading paths and executes transactions when opportunities are found.

## Features

- Find arbitrage opportunities across multiple DEXes
- Simulate transactions before execution
- Support for both public transactions and Shio (private) transactions
- Golden section search algorithm to optimize trade amounts
- Command-line interface for different operations

## Prerequisites

- [Bun](https://bun.sh/) (>= 1.0.0)
- Sui RPC endpoint
- Private key for transaction signing

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd poison-dart-ts

# Install dependencies
bun install
```

## Configuration

Create a `.env` file in the root directory with the following variables:

```
SUI_RPC_URL=https://your-sui-rpc-endpoint
SUI_PRIVATE_KEY=your-private-key
```

## Usage

### Build the project

```bash
bun run build
```

### Run arbitrage search for a specific coin

```bash
bun run start run --coin-type 0x2::sui::SUI --sender <your-address>
```

### Start the arbitrage bot

```bash
bun run start start-bot
```

### Generate pool IDs

```bash
bun run start pool-ids
```

## Command Line Options

### Run Command

- `--coin-type <type>`: Coin type to search for arbitrage opportunities (required)
- `--pool-id <id>`: Specific pool ID to focus on (optional)
- `--sender <address>`: Sender address (required)
- `--rpc-url <url>`: Sui RPC URL (defaults to environment variable)

### Start Bot Command

- `--private-key <key>`: Private key for transaction signing (required if not in .env)
- `--rpc-url <url>`: Sui RPC URL (defaults to environment variable)
- `--workers <number>`: Number of workers (default: 8)

### Pool IDs Command

- `--rpc-url <url>`: Sui RPC URL (defaults to environment variable)

## Development Status

This is a work in progress. The core architecture has been implemented, but many components are still using stub implementations that need to be completed:

- [ ] Complete DeFi module implementation
- [ ] Implement transaction simulation
- [ ] Implement gas coin retrieval
- [ ] Implement pool ID generation
- [ ] Add support for Shio transactions
- [ ] Add proper error handling and logging

## License

MIT
