#!/bin/bash

# Set environment variables for testing
export PRIVATE_KEY="0x0000000000000000000000000000000000000000000000000000000000000001"
export WALLET_ADDRESS="0x0000000000000000000000000000000000000001"

# Run the bot with HyperEVM chain
export CHAIN_ID=999

# Check if start and end block are provided
if [ $# -lt 2 ]; then
  echo "Usage: $0 <startBlock> <endBlock>"
  echo "Example: $0 1000 1100"
  exit 1
fi

START_BLOCK=$1
END_BLOCK=$2

# Run the router analyzer
cd poison-dart-ts && bun run src/arb/utils/analyze-routers.ts $START_BLOCK $END_BLOCK
