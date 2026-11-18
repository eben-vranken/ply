//! `ply-data ideas`: what a move stops (docs/ROADMAP.md, phase 5c).
//!
//! For every position in the band trees, Stockfish looks at it as if the side to move passed: the
//! opponent's best move then is the threat. When it gains them at least `THREAT_CP` over the
//! position's own eval, each common move there is checked against it: a move stops the threat
//! when the threat is illegal afterwards, or is no longer the opponent's best move. The app turns
//! this into "Stops …Bg4, which would pin the knight to the queen" when a move is learned.
//!
//! Reads the built trees (`app/public/data`), so it runs without the game or eval databases.
//! Searches are cached as JSON lines; a re-run only searches what is new.

use crate::chess::{parse, parse_uci};
use crate::emit;
use crate::evals::Engine;
use ahash::{AHashMap, AHashSet};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use shakmaty::Position;
use std::collections::BTreeMap;
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

/// A pass must give the opponent at least this much (centipawns) for their best move to be a threat.
pub const THREAT_CP: i32 = 100;
/// Moves checked against a threat: played in at least this share of games, or the default move.
const CANDIDATE_SHARE: f64 = 0.03;

#[derive(Deserialize)]
struct Node {
    g: u64,
    e: i32,
    #[serde(default)]
    d: String,
    #[serde(default)]
    m: Vec<(String, u64, u64, u64, u64)>,
}
type Tree = std::collections::HashMap<String, Node>;

/// One position's threat and the moves that stop it.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Idea {
    /// the opponent's best move if the side to move passed (UCI)
    pub t: String,
    /// what it would gain them, centipawns
    pub g: i32,
    /// common moves here that stop it
    pub s: Vec<String>,
}

#[derive(Serialize, Deserialize)]
struct Searched {
    epd: String,
    best: String,
    /// White's view
    cp: i32,
}

/// The position with the other side to move and no en passant: the side to move passes.
/// None when that is not a legal position (the side to move is in check).
pub fn null_move(epd: &str) -> Option<String> {
    let f: Vec<&str> = epd.split_whitespace().collect();
    if f.len() < 4 {
        return None;
    }
    let flipped = format!("{} {} {} -", f[0], if f[1] == "w" { "b" } else { "w" }, f[2]);
    parse(epd).filter(|p| !p.is_check())?;
    parse(&flipped).map(|_| flipped)
}

/// The threat after a pass, when it gains the opponent at least THREAT_CP over the position's eval.
pub fn threat(epd: &str, eval_white: i32, null_best: &str, null_cp_white: i32) -> Option<(String, i32)> {
    let they_white = epd.split(' ').nth(1) == Some("b");
    let theirs = |cp: i32| if they_white { cp } else { -cp };
    let gain = theirs(null_cp_white) - theirs(eval_white);
    (gain >= THREAT_CP && !null_best.is_empty()).then(|| (null_best.to_string(), gain))
}

/// Does `mv` stop the threat `t` at `epd`? Yes when `t` is illegal afterwards or no longer the best reply.
pub fn stops(epd: &str, mv: &str, t: &str, best_after: Option<&str>) -> Option<bool> {
    let mut p = parse(epd)?;
    let m = parse_uci(&p, mv)?;
    p.play_unchecked(m);
    if parse_uci(&p, t).is_none() {
        return Some(true);
    }
    best_after.map(|b| b != t)
}

fn child(epd: &str, mv: &str) -> Option<String> {
    let mut p = parse(epd)?;
    let m = parse_uci(&p, mv)?;
    p.play_unchecked(m);
    Some(crate::chess::epd(&p))
}

fn load_cache(path: &Path) -> AHashMap<String, (String, i32)> {
    let mut out = AHashMap::new();
    if let Ok(f) = File::open(path) {
        for l in BufReader::new(f).lines().map_while(|l| l.ok()) {
            if let Ok(s) = serde_json::from_str::<Searched>(&l) {
                out.insert(s.epd, (s.best, s.cp));
            }
        }
    }
    out
}

/// Search every position in `todo` (full positions, any side to move) and add them to `done`.
fn search_all(sf: &str, todo: Vec<String>, depth: u32, procs: usize, cache: &Path, done: &mut AHashMap<String, (String, i32)>) -> Result<()> {
    if todo.is_empty() {
        return Ok(());
    }
    let total = todo.len();
    let queue = Arc::new(Mutex::new(todo));
    let out = Arc::new(Mutex::new(BufWriter::new(OpenOptions::new().create(true).append(true).open(cache)?)));
    let results = Arc::new(Mutex::new(Vec::new()));
    let n = Arc::new(AtomicUsize::new(0));
    let t0 = Instant::now();
    let handles: Vec<_> = (0..procs)
        .map(|_| {
            let (queue, out, results, n, sf) = (queue.clone(), out.clone(), results.clone(), n.clone(), sf.to_string());
            std::thread::spawn(move || -> Result<()> {
                let mut eng = Engine::start(&sf, 1, 16)?;
                loop {
                    let Some(epd) = queue.lock().unwrap().pop() else { break };
                    let e = eng.eval(&epd, depth)?;
                    let s = Searched { epd, best: e.pv.first().cloned().unwrap_or_default(), cp: e.cp };
                    writeln!(out.lock().unwrap(), "{}", serde_json::to_string(&s)?)?;
                    results.lock().unwrap().push(s);
                    let k = n.fetch_add(1, Ordering::Relaxed) + 1;
                    if k % 5000 == 0 {
                        out.lock().unwrap().flush()?;
                        let rate = k as f64 / t0.elapsed().as_secs_f64();
                        eprintln!("  ideas: {k}/{total} ({rate:.0}/s, ~{:.0} min left)", (total - k) as f64 / rate / 60.0);
                    }
                }
                Ok(())
            })
        })
        .collect();
    for h in handles {
        h.join().unwrap()?;
    }
    out.lock().unwrap().flush()?;
    for s in results.lock().unwrap().drain(..) {
        done.insert(s.epd, (s.best, s.cp));
    }
    eprintln!("  ideas: {total} searches in {:.0} s", t0.elapsed().as_secs_f64());
    Ok(())
}

pub fn run(data: &Path, sf: &str, depth: u32, procs: usize, cache: &Path) -> Result<()> {
    let mpath = data.join("manifest.json");
    let mut manifest: emit::Manifest = serde_json::from_reader(File::open(&mpath).context("manifest.json")?)?;
    let mut trees: Vec<(u32, Tree)> = Vec::new();
    for &b in &manifest.bands {
        let f = File::open(data.join(format!("tree-{b}.json.gz")))?;
        trees.push((b, serde_json::from_reader(BufReader::new(flate2::read::GzDecoder::new(f)))?));
    }
    // every position once, with its eval and the moves worth checking (from any band)
    let mut eval: AHashMap<String, i32> = AHashMap::new();
    let mut cands: AHashMap<String, AHashSet<String>> = AHashMap::new();
    for (_, t) in &trees {
        for (epd, n) in t {
            eval.entry(epd.clone()).or_insert(n.e);
            let c = cands.entry(epd.clone()).or_default();
            if !n.d.is_empty() {
                c.insert(n.d.clone());
            }
            for (u, games, ..) in &n.m {
                if n.g > 0 && *games as f64 / n.g as f64 >= CANDIDATE_SHARE {
                    c.insert(u.clone());
                }
            }
        }
    }
    eprintln!("ideas: {} positions over {} bands", eval.len(), trees.len());
    if let Some(dir) = cache.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let mut done = load_cache(cache);
    // 1. each position after a pass
    let nulls: AHashMap<String, String> = eval.keys().filter_map(|e| null_move(e).map(|n| (e.clone(), n))).collect();
    let todo: Vec<String> = nulls.values().filter(|n| !done.contains_key(*n)).cloned().collect::<AHashSet<_>>().into_iter().collect();
    search_all(sf, todo, depth, procs, cache, &mut done)?;
    let threats: AHashMap<String, (String, i32)> = nulls
        .iter()
        .filter_map(|(e, n)| {
            let (best, cp) = done.get(n)?;
            threat(e, eval[e], best, *cp).map(|t| (e.clone(), t))
        })
        .collect();
    eprintln!("ideas: {} positions with a threat", threats.len());
    // 2. after each common move at a threat position: is the threat still the best reply?
    let mut after: Vec<String> = Vec::new();
    for (e, (t, _)) in &threats {
        for m in &cands[e] {
            if stops(e, m, t, None) == Some(true) {
                continue;
            }
            if let Some(q) = child(e, m) {
                if !done.contains_key(&q) {
                    after.push(q);
                }
            }
        }
    }
    after.sort();
    after.dedup();
    search_all(sf, after, depth, procs, cache, &mut done)?;
    let mut ideas: AHashMap<String, Idea> = AHashMap::new();
    for (e, (t, g)) in &threats {
        let mut s: Vec<String> = cands[e]
            .iter()
            .filter(|m| {
                let best = child(e, m).and_then(|q| done.get(&q).map(|x| x.0.clone()));
                stops(e, m, t, best.as_deref()) == Some(true)
            })
            .cloned()
            .collect();
        if s.is_empty() {
            continue;
        }
        s.sort();
        ideas.insert(e.clone(), Idea { t: t.clone(), g: *g, s });
    }
    eprintln!("ideas: {} positions where a common move stops a threat", ideas.len());
    // 3. one file per band, and the manifest
    for (b, t) in &trees {
        let mine: BTreeMap<&String, &Idea> = ideas.iter().filter(|(e, _)| t.contains_key(*e)).collect();
        let name = format!("ideas-{b}.json.gz");
        let entry = emit::write(data, &name, &emit::gz_json(&mine)?)?;
        eprintln!("  {name}: {} positions, {} KB", mine.len(), entry.bytes / 1024);
        manifest.files.retain(|f| f.name != name);
        manifest.files.push(entry);
    }
    serde_json::to_writer_pretty(File::create(&mpath)?, &manifest)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const START: &str = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

    #[test]
    fn a_pass_flips_the_side_and_drops_en_passant() {
        assert_eq!(null_move(START).unwrap(), "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq -");
        // White to move and in check: no pass
        assert_eq!(null_move("rnb1kbnr/pppp1ppp/8/4p3/5PPq/8/PPPPP2P/RNBQKBNR w KQkq -"), None);
    }

    #[test]
    fn a_threat_is_what_the_pass_gives_the_opponent() {
        // White to move, eval +30; after a pass Black's best is worth −150 for White: a 180 cp threat
        assert_eq!(threat(START, 30, "d8h4", -150), Some(("d8h4".to_string(), 180)));
        assert_eq!(threat(START, 30, "d8h4", -40), None);
        // Black to move: the threat is White's
        let b = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -";
        assert_eq!(threat(b, 30, "d1h5", 200), Some(("d1h5".to_string(), 170)));
    }

    #[test]
    fn a_move_stops_a_threat_it_makes_illegal_or_no_longer_best() {
        // 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6: Black threatens nothing here, but take Ng5's square for the test:
        // after 1.e4 e5 2.Nf3 d6, White to move; pretend the threat is ...Bg4 and h3 is played.
        let e = "rnbqkbnr/ppp2ppp/3p4/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -";
        assert_eq!(stops(e, "h2h3", "c8g4", Some("c8e6")), Some(true));
        assert_eq!(stops(e, "h2h3", "c8g4", Some("c8g4")), Some(false));
        assert_eq!(stops(e, "h2h3", "c8g4", None), None);
        // a move that makes the threat illegal: the pawn takes the square the threat needed
        assert_eq!(stops(e, "f3g5", "d8g5", None), None);
        assert_eq!(stops(e, "d2d4", "e5d4", Some("e5d4")), Some(false));
        // e4 pawn blocked: after d2d4 exd4 is legal, after Nxe5 it is not
        assert_eq!(stops(e, "f3e5", "e5d4", None), Some(true));
    }
}
