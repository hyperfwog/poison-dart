/**
 * Utility script to analyze transaction data and identify potential DEX routers
 */
import { http, createPublicClient } from 'viem';
import { Logger } from '../../libs/logger';
import { CHAINS, DEX_CONTRACTS, loadConfig } from '../config';

// Create a logger instance
const logger = Logger.forContext('RouterAnalyzer');

// Common DEX function signatures
const DEX_SIGNATURES = {
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
const KNOWN_ROUTERS = new Map<string, string>();

// Initialize known routers
function initializeKnownRouters() {
  // Add all known routers to the map with their protocol names
  KNOWN_ROUTERS.set(DEX_CONTRACTS.HYPERSWAP.V2_ROUTER.toLowerCase(), 'HyperSwap V2');
  KNOWN_ROUTERS.set(DEX_CONTRACTS.HYPERSWAP.V3_ROUTER.toLowerCase(), 'HyperSwap V3');
  KNOWN_ROUTERS.set(DEX_CONTRACTS.KITTENSWAP.ROUTER.toLowerCase(), 'KittenSwap');
  KNOWN_ROUTERS.set(DEX_CONTRACTS.SHADOW.ROUTER.toLowerCase(), 'Shadow');
  KNOWN_ROUTERS.set(DEX_CONTRACTS.SWAPX.ROUTER.toLowerCase(), 'SwapX');

  logger.info(`Initialized ${KNOWN_ROUTERS.size} known DEX routers`);
}

// Track potential DEX routers
const potentialDexRouters = new Map<
  string,
  {
    count: number;
    signatures: Set<string>;
    signatureNames: Set<string>;
    txHashes: Set<string>;
  }
>();

/**
 * Analyze a block range for potential DEX routers
 * @param startBlock Start block number
 * @param endBlock End block number
 */
async function analyzeBlockRange(startBlock: bigint, endBlock: bigint) {
  logger.info(`Analyzing blocks from ${startBlock} to ${endBlock}...`);

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

  // Process each block
  for (let blockNumber = startBlock; blockNumber <= endBlock; blockNumber++) {
    try {
      // Get block with transactions
      const block = await publicClient.getBlock({
        blockNumber,
        includeTransactions: true,
      });

      logger.info(`Processing block ${blockNumber} with ${block.transactions.length} transactions`);

      // Process each transaction
      for (const tx of block.transactions) {
        // Skip if transaction has no input data or no 'to' address
        if (!tx.input || tx.input === '0x' || !tx.to) {
          continue;
        }

        const to = tx.to.toLowerCase();

        // Skip if it's a known router
        if (KNOWN_ROUTERS.has(to)) {
          continue;
        }

        // Check if the transaction contains a DEX function signature
        const signature = tx.input.slice(0, 10);
        const functionName = DEX_SIGNATURES[signature as keyof typeof DEX_SIGNATURES];

        if (functionName) {
          // This might be a DEX router
          if (!potentialDexRouters.has(to)) {
            potentialDexRouters.set(to, {
              count: 0,
              signatures: new Set<string>(),
              signatureNames: new Set<string>(),
              txHashes: new Set<string>(),
            });
          }

          const routerInfo = potentialDexRouters.get(to)!;
          routerInfo.count++;
          routerInfo.signatures.add(signature);
          routerInfo.signatureNames.add(functionName);
          routerInfo.txHashes.add(tx.hash);
        }
      }
    } catch (error) {
      logger.error(`Error processing block ${blockNumber}: ${error}`);
    }
  }

  // Print results
  logger.info(`Analysis complete. Found ${potentialDexRouters.size} potential DEX routers.`);

  // Sort by count
  const sortedRouters = Array.from(potentialDexRouters.entries()).sort(
    (a, b) => b[1].count - a[1].count
  );

  // Print top 20 potential DEX routers
  logger.info('Top potential DEX routers:');
  for (let i = 0; i < Math.min(20, sortedRouters.length); i++) {
    const [address, info] = sortedRouters[i];
    logger.info(`${i + 1}. ${address} - ${info.count} transactions`);
    logger.info(`   Function signatures: ${Array.from(info.signatureNames).join(', ')}`);
    logger.info(`   Transaction hashes: ${Array.from(info.txHashes).join(', ')}`);
  }
}

/**
 * Main function
 */
async function main() {
  // Get block range from command line arguments
  const args = process.argv.slice(2);

  if (args.length < 2) {
    logger.error('Usage: bun run src/arb/utils/analyze-routers.ts <startBlock> <endBlock>');
    process.exit(1);
  }

  const startBlock = BigInt(args[0]);
  const endBlock = BigInt(args[1]);

  await analyzeBlockRange(startBlock, endBlock);
}

// Run the main function
if (require.main === module) {
  main().catch((err) => {
    logger.error(`Error: ${err}`);
    process.exit(1);
  });
}
