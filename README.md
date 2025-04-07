# Sui MEV Bot

A high-performance arbitrage bot for the Sui blockchain that monitors and executes profitable trading opportunities across multiple DEXes.

## Features

- **Multi-DEX Support**: Monitors and executes trades across all major Sui DEXes
- **High-Performance Architecture**: Uses a worker pool design for parallel processing of opportunities
- **Advanced Path Finding**: Finds optimal trading paths using graph-based algorithms
- **Flashloan Integration**: Utilizes flashloans for capital-efficient arbitrage
- **Mempool Monitoring**: Detects opportunities from pending transactions
- **Validator Integration**: Optional relay component for direct transaction feeds from validators

## Supported DEXes

- BlueMove
- FlowX
- Aftermath
- Cetus
- Kriya
- Abex
- Navi
- Turbos
- Deepbook
- Shio

## Requirements

- Rust 1.81 or later
- Linux or macOS (Windows support is experimental)
- Sui wallet with SUI tokens for gas fees
- Access to Sui RPC endpoints

## Installation

### Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustup install 1.81
rustup default 1.81
```

### Clone and Build

```bash
# Clone the repository
git clone https://github.com/HyperFwog/poison-dart.git
cd poison-dart

# Build the project
cargo build --release
```

## Running the Bot

### Basic Usage

```bash
# Run with your private key
cargo run -r --bin arb start-bot -- --private-key YOUR_PRIVATE_KEY_HERE
```

### Configuration Options

The bot supports various configuration options:

```bash
# Run with custom RPC endpoint
cargo run -r --bin arb start-bot -- \
  --private-key YOUR_PRIVATE_KEY_HERE \
  --rpc-url https://your-custom-rpc.example.com

# Run with DB simulator for improved performance
cargo run -r --bin arb start-bot -- \
  --private-key YOUR_PRIVATE_KEY_HERE \
  --use-db-simulator \
  --db-path /path/to/sui/db \
  --config-path /path/to/sui/config.yaml

# Run with more workers for higher throughput
cargo run -r --bin arb start-bot -- \
  --private-key YOUR_PRIVATE_KEY_HERE \
  --workers 16 \
  --num-simulators 64
```

## Relay Component

The Relay component provides a direct connection between Sui validators and your MEV bot, offering several advantages:

### Advantages of Using Relay

1. **Early Transaction Access**: Receive transactions directly from validators before they're broadcast to the public mempool
2. **Reduced Latency**: Minimize the delay between transaction creation and detection
3. **Higher Success Rate**: Execute arbitrage opportunities before other bots can detect them
4. **Validator Integration**: If you run a validator, you can prioritize your own MEV opportunities

### Running the Relay

```bash
# Start the relay server
cargo run -r --bin relay

# Connect the bot to the relay
cargo run -r --bin arb start-bot -- \
  --private-key YOUR_PRIVATE_KEY_HERE \
  --relay-ws-url ws://localhost:9001
```

## Architecture

The bot consists of several key components:

1. **Collectors**: Monitor the blockchain for events (transactions, blocks)
2. **Strategy**: Analyzes events to identify arbitrage opportunities
3. **Workers**: Process opportunities in parallel
4. **Executors**: Submit transactions to the blockchain
5. **DEX Indexer**: Maintains a database of DEX pools and their states

## Advanced Configuration

### Worker Configuration

```bash
cargo run -r --bin arb start-bot -- \
  --private-key YOUR_PRIVATE_KEY_HERE \
  --workers 16 \                        # Number of worker threads
  --num-simulators 64 \                 # Size of simulator pool
  --max-recent-arbs 30 \                # Recent arbitrage memory
  --dedicated-short-interval 30 \       # Short polling interval (ms)
  --dedicated-long-interval 150         # Long polling interval (ms)
```

### Simulator Configuration

```bash
cargo run -r --bin arb start-bot -- \
  --private-key YOUR_PRIVATE_KEY_HERE \
  --use-db-simulator \                  # Use DB simulator (recommended)
  --db-path /path/to/sui/db \           # Path to Sui database
  --config-path /path/to/sui/config \   # Path to Sui config
  --update-cache-socket /tmp/cache.sock # Socket for cache updates
```

## Troubleshooting

### Common Issues

- **RPC Connection Errors**: Ensure your RPC endpoint is accessible and has sufficient rate limits
- **Transaction Failures**: Check gas settings and ensure your wallet has sufficient SUI
- **Performance Issues**: Try increasing the number of workers and simulators
- **Missing Opportunities**: Consider using the Relay component for earlier transaction access

### Logs

The bot uses structured logging. To view debug logs:

```bash
RUST_LOG=debug cargo run -r --bin arb start-bot -- --private-key YOUR_KEY
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
