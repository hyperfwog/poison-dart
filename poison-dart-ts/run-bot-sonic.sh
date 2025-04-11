#!/bin/bash

# Set environment variables for testing
export PRIVATE_KEY="0x0000000000000000000000000000000000000000000000000000000000000001"
export WALLET_ADDRESS="0x0000000000000000000000000000000000000001"

# Run the bot with Sonic chain
export CHAIN_ID=146

# Run the bot
bun run src/arb/main.ts
