#!/bin/bash

# Run the arbitrage bot
echo "Starting arbitrage bot..."

# Check if private key is set
if [ -z "$PRIVATE_KEY" ]; then
  echo "Error: PRIVATE_KEY environment variable is not set"
  echo "Please set it with: export PRIVATE_KEY=your_private_key"
  exit 1
fi

# Run the bot
bun run src/arb/main.ts
