#!/bin/bash

# Set environment variables for testing
export PRIVATE_KEY="0x0000000000000000000000000000000000000000000000000000000000000001"
export WALLET_ADDRESS="0x0000000000000000000000000000000000000001"

# Run the bot with HyperEVM chain
export CHAIN_ID=999

# Check if transaction hash is provided
if [ $# -lt 1 ]; then
  echo "Usage: $0 <txHash>"
  echo "Example: $0 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
  exit 1
fi

TX_HASH=$1

# Run the transaction analyzer
cd poison-dart-ts && bun run src/arb/utils/analyze-transaction.ts $TX_HASH
