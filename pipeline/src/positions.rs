//! `ply-data positions`: how many distinct positions (and position + move pairs) the shipped band
//! trees hold, and how many reach a game count. It sets the size of any per-position work later,
//! such as pre-written explanations; it generates nothing itself.
//!
//! Positions are keyed by EPD (the FEN without the move counters), which is how the trees are keyed,
//! so transpositions and the same position in several bands count once. A position's games are
//! counted two ways: the most in any one band, and the sum over all bands.

use ahash::AHashMap;
use anyhow::{Context, Result};
use flate2::read::GzDecoder;
use serde::Deserialize;
use std::io::BufReader;
use std::path::Path;

#[derive(Deserialize)]
pub struct Node {
    pub g: u64,
    #[serde(default)]
    pub m: Vec<(String, u64, u64, u64, u64)>,
}
pub type Tree = std::collections::HashMap<String, Node>;

#[derive(Default, Debug, PartialEq)]
pub struct Counts {
    pub total: usize,
    /// at each threshold: (by the most games in one band, by games summed over the bands)
    pub at: Vec<(u64, usize, usize)>,
}

#[derive(Debug, PartialEq)]
pub struct Report {
    pub per_band: Vec<(u32, usize)>,
    pub positions: Counts,
    pub moves: Counts,
}

fn tally(map: &AHashMap<String, (u64, u64)>, thresholds: &[u64]) -> Counts {
    Counts {
        total: map.len(),
        at: thresholds
            .iter()
            .map(|&t| (t, map.values().filter(|v| v.0 >= t).count(), map.values().filter(|v| v.1 >= t).count()))
            .collect(),
    }
}

pub fn count(trees: &[(u32, Tree)], thresholds: &[u64]) -> Report {
    // key → (most in one band, sum over bands)
    let mut pos: AHashMap<String, (u64, u64)> = AHashMap::new();
    let mut mv: AHashMap<String, (u64, u64)> = AHashMap::new();
    for (_, t) in trees {
        for (epd, n) in t {
            let e = pos.entry(epd.clone()).or_default();
            e.0 = e.0.max(n.g);
            e.1 += n.g;
            for (u, g, ..) in &n.m {
                let e = mv.entry(format!("{epd}|{u}")).or_default();
                e.0 = e.0.max(*g);
                e.1 += g;
            }
        }
    }
    Report { per_band: trees.iter().map(|(b, t)| (*b, t.len())).collect(), positions: tally(&pos, thresholds), moves: tally(&mv, thresholds) }
}

pub fn read_tree(path: &Path) -> Result<Tree> {
    let f = std::fs::File::open(path).with_context(|| format!("open {}", path.display()))?;
    Ok(serde_json::from_reader(BufReader::new(GzDecoder::new(f)))?)
}

pub fn print(r: &Report) {
    println!("Positions per band tree:");
    for (b, n) in &r.per_band {
        println!("  {b}: {n}");
    }
    for (name, c) in [("Distinct positions (EPD)", &r.positions), ("Distinct position + move pairs", &r.moves)] {
        println!("\n{name}: {}", c.total);
        println!("  {:>8}  {:>18}  {:>18}", "games ≥", "in one band", "summed over bands");
        for (t, one, sum) in &c.at {
            println!("  {t:>8}  {one:>18}  {sum:>18}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tree(nodes: &[(&str, u64, &[(&str, u64)])]) -> Tree {
        nodes.iter().map(|(e, g, m)| (e.to_string(), Node { g: *g, m: m.iter().map(|(u, g)| (u.to_string(), *g, 0, 0, 0)).collect() })).collect()
    }

    #[test]
    fn counts_each_position_once_across_bands() {
        let a = tree(&[("start", 1000, &[("e2e4", 600), ("d2d4", 400)]), ("e4", 600, &[("e7e5", 300)])]);
        let b = tree(&[("start", 900, &[("e2e4", 500)]), ("e4", 500, &[]), ("d4", 120, &[])]);
        let r = count(&[(1000, a), (1200, b)], &[50, 200, 1000]);
        assert_eq!(r.per_band, vec![(1000, 2), (1200, 3)]);
        assert_eq!(r.positions.total, 3);
        // start: max 1000 / sum 1900; e4: 600 / 1100; d4: 120 / 120
        assert_eq!(r.positions.at, vec![(50, 3, 3), (200, 2, 2), (1000, 1, 2)]);
        // start|e2e4 600/1100, start|d2d4 400/400, e4|e7e5 300/300
        assert_eq!(r.moves.total, 3);
        assert_eq!(r.moves.at, vec![(50, 3, 3), (200, 3, 3), (1000, 0, 1)]);
    }
}
