# Debugging Tools for Poison Dart

This document describes the debugging tools created to help diagnose issues with the arbitrage bot, particularly focusing on why DEX swaps are not being detected.

## Overview of the Issue

The bot is processing transactions but consistently reporting "Transaction X is not to a known DEX router: Y". This suggests one of the following issues:

1. The DEX router addresses in the configuration are incorrect or outdated
2. The transaction parsing logic is not correctly identifying DEX transactions
3. There might be an issue with how the bot is checking if a transaction is to a known DEX router

## Available Debugging Tools

### 1. Enhanced Debug Strategy

An enhanced version of the arbitrage strategy with more detailed logging:

- `strategy-debug.ts`: Provides detailed logging of transaction data, function signatures, and parameters
- `main-debug.ts`: Modified main file to use the debug strategy

To run the bot with enhanced debugging:

```bash
./run-bot-debug.sh
```

### 2. Router Analyzer

A utility to analyze transaction data and identify potential DEX routers that might be missing from the configuration:

- `analyze-routers.ts`: Scans a range of blocks to find addresses that receive transactions with DEX-like function signatures

To analyze a range of blocks:

```bash
./analyze-routers.sh <startBlock> <endBlock>
```

Example:
```bash
./analyze-routers.sh 1000 1100
```

### 3. Transaction Analyzer

A utility to analyze a specific transaction in detail:

- `analyze-transaction.ts`: Provides detailed information about a transaction, including function signatures, parameters, and event logs

To analyze a specific transaction:

```bash
./analyze-transaction.sh <txHash>
```

Example:
```bash
./analyze-transaction.sh 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
```

### 4. Arbitrage Debugger

A utility to debug the arbitrage finding process for a specific transaction:

- `debug-arbitrage.ts`: Analyzes a transaction and simulates the arbitrage finding process, providing detailed logs about:
  - Pools in the cache
  - Tokens in the cache
  - Pools containing the tokens in the swap
  - Potential arbitrage paths
  - Profit calculations
  - Reasons why no profitable opportunities were found (if applicable)

To debug the arbitrage finding process for a specific transaction:

```bash
./debug-arbitrage.sh <txHash>
```

Example:
```bash
./debug-arbitrage.sh 0x4acb2bb22611921fd51a850a608d624789a3f7268d3438110db59614a71249ec
```

## Debugging Process

1. **Run the bot with enhanced debugging** to get more detailed logs about the transactions being processed.

2. **Analyze specific transactions** mentioned in the logs to understand their structure and why they're not being recognized as DEX transactions.

3. **Scan a range of blocks** to identify potential DEX routers that might be missing from the configuration.

4. Based on the findings, update the `DEX_CONTRACTS` object in `config.ts` to include any missing DEX routers.

## Common DEX Function Signatures

The tools look for the following common DEX function signatures:

### Uniswap V2-like
- `0x38ed1739`: swapExactTokensForTokens
- `0x8803dbee`: swapTokensForExactTokens
- `0x7ff36ab5`: swapExactETHForTokens
- `0x4a25d94a`: swapTokensForExactETH
- `0x18cbafe5`: swapExactTokensForETH
- `0xfb3bdb41`: swapETHForExactTokens

### Uniswap V3-like
- `0x414bf389`: exactInputSingle
- `0xc04b8d59`: exactInput
- `0xdb3e2198`: exactOutputSingle
- `0xf28c0498`: exactOutput

## Common Event Signatures

The transaction analyzer also looks for the following common event signatures:

- `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef`: Transfer (ERC20)
- `0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925`: Approval (ERC20)
- `0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822`: Swap (Uniswap V2)
- `0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67`: Swap (Uniswap V3)

## Potential Solutions

Based on the debugging results, you might need to:

1. **Update DEX router addresses** in the configuration if they have changed
2. **Add new DEX routers** that were not previously included
3. **Fix transaction parsing logic** if it's not correctly identifying DEX transactions
4. **Update function signature handling** if new DEX protocols use different function signatures
