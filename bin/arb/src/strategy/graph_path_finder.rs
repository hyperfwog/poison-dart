use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use eyre::Result;
use sui_sdk::SUI_COIN_TYPE;
use sui_types::base_types::ObjectID;
use tracing::{debug, info};
use utils::coin;

use crate::defi::{Dex, Path, DexSearcher};

/// Represents a node in the arbitrage graph
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Node {
    token_type: String,
}

/// Represents an edge in the arbitrage graph
#[derive(Debug, Clone)]
pub struct Edge {
    from: Node,
    to: Node,
    dex: Box<dyn Dex>,
    weight: f64, // Negative log of the exchange rate
}

/// A graph representation of the DEX ecosystem
#[derive(Debug)]
pub struct ArbitrageGraph {
    nodes: HashSet<Node>,
    edges: HashMap<Node, Vec<Edge>>,
}

impl ArbitrageGraph {
    /// Create a new arbitrage graph from DEX searcher
    pub async fn new(dex_searcher: Arc<dyn DexSearcher>) -> Result<Self> {
        let mut graph = Self {
            nodes: HashSet::new(),
            edges: HashMap::new(),
        };
        
        // Add SUI as a node
        let sui_node = Node { token_type: SUI_COIN_TYPE.to_string() };
        graph.nodes.insert(sui_node);
        
        // Start building the graph from SUI
        graph.build_graph(dex_searcher.clone(), &SUI_COIN_TYPE).await?;
        
        // Find other tokens to add to the graph
        let sui_dexes = dex_searcher.find_dexes(&SUI_COIN_TYPE, None).await?;
        for dex in sui_dexes {
            let token_type = dex.coin_out_type();
            if !coin::is_native_coin(&token_type) {
                graph.build_graph(dex_searcher.clone(), &token_type).await?;
            }
        }
        
        info!("Built arbitrage graph with {} nodes and {} edges", 
            graph.nodes.len(), 
            graph.edges.values().map(|v| v.len()).sum::<usize>());
        
        Ok(graph)
    }
    
    /// Build the graph starting from a token
    async fn build_graph(&mut self, dex_searcher: Arc<dyn DexSearcher>, start_token: &str) -> Result<()> {
        let mut visited = HashSet::new();
        let mut queue = vec![start_token.to_string()];
        
        while let Some(token_type) = queue.pop() {
            if visited.contains(&token_type) {
                continue;
            }
            visited.insert(token_type.clone());
            
            // Add node for this token
            let node = Node { token_type: token_type.clone() };
            self.nodes.insert(node.clone());
            
            // Find DEXes for this token
            let dexes = match dex_searcher.find_dexes(&token_type, None).await {
                Ok(dexes) => dexes,
                Err(_) => continue,
            };
            
            // Add edges for each DEX
            for dex in dexes {
                let out_token = dex.coin_out_type();
                let to_node = Node { token_type: out_token.clone() };
                
                // Add the destination node
                self.nodes.insert(to_node.clone());
                
                // Calculate the weight (negative log of exchange rate)
                // For now, we'll use a placeholder - in reality, this would be based on pool data
                let weight = -1.0; // Placeholder
                
                // Add the edge
                let edge = Edge { 
                    from: node.clone(), 
                    to: to_node, 
                    dex: dex.clone(), 
                    weight 
                };
                
                self.edges.entry(node.clone()).or_insert_with(Vec::new).push(edge);
                
                // Add the out token to the queue if not visited
                if !visited.contains(&out_token) {
                    queue.push(out_token);
                }
            }
        }
        
        Ok(())
    }
    
    /// Find negative cycles in the graph using Bellman-Ford algorithm
    /// These cycles represent arbitrage opportunities
    pub fn find_arbitrage_opportunities(&self, start_token: &str) -> Vec<Vec<Edge>> {
        let start_node = Node { token_type: start_token.to_string() };
        if !self.nodes.contains(&start_node) {
            debug!("Start token {} not found in graph", start_token);
            return Vec::new();
        }
        
        // Initialize distance map
        let mut distances: HashMap<Node, f64> = HashMap::new();
        let mut predecessors: HashMap<Node, Option<(Node, Edge)>> = HashMap::new();
        
        // Set initial distances
        for node in &self.nodes {
            distances.insert(node.clone(), if node == &start_node { 0.0 } else { f64::INFINITY });
            predecessors.insert(node.clone(), None);
        }
        
        // Relax edges |V| - 1 times
        let node_count = self.nodes.len();
        for _ in 0..node_count - 1 {
            let mut updated = false;
            
            for (node, edges) in &self.edges {
                let node_dist = *distances.get(node).unwrap();
                if node_dist == f64::INFINITY {
                    continue;
                }
                
                for edge in edges {
                    let to_dist = *distances.get(&edge.to).unwrap();
                    let new_dist = node_dist + edge.weight;
                    
                    if new_dist < to_dist {
                        distances.insert(edge.to.clone(), new_dist);
                        predecessors.insert(edge.to.clone(), Some((node.clone(), edge.clone())));
                        updated = true;
                    }
                }
            }
            
            if !updated {
                break;
            }
        }
        
        // Check for negative cycles
        let mut negative_cycles = Vec::new();
        
        for (node, edges) in &self.edges {
            let node_dist = *distances.get(node).unwrap();
            if node_dist == f64::INFINITY {
                continue;
            }
            
            for edge in edges {
                let to_dist = *distances.get(&edge.to).unwrap();
                let new_dist = node_dist + edge.weight;
                
                if new_dist < to_dist {
                    // Found a negative cycle
                    let cycle = self.extract_cycle(&edge.to, &predecessors);
                    if !cycle.is_empty() {
                        negative_cycles.push(cycle);
                    }
                }
            }
        }
        
        debug!("Found {} negative cycles", negative_cycles.len());
        negative_cycles
    }
    
    /// Extract a cycle from the predecessor map
    fn extract_cycle(&self, node: &Node, predecessors: &HashMap<Node, Option<(Node, Edge)>>) -> Vec<Edge> {
        let mut cycle = Vec::new();
        let mut visited = HashSet::new();
        let mut current = node.clone();
        
        while !visited.contains(&current) {
            visited.insert(current.clone());
            
            if let Some((pred, edge)) = predecessors.get(&current).unwrap() {
                cycle.push(edge.clone());
                current = pred.clone();
            } else {
                break;
            }
        }
        
        // Check if we have a valid cycle
        if cycle.len() > 1 && cycle.first().unwrap().from.token_type == cycle.last().unwrap().to.token_type {
            cycle.reverse();
            return cycle;
        }
        
        Vec::new()
    }
    
    /// Convert a cycle of edges to a Path
    pub fn cycle_to_path(&self, cycle: &[Edge]) -> Path {
        let dexes = cycle.iter().map(|edge| edge.dex.clone()).collect();
        Path::new(dexes)
    }
}

/// A path finder that uses the Bellman-Ford algorithm to find arbitrage opportunities
pub struct BellmanFordPathFinder {
    dex_searcher: Arc<dyn DexSearcher>,
}

impl BellmanFordPathFinder {
    /// Create a new Bellman-Ford path finder
    pub fn new(dex_searcher: Arc<dyn DexSearcher>) -> Self {
        Self { dex_searcher }
    }
    
    /// Find arbitrage paths starting from the given token
    pub async fn find_arbitrage_paths(&self, start_token: &str, pool_id: Option<ObjectID>) -> Result<Vec<Path>> {
        // Build the graph
        let graph = ArbitrageGraph::new(self.dex_searcher.clone()).await?;
        
        // Find negative cycles
        let cycles = graph.find_arbitrage_opportunities(start_token);
        
        // Convert cycles to paths
        let mut paths = Vec::new();
        for cycle in cycles {
            let path = graph.cycle_to_path(&cycle);
            
            // Filter by pool_id if specified
            if let Some(pool_id) = pool_id {
                if path.contains_pool(Some(pool_id)) {
                    paths.push(path);
                }
            } else {
                paths.push(path);
            }
        }
        
        Ok(paths)
    }
}
