//! Steps 2–3: stream the Lichess game database, count (position, move, result)
//! per rating band for the first 40 plies, then rebuild a pruned tree per band.
//!
//! A month holds ~100M games and most positions after move 10 are unique, so an
//! exact count would not fit in RAM. Counts use lossy counting (Manku & Motwani):
//! every `BUCKET` games of a band, entries too rare to ever reach the threshold
//! are dropped. Any count is low by at most `games / BUCKET` (≈10 at 3M games),
//! and nothing that could reach 50 games is lost before it gets there.

use crate::chess::{edge_key, epd, key, pack, uci_of, M16};
use crate::source::{self, Progress};
use ahash::AHashMap;
use anyhow::Result;
use pgn_reader::{RawTag, Reader, SanPlus, Visitor};
use serde::{Deserialize, Serialize};
use shakmaty::{Chess, Position};
use std::collections::VecDeque;
use std::ops::ControlFlow;
use std::sync::atomic::Ordering;
use std::time::Instant;

/// The bands the app ships by default. `ply-data build --bands` takes any list, e.g. adding 2200 and 2400.
pub const BANDS: [u32; 6] = [1000, 1200, 1400, 1600, 1800, 2000];
pub const PLIES: usize = 40;
const BUCKET: u64 = 300_000;

/// Band (index into `bands`) for a pair of ratings: both must sit in band−100 … band+99.
pub fn band_of(bands: &[u32], white: u32, black: u32) -> Option<usize> {
    bands.iter().position(|&b| (b - 100..=b + 99).contains(&white) && (b - 100..=b + 99).contains(&black))
}

/// "600+5" → estimated duration base + 40 × increment, in seconds. "-" is correspondence.
pub fn duration(tc: &str) -> Option<u32> {
    if tc == "-" {
        return Some(u32::MAX);
    }
    let (b, i) = tc.split_once('+')?;
    Some(b.parse::<u32>().ok()? + 40 * i.parse::<u32>().ok()?)
}

#[derive(Default)]
pub struct Tags {
    white: u32,
    black: u32,
    tc: u32,
    result: u8, // 1 white, 2 draw, 3 black
    rated: bool,
}

pub struct Moves {
    band: usize,
    result: u8,
    pos: Chess,
    path: Vec<(u64, M16)>,
}

pub struct Game {
    pub band: usize,
    pub result: u8,
    pub path: Vec<(u64, M16)>,
    pub last: u64,
}

pub struct Filter {
    pub bands: Vec<u32>,
    pub full: Vec<bool>,
}

impl Visitor for Filter {
    type Tags = Tags;
    type Movetext = Moves;
    type Output = Option<Game>;

    fn begin_tags(&mut self) -> ControlFlow<Self::Output, Self::Tags> {
        ControlFlow::Continue(Tags::default())
    }

    fn tag(&mut self, t: &mut Tags, name: &[u8], value: RawTag<'_>) -> ControlFlow<Self::Output> {
        let v = value.as_bytes();
        match name {
            b"WhiteElo" => t.white = std::str::from_utf8(v).ok().and_then(|s| s.parse().ok()).unwrap_or(0),
            b"BlackElo" => t.black = std::str::from_utf8(v).ok().and_then(|s| s.parse().ok()).unwrap_or(0),
            b"TimeControl" => t.tc = std::str::from_utf8(v).ok().and_then(duration).unwrap_or(0),
            b"Event" => t.rated = v.windows(5).any(|w| w == b"Rated"),
            b"Result" => {
                t.result = match v {
                    b"1-0" => 1,
                    b"1/2-1/2" => 2,
                    b"0-1" => 3,
                    _ => 0,
                }
            }
            b"Variant" if v != b"Standard" => t.rated = false,
            _ => {}
        }
        ControlFlow::Continue(())
    }

    fn begin_movetext(&mut self, t: Tags) -> ControlFlow<Self::Output, Self::Movetext> {
        if !t.rated || t.result == 0 || t.tc < 180 {
            return ControlFlow::Break(None);
        }
        match band_of(&self.bands, t.white, t.black) {
            Some(b) if !self.full[b] => ControlFlow::Continue(Moves { band: b, result: t.result, pos: Chess::default(), path: Vec::with_capacity(PLIES) }),
            _ => ControlFlow::Break(None),
        }
    }

    fn san(&mut self, mv: &mut Moves, san: SanPlus) -> ControlFlow<Self::Output> {
        if mv.path.len() >= PLIES {
            return ControlFlow::Break(Some(finish(mv)));
        }
        match san.san.to_move(&mv.pos) {
            Ok(m) => {
                mv.path.push((key(&mv.pos), pack(&m)));
                mv.pos.play_unchecked(m);
                ControlFlow::Continue(())
            }
            Err(_) => ControlFlow::Break(None),
        }
    }

    fn begin_variation(&mut self, _: &mut Moves) -> ControlFlow<Self::Output, pgn_reader::Skip> {
        ControlFlow::Continue(pgn_reader::Skip(true))
    }

    fn end_game(&mut self, mv: Moves) -> Self::Output {
        Some(finish(&mv))
    }
}

fn finish(mv: &Moves) -> Game {
    Game { band: mv.band, result: mv.result, path: mv.path.clone(), last: key(&mv.pos) }
}

#[derive(Clone, Copy, Default)]
struct NodeC {
    n: u32,
    delta: u32,
}
#[derive(Clone, Copy, Default)]
struct EdgeC {
    n: u32,
    w: u32,
    d: u32,
    b: u32,
    delta: u32,
}

#[derive(Default)]
pub struct Counts {
    nodes: AHashMap<u64, NodeC>,
    edges: AHashMap<u64, EdgeC>,
    pub games: u64,
}

impl Counts {
    fn bucket(&self) -> u32 {
        (self.games / BUCKET + 1) as u32
    }

    pub fn add(&mut self, g: &Game) {
        self.games += 1;
        let b = self.bucket();
        let mut bump = |k: u64| {
            let e = self.nodes.entry(k).or_insert(NodeC { n: 0, delta: b - 1 });
            e.n += 1;
        };
        for &(k, _) in &g.path {
            bump(k);
        }
        bump(g.last);
        for &(k, m) in &g.path {
            let e = self.edges.entry(edge_key(k, m)).or_insert(EdgeC { delta: b - 1, ..Default::default() });
            e.n += 1;
            match g.result {
                1 => e.w += 1,
                2 => e.d += 1,
                _ => e.b += 1,
            }
        }
        if self.games % BUCKET == 0 {
            self.nodes.retain(|_, v| v.n + v.delta > b);
            self.edges.retain(|_, v| v.n + v.delta > b);
        }
    }

    pub fn node(&self, k: u64) -> u32 {
        self.nodes.get(&k).map(|v| v.n).unwrap_or(0)
    }
    fn edge(&self, k: u64, m: M16) -> Option<EdgeC> {
        self.edges.get(&edge_key(k, m)).copied()
    }
    pub fn sizes(&self) -> (usize, usize) {
        (self.nodes.len(), self.edges.len())
    }
}

/// One node of a band's tree before evaluation.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RawNode {
    pub epd: String,
    pub g: u32,
    pub ply: u8,
    /// [uci, games, white wins, draws, black wins], most played first
    pub m: Vec<(String, u32, u32, u32, u32)>,
}

/// Rebuild the tree by walking from the start position along counted edges.
/// A node is kept when at least `min_games` reach it; a move is listed when
/// at least `min_edge` games played it (its child may still be below the cut).
pub fn rebuild(c: &Counts, min_games: u32, min_edge: u32) -> Vec<RawNode> {
    let mut out = Vec::new();
    let mut seen = ahash::AHashSet::new();
    let mut q = VecDeque::new();
    let start = Chess::default();
    seen.insert(key(&start));
    q.push_back((start, 0u8));
    while let Some((pos, ply)) = q.pop_front() {
        let k = key(&pos);
        let g = c.node(k);
        let mut moves = Vec::new();
        if (ply as usize) < PLIES {
            for m in pos.legal_moves() {
                let p = pack(&m);
                if let Some(e) = c.edge(k, p) {
                    if e.n < min_edge {
                        continue;
                    }
                    moves.push((uci_of(p), e.n, e.w, e.d, e.b));
                    let mut child = pos.clone();
                    child.play_unchecked(m);
                    let ck = key(&child);
                    if c.node(ck) >= min_games && seen.insert(ck) {
                        q.push_back((child, ply + 1));
                    }
                }
            }
        }
        moves.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
        out.push(RawNode { epd: epd(&pos), g, ply, m: moves });
    }
    out
}

/// Re-cut an already rebuilt tree at a higher minimum (for the size budget).
pub fn recut(nodes: &[RawNode], min_games: u32) -> Vec<RawNode> {
    let idx: AHashMap<&str, &RawNode> = nodes.iter().map(|n| (n.epd.as_str(), n)).collect();
    let mut out = Vec::new();
    let mut seen = ahash::AHashSet::new();
    let mut q = VecDeque::new();
    if let Some(root) = nodes.first() {
        seen.insert(root.epd.clone());
        q.push_back(root);
    }
    while let Some(n) = q.pop_front() {
        let pos = crate::chess::parse(&n.epd).unwrap();
        for (u, ..) in &n.m {
            if let Some(m) = crate::chess::parse_uci(&pos, u) {
                let mut child = pos.clone();
                child.play_unchecked(m);
                let ce = epd(&child);
                if let Some(cn) = idx.get(ce.as_str()) {
                    if cn.g >= min_games && seen.insert(ce) {
                        q.push_back(cn);
                    }
                }
            }
        }
        out.push(n.clone());
    }
    out
}

pub struct StreamOpts {
    pub max_per_band: u64,
    pub limit_games: u64,
}

/// Stream all games once, filling every band until it is full (or the file ends).
pub fn count(srcs: &[String], opts: &StreamOpts, band_list: &[u32]) -> Result<Vec<Counts>> {
    let progress = Progress::default();
    let input = source::zstd_chain(srcs.to_vec(), progress.clone())?;
    let mut reader = Reader::new(input);
    let mut bands: Vec<Counts> = (0..band_list.len()).map(|_| Counts::default()).collect();
    let mut filter = Filter { bands: band_list.to_vec(), full: vec![false; band_list.len()] };
    let t0 = Instant::now();
    let mut seen: u64 = 0;
    let mut last_report = Instant::now();
    loop {
        let g = match reader.read_game(&mut filter) {
            Ok(Some(g)) => g,
            Ok(None) => break,
            Err(e) => {
                eprintln!("  pgn read error: {e}; stopping the game stream here");
                break;
            }
        };
        seen += 1;
        if let Some(g) = g {
            if !g.path.is_empty() {
                let c = &mut bands[g.band];
                c.add(&g);
                if c.games >= opts.max_per_band {
                    filter.full[g.band] = true;
                }
            }
        }
        if filter.full.iter().all(|f| *f) || (opts.limit_games > 0 && seen >= opts.limit_games) {
            break;
        }
        if last_report.elapsed().as_secs() >= 30 {
            last_report = Instant::now();
            let mb = progress.load(Ordering::Relaxed) >> 20;
            let per: Vec<String> = bands.iter().map(|c| format!("{}k", c.games / 1000)).collect();
            let (n, e) = bands.iter().fold((0, 0), |a, c| (a.0 + c.sizes().0, a.1 + c.sizes().1));
            eprintln!(
                "  games {:>6}k read, {} MB in, {:.1} MB/s · per band {} · {}M nodes {}M edges in memory",
                seen / 1000,
                mb,
                mb as f64 / t0.elapsed().as_secs_f64(),
                per.join(" "),
                n / 1_000_000,
                e / 1_000_000
            );
        }
    }
    eprintln!("  read {seen} games in {:.0} s", t0.elapsed().as_secs_f64());
    Ok(bands)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn band_windows() {
        assert_eq!(band_of(&BANDS, 1150, 1290), Some(1)); // 1200 band: 1100–1299
        assert_eq!(band_of(&BANDS, 1099, 1100), None); // straddles 1000 and 1200
        assert_eq!(band_of(&BANDS, 900, 1099), Some(0));
        assert_eq!(band_of(&BANDS, 2099, 1900), Some(5));
        assert_eq!(band_of(&BANDS, 2100, 2100), None);
        assert_eq!(band_of(&BANDS, 899, 950), None);
        // higher bands work the same way
        let high = [2200, 2400, 2600];
        assert_eq!(band_of(&high, 2150, 2299), Some(0));
        assert_eq!(band_of(&high, 2450, 2400), Some(1));
        assert_eq!(band_of(&high, 2299, 2300), None);
    }

    #[test]
    fn bullet_is_filtered() {
        assert_eq!(duration("60+0"), Some(60));
        assert_eq!(duration("120+1"), Some(160)); // still bullet
        assert_eq!(duration("180+0"), Some(180)); // 3+0 blitz is in
        assert!(duration("-").unwrap() >= 180);
    }

    fn games(pgn: &str) -> Vec<Game> {
        let mut r = Reader::new(std::io::Cursor::new(pgn.as_bytes().to_vec()));
        let mut f = Filter { bands: BANDS.to_vec(), full: vec![false; BANDS.len()] };
        let mut out = vec![];
        while let Some(g) = r.read_game(&mut f).unwrap() {
            if let Some(g) = g {
                out.push(g);
            }
        }
        out
    }

    #[test]
    fn filter_and_count() {
        let one = |w: u32, b: u32, tc: &str, res: &str, moves: &str| {
            format!("[Event \"Rated Blitz game\"]\n[WhiteElo \"{w}\"]\n[BlackElo \"{b}\"]\n[TimeControl \"{tc}\"]\n[Result \"{res}\"]\n\n{moves} {res}\n\n")
        };
        let pgn = [
            one(1200, 1210, "300+0", "1-0", "1. e4 e5 2. Nf3 Nc6 3. Bc4"),
            one(1200, 1210, "300+0", "0-1", "1. e4 e5 2. Nf3 Nf6"),
            one(1200, 1650, "300+0", "1-0", "1. d4 d5"), // different bands
            one(1200, 1210, "60+0", "1-0", "1. d4 d5"),  // bullet
            one(1200, 1210, "600+0", "1/2-1/2", "1. e4 c5"),
        ]
        .concat();
        let gs = games(&pgn);
        assert_eq!(gs.len(), 3);
        let mut c = Counts::default();
        for g in &gs {
            c.add(g);
        }
        let tree = rebuild(&c, 1, 1);
        let root = &tree[0];
        assert_eq!(root.g, 3);
        assert_eq!(root.m[0], ("e2e4".to_string(), 3, 1, 1, 1));
        let after_e4 = tree.iter().find(|n| n.ply == 1).unwrap();
        assert_eq!(after_e4.m.len(), 2);
        assert_eq!(after_e4.m[0].0, "e7e5");
        // with a threshold of 2 games the single-game branches are cut
        let cut = rebuild(&c, 2, 1);
        assert!(cut.iter().all(|n| n.g >= 2 || n.ply == 0));
    }
}
