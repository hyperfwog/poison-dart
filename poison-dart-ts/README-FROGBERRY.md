# Frogberry Integration for Poison Dart

This project has been updated to use the Frogberry framework instead of Burberry, and now supports multiple EVM chains.

## Changes Made

1. **Replaced Burberry with Frogberry**
   - Updated all imports to use the Frogberry package
   - Updated type references to use Frogberry's types
   - Fixed type compatibility issues

2. **Added Multi-Chain Support**
   - Added support for Sonic (chainId 146) and HyperEVM (chainId 999)
   - Updated configuration to allow selecting different chains via environment variables
   - Modified client creation to use the selected chain

3. **Added HyperEVM DEX Support**
   - Implemented KittenSwap DEX (both stable and volatile pools)
   - Implemented HyperSwap V2 (Uniswap V2 fork)
   - Implemented HyperSwap V3 (Uniswap V3 fork) with multiple fee tiers
   - Updated strategy to use appropriate DEXes based on the selected chain

## Running the Bot

### Prerequisites

- Bun installed
- Frogberry package installed (`bun add https://github.com/hyperfwog/frogberry.git`)

### Environment Variables

The bot requires the following environment variables:

- `PRIVATE_KEY`: The private key for the wallet
- `WALLET_ADDRESS`: The address of the wallet
- `CHAIN_ID`: The chain ID to use (146 for Sonic, 999 for HyperEVM)
- `TELEGRAM_BOT_TOKEN` (optional): Telegram bot token for notifications
- `TELEGRAM_CHAT_ID` (optional): Telegram chat ID for notifications

### Running with HyperEVM

```bash
# Set environment variables
export PRIVATE_KEY="your_private_key"
export WALLET_ADDRESS="your_wallet_address"
export CHAIN_ID=999

# Run the bot
bun run src/arb/main.ts
```

Alternatively, you can use the provided script:

```bash
./run-bot.sh
```

### Running with Sonic

```bash
# Set environment variables
export PRIVATE_KEY="your_private_key"
export WALLET_ADDRESS="your_wallet_address"
export CHAIN_ID=250

# Run the bot
bun run src/arb/main.ts
```

Alternatively, you can use the provided script:

```bash
./run-bot-sonic.sh
```

## Features

- **Multi-Chain Support**: The bot can run on both Sonic (chainId 146) and HyperEVM (chainId 999) chains.
- **Multiple DEX Support**: 
  - On Sonic: Shadow (Uniswap V3 fork) and SwapX (Algebra V4)
  - On HyperEVM: KittenSwap (stable and volatile pools), HyperSwap V2, and HyperSwap V3
- **Arbitrage Detection**: The bot can find arbitrage opportunities between different DEXes on the same chain.
- **Configurable**: Environment variables allow easy configuration of the bot.

## Known Issues

- The Sonic RPC URL may have certificate issues. If you encounter SSL certificate errors, you may need to update the RPC URL in the configuration.

## Adding More Chains

To add support for additional EVM chains:

1. Add the chain configuration to the `CHAINS` object in `src/arb/config.ts`
2. Update the chain selection logic in `src/arb/main.ts` if needed
3. Implement DEX adapters for the new chain in the `src/arb/defi` directory
4. Update the strategy to use the new DEXes based on the chain ID
