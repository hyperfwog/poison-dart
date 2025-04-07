use std::sync::Arc;
use clap::Parser;
use eyre::Result;
use tracing::{info, debug};
use dex_indexer::DexIndexer;
use sui_sdk::SUI_COIN_TYPE;
use sui_types::base_types::ObjectID;
use object_pool::ObjectPool;
use simulator;

use crate::{
    HttpConfig,
    strategy::graph_path_finder::BellmanFordPathFinder,
    defi::DexSearcher,
    defi::IndexerDexSearcher,
};

#[derive(Clone, Debug, Parser)]
pub struct Args {
    #[arg(long, help = "Start token type (default is SUI)", default_value = SUI_COIN_TYPE)]
    pub start_token: String,

    #[arg(long, help = "Pool ID to include in the path (optional)")]
    pub pool_id: Option<String>,

    #[arg(long, help = "Maximum number of paths to display", default_value = "10")]
    pub max_paths: usize,

    #[command(flatten)]
    pub http_config: HttpConfig,
}

pub async fn run(args: Args) -> Result<()> {
    mev_logger::init_console_logger_with_directives(None, &["arb=debug", "dex_indexer=debug"]);

    info!("Testing graph-based path finding with Bellman-Ford algorithm");
    info!("Loading DEX indexer...");
    
    // Clone the RPC URL for later use
    let rpc_url_indexer = args.http_config.rpc_url.clone();
    let rpc_url_searcher = args.http_config.rpc_url.clone();
    let rpc_url_simulator = args.http_config.rpc_url.clone();
    
    // Initialize the DEX indexer
    let indexer = Arc::new(DexIndexer::new(&rpc_url_indexer).await?);
    
    // Create a simulator pool for the DexSearcher
    let simulator_pool = Arc::new(ObjectPool::new(4, move || {
        let rpc_url_clone = rpc_url_simulator.clone();
        tokio::runtime::Runtime::new()
            .unwrap()
            .block_on(async { 
                Box::new(simulator::HttpSimulator::new(&rpc_url_clone, &None).await) as Box<dyn simulator::Simulator> 
            })
    }));
    
    // Create a DexSearcher from the indexer
    let dex_searcher = Arc::new(IndexerDexSearcher::new_with_indexer(
        &rpc_url_searcher, 
        indexer.clone(), 
        simulator_pool
    ).await?) as Arc<dyn DexSearcher>;
    
    // Initialize the Bellman-Ford path finder
    let path_finder = BellmanFordPathFinder::new(dex_searcher);
    
    // Parse pool ID if provided
    let pool_id = if let Some(pool_id_str) = args.pool_id {
        Some(ObjectID::from_hex_literal(&pool_id_str)?)
    } else {
        None
    };
    
    // Find arbitrage paths
    info!("Finding arbitrage paths starting from {}...", args.start_token);
    let paths = path_finder.find_arbitrage_paths(&args.start_token, pool_id).await?;
    
    // Display results
    if paths.is_empty() {
        info!("No arbitrage paths found");
    } else {
        info!("Found {} arbitrage paths", paths.len());
        
        // Display the paths (limited by max_paths)
        for (i, path) in paths.iter().take(args.max_paths).enumerate() {
            info!("Path {}: {:?}", i + 1, path);
            
            // Display detailed information about each DEX in the path
            for (j, dex) in path.path.iter().enumerate() {
                debug!("  Step {}: {} -> {} via {} ({})",
                    j + 1,
                    dex.coin_in_type(),
                    dex.coin_out_type(),
                    dex.protocol(),
                    dex.object_id()
                );
            }
        }
        
        if paths.len() > args.max_paths {
            info!("... and {} more paths", paths.len() - args.max_paths);
        }
    }
    
    Ok(())
}
