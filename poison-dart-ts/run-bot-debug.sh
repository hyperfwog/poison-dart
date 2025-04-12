#!/bin/bash

# Set environment variables for testing
export PRIVATE_KEY="0x0000000000000000000000000000000000000000000000000000000000000001"
export WALLET_ADDRESS="0x0000000000000000000000000000000000000001"

# Run the bot with HyperEVM chain
export CHAIN_ID=999

# Run the bot with enhanced debugging
cd poison-dart-ts && bun run src/arb/main-debug.ts
