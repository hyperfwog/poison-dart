mod arb;
mod collector;
mod common;
mod config;
mod defi;
mod executor;
mod pool_ids;
mod start_bot;
mod strategy;
mod test_graph;
mod types;

use clap::Parser;
use eyre::Result;
//use dotenv::dotenv;

pub const BUILD_VERSION: &str = version::build_version!();

#[derive(clap::Parser)]
pub struct Args {
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Clone, Debug, Parser)]
#[command(about = "Common configuration")]
pub struct HttpConfig {
    #[arg(long, env = "SUI_RPC_URL", default_value = "http://localhost:9000")]
    pub rpc_url: String,

    #[arg(long, help = "deprecated")]
    pub ipc_path: Option<String>,
}

#[derive(clap::Subcommand)]
pub enum Command {
    StartBot(start_bot::Args),
    Run(arb::Args),
    /// Generate a file with objectIDs of all pools and their underlying objects
    PoolIds(pool_ids::Args),
    /// Test the graph-based path finding algorithm with Bellman-Ford
    TestGraph(test_graph::Args),
}

#[tokio::main]
async fn main() -> Result<()> {
    // Load .env file into environment variables
    //dotenv().ok();

    let args = Args::parse();

    match args.command {
        Command::StartBot(args) => start_bot::run(args).await,
        Command::Run(args) => arb::run(args).await,
        Command::PoolIds(args) => pool_ids::run(args).await,
        Command::TestGraph(args) => test_graph::run(args).await,
    }
}
