/**
 * Utility script to analyze a specific transaction in detail
 */
import { http, createPublicClient } from 'viem';
import { Logger } from '../../libs/logger';
import { CHAINS, DEX_CONTRACTS, loadConfig } from '../config';
import { HyperSwapV2Dex } from '../defi/hyperswap-v2';
import { HyperSwapV3Dex } from '../defi/hyperswap-v3';
import { KittenSwapDex } from '../defi/kittenswap';
import { ShadowDex } from '../defi/shadow';
import { SwapXDex } from '../defi/swapx';
import { Protocol } from '../types';

// Create a logger instance
const logger = Logger.forContext('TxAnalyzer');

// Common DEX function signatures
const DEX_SIGNATURES: Record<string, string> = {
  // Uniswap V2 function signatures
  '0x38ed1739': 'swapExactTokensForTokens',
  '0x8803dbee': 'swapTokensForExactTokens',
  '0x7ff36ab5': 'swapExactETHForTokens',
  '0x4a25d94a': 'swapTokensForExactETH',
  '0x18cbafe5': 'swapExactTokensForETH',
  '0xfb3bdb41': 'swapETHForExactTokens',

  // Uniswap V3 function signatures
  '0x414bf389': 'exactInputSingle',
  '0xc04b8d59': 'exactInput',
  '0xdb3e2198': 'exactOutputSingle',
  '0xf28c0498': 'exactOutput',
};

// Known DEX routers
const KNOWN_ROUTERS = new Map<string, { name: string; protocol: Protocol }>();

// Initialize known routers
function initializeKnownRouters() {
  // Add all known routers to the map with their protocol names
  KNOWN_ROUTERS.set(DEX_CONTRACTS.HYPERSWAP.V2_ROUTER.toLowerCase(), {
    name: 'HyperSwap V2',
    protocol: Protocol.HyperSwapV2,
  });
  KNOWN_ROUTERS.set(DEX_CONTRACTS.HYPERSWAP.V3_ROUTER.toLowerCase(), {
    name: 'HyperSwap V3',
    protocol: Protocol.HyperSwapV3,
  });
  KNOWN_ROUTERS.set(DEX_CONTRACTS.KITTENSWAP.ROUTER.toLowerCase(), {
    name: 'KittenSwap',
    protocol: Protocol.KittenSwap,
  });
  KNOWN_ROUTERS.set(DEX_CONTRACTS.SHADOW.ROUTER.toLowerCase(), {
    name: 'Shadow',
    protocol: Protocol.Shadow,
  });
  KNOWN_ROUTERS.set(DEX_CONTRACTS.SWAPX.ROUTER.toLowerCase(), {
    name: 'SwapX',
    protocol: Protocol.SwapX,
  });

  logger.info(`Initialized ${KNOWN_ROUTERS.size} known DEX routers`);
}

/**
 * Analyze a specific transaction
 * @param txHash Transaction hash to analyze
 */
async function analyzeTransaction(txHash: string) {
  logger.info(`Analyzing transaction ${txHash}...`);

  // Load configuration
  const config = loadConfig();

  // Determine which chain to use
  const chain = config.chainId === 999 ? CHAINS.HYPEREVM : CHAINS.SONIC;
  logger.info(`Using chain: ${chain.name}`);

  // Create Viem client
  const publicClient = createPublicClient({
    chain,
    transport: http(config.rpc.url),
  });

  // Initialize known routers
  initializeKnownRouters();

  try {
    // Get transaction
    const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` });

    // Log basic transaction info
    logger.info('Transaction details:');
    logger.info(`  Hash: ${tx.hash}`);
    logger.info(`  From: ${tx.from}`);
    logger.info(`  To: ${tx.to}`);
    logger.info(`  Value: ${tx.value}`);
    logger.info(`  Gas: ${tx.gas}`);
    logger.info(`  Gas Price: ${tx.gasPrice}`);
    logger.info(`  Nonce: ${tx.nonce}`);
    logger.info(`  Block Number: ${tx.blockNumber}`);

    // Skip if transaction has no input data or no 'to' address
    if (!tx.input || tx.input === '0x' || !tx.to) {
      logger.info('Transaction has no input data or no recipient address');
      return;
    }

    // Check if it's a known router
    const to = tx.to.toLowerCase();
    const knownRouter = KNOWN_ROUTERS.get(to);

    if (knownRouter) {
      logger.info(`Transaction is to a known DEX router: ${knownRouter.name} (${to})`);

      // Try to parse the transaction based on the protocol
      try {
        let swapInfo = null;

        switch (knownRouter.protocol) {
          case Protocol.HyperSwapV2:
            swapInfo = await HyperSwapV2Dex.parseTransaction(publicClient, tx.input);
            break;
          case Protocol.HyperSwapV3:
            swapInfo = await HyperSwapV3Dex.parseTransaction(publicClient, tx.input);
            break;
          case Protocol.KittenSwap:
          case Protocol.KittenSwapStable:
            swapInfo = await KittenSwapDex.parseTransaction(publicClient, tx.input);
            break;
          case Protocol.Shadow:
            swapInfo = await ShadowDex.parseTransaction(publicClient, tx.input);
            break;
          case Protocol.SwapX:
            swapInfo = await SwapXDex.parseTransaction(publicClient, tx.input);
            break;
        }

        if (swapInfo) {
          logger.info('Successfully parsed as a swap:');
          logger.info(`  Protocol: ${Protocol[swapInfo.protocol]}`);
          logger.info(`  Token In: ${swapInfo.tokenIn}`);
          logger.info(`  Token Out: ${swapInfo.tokenOut}`);
          logger.info(`  Amount In: ${swapInfo.amountIn}`);
          logger.info(`  Amount Out: ${swapInfo.amountOut}`);
          logger.info(`  Pool Address: ${swapInfo.poolAddress}`);
        } else {
          logger.info('Could not parse as a swap. Analyzing function signature...');
          analyzeInputData(tx.input);
        }
      } catch (error) {
        logger.error(`Error parsing transaction: ${error}`);
        logger.info('Analyzing function signature...');
        analyzeInputData(tx.input);
      }
    } else {
      logger.info(`Transaction is not to a known DEX router: ${to}`);
      logger.info('Analyzing function signature...');
      analyzeInputData(tx.input);
    }

    // Get transaction receipt for more details
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });

    logger.info('Transaction receipt:');
    logger.info(`  Status: ${receipt.status}`);
    logger.info(`  Gas Used: ${receipt.gasUsed}`);
    logger.info(`  Effective Gas Price: ${receipt.effectiveGasPrice}`);
    logger.info(`  Block Number: ${receipt.blockNumber}`);
    logger.info(`  Logs: ${receipt.logs.length}`);

    // Analyze logs
    if (receipt.logs.length > 0) {
      logger.info('Transaction logs:');
      for (let i = 0; i < receipt.logs.length; i++) {
        const log = receipt.logs[i];
        logger.info(`  Log ${i + 1}:`);
        logger.info(`    Address: ${log.address}`);
        logger.info(`    Topics: ${log.topics.join(', ')}`);
        logger.info(
          `    Data: ${log.data.length > 66 ? `${log.data.substring(0, 66)}...` : log.data}`
        );

        // Check for common event signatures
        if (log.topics.length > 0) {
          const eventSignature = log.topics[0];
          if (
            eventSignature === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
          ) {
            logger.info('    Event: Transfer (ERC20)');
          } else if (
            eventSignature === '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925'
          ) {
            logger.info('    Event: Approval (ERC20)');
          } else if (
            eventSignature === '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822'
          ) {
            logger.info('    Event: Swap (Uniswap V2)');
          } else if (
            eventSignature === '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67'
          ) {
            logger.info('    Event: Swap (Uniswap V3)');
          }
        }
      }
    }
  } catch (error) {
    logger.error(`Error analyzing transaction: ${error}`);
  }
}

/**
 * Analyze transaction input data
 * @param input Transaction input data
 */
function analyzeInputData(input: string) {
  // Check function signature
  const signature = input.slice(0, 10);
  const functionName = DEX_SIGNATURES[signature];

  if (functionName) {
    logger.info(`Function signature: ${signature} (${functionName})`);

    // Analyze parameters based on function signature
    if (signature === '0x38ed1739' || signature === '0x8803dbee' || signature === '0x18cbafe5') {
      // Format: swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)
      try {
        // Skip function signature (4 bytes) and get the first parameter (amountIn)
        const amountInHex = `0x${input.slice(10, 74)}`;
        const amountIn = BigInt(amountInHex);
        logger.info(`  AmountIn: ${amountIn}`);

        // Get the second parameter (amountOutMin)
        const amountOutMinHex = `0x${input.slice(74, 138)}`;
        const amountOutMin = BigInt(amountOutMinHex);
        logger.info(`  AmountOutMin: ${amountOutMin}`);

        // Skip to the path parameter (offset 3*32 bytes from the start of parameters)
        const pathOffsetHex = `0x${input.slice(138, 202)}`;
        const pathOffset = Number(BigInt(pathOffsetHex));

        // Path array length is at the offset
        const pathLengthHex = `0x${input.slice(10 + pathOffset * 2, 10 + (pathOffset + 32) * 2)}`;
        const pathLength = Number(BigInt(pathLengthHex));
        logger.info(`  Path length: ${pathLength}`);

        // Extract all tokens in the path
        const path = [];
        for (let i = 0; i < pathLength; i++) {
          const tokenHex = `0x${input
            .slice(10 + (pathOffset + 32 + i * 32) * 2, 10 + (pathOffset + 64 + i * 32) * 2)
            .slice(24)}`;
          path.push(`0x${tokenHex}`);
        }
        logger.info(`  Path: ${path.join(' -> ')}`);

        // Get the recipient address
        const recipientOffsetHex = `0x${input.slice(202, 266)}`;
        const recipientOffset = Number(BigInt(recipientOffsetHex));
        const recipientHex = `0x${input.slice(10 + recipientOffset * 2, 10 + (recipientOffset + 32) * 2).slice(24)}`;
        logger.info(`  Recipient: 0x${recipientHex}`);

        // Get the deadline
        const deadlineHex = `0x${input.slice(266, 330)}`;
        const deadline = BigInt(deadlineHex);
        logger.info(`  Deadline: ${deadline}`);
      } catch (error) {
        logger.error(`Error parsing V2 swap parameters: ${error}`);
      }
    } else if (signature === '0x414bf389') {
      // Format: exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96))
      try {
        // Extract parameters from input data
        const tokenInHex = `0x${input.slice(34, 74)}`;
        const tokenOutHex = `0x${input.slice(98, 138)}`;
        const feeHex = `0x${input.slice(138, 202)}`;
        const recipientHex = `0x${input.slice(202, 266)}`;
        const deadlineHex = `0x${input.slice(266, 330)}`;
        const amountInHex = `0x${input.slice(330, 394)}`;
        const amountOutMinimumHex = `0x${input.slice(394, 458)}`;

        logger.info(`  TokenIn: ${tokenInHex}`);
        logger.info(`  TokenOut: ${tokenOutHex}`);
        logger.info(`  Fee: ${Number(BigInt(feeHex))}`);
        logger.info(`  Recipient: ${recipientHex}`);
        logger.info(`  Deadline: ${BigInt(deadlineHex)}`);
        logger.info(`  AmountIn: ${BigInt(amountInHex)}`);
        logger.info(`  AmountOutMinimum: ${BigInt(amountOutMinimumHex)}`);
      } catch (error) {
        logger.error(`Error parsing V3 swap parameters: ${error}`);
      }
    }
  } else {
    logger.info(`Unknown function signature: ${signature}`);
    logger.info(`Input data: ${input.length > 100 ? `${input.substring(0, 100)}...` : input}`);
  }
}

/**
 * Main function
 */
async function main() {
  // Get transaction hash from command line arguments
  const args = process.argv.slice(2);

  if (args.length < 1) {
    logger.error('Usage: bun run src/arb/utils/analyze-transaction.ts <txHash>');
    process.exit(1);
  }

  const txHash = args[0];

  await analyzeTransaction(txHash);
}

// Run the main function
if (require.main === module) {
  main().catch((err) => {
    logger.error(`Error: ${err}`);
    process.exit(1);
  });
}
