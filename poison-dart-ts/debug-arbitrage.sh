#!/bin/bash

# Set environment variables for testing
export PRIVATE_KEY="0x0000000000000000000000000000000000000000000000000000000000000001"
export WALLET_ADDRESS="0x0000000000000000000000000000000000000001"

# Run the bot with HyperEVM chain
export CHAIN_ID=999

# Check if transaction hash is provided
if [ $# -lt 1 ]; then
  echo "Usage: $0 <txHash>"
  echo "Example: $0 0x36b91e333f7b4e944838b7976e5caa86eabb822e02c5cf5a5a3148da8591f24a"
  exit 1
fi

TX_HASH=$1

# Run the arbitrage debugger
cd poison-dart-ts && bun run src/arb/utils/debug-arbitrage.ts $TX_HASH
