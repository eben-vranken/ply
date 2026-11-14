//! Steps 5–9: default moves, win% and move loss, Punish and Danger traps,
//! and the opening puzzles.

use crate::chess::{self, epd, parse, parse_uci, pov, win_pct};
use crate::evals::Evals;
use crate::games::RawNode;
use crate::openings::Opening;
use ahash::AHashMap;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use shakmaty::{Color, Position};
use std::collections::{BTreeMap, HashMap};

pub const DEFAULT_WINDOW_CP: i32 = 30;

/// One node as the app reads it (tree-<band>.json.gz).
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TreeNode {
    pub g: u32,
    pub e: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub o: Option<u32>,
    pub d: String,
    pub m: Vec<(String, u32, u32, u32, u32)>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Trap {
    pub id: String,
    pub kind: String,
    pub epd: String,
    pub side: char,
    pub answer: Vec<String>,
    pub line: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bait: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refute: Option<Vec<String>>,
    pub loss: f64,
    pub freq: f64,
    pub o: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Puzzle {
    pub id: String,
    pub fen: String,
    pub moves: Vec<String>,
    pub rating: u32,
    pub themes: Vec<String>,
    pub families: Vec<u32>,
    pub plays: u32,
}

pub fn stable_id(parts: &[&str]) -> String {
    let mut h = Sha256::new();
    for p in parts {
        h.update(p.as_bytes());
        h.update([0u8]);
    }
    h.finalize().iter().take(8).map(|b| format!("{b:02x}")).collect()
}

/// The default-move rule for one position, given each played move's resulting
/// eval (White's view). Most-played first in `moves`. Falls back to `best`.
pub fn default_move(white_to_move: bool, node_cp: i32, moves: &[(String, Option<i32>)], best: &str) -> String {
    let bar = pov(node_cp, white_to_move) - DEFAULT_WINDOW_CP;
    for (u, cp) in moves {
        if let Some(cp) = cp {
            if pov(*cp, white_to_move) >= bar {
                return u.clone();
            }
        }
    }
    best.to_string()
}

/// Win% the mover gives up by playing a move: before minus after, mover's view.
pub fn move_loss(white_to_move: bool, before_cp: i32, after_cp: i32) -> f64 {
    win_pct(pov(before_cp, white_to_move)) - win_pct(pov(after_cp, white_to_move))
}

pub struct Analysed {
    pub tree: BTreeMap<String, TreeNode>,
    pub traps: Vec<Trap>,
}

/// Turn a band's raw tree into the app tree and its traps.
pub fn analyse(raw: &[RawNode], evals: &Evals, op_by_epd: &HashMap<String, u32>) -> Analysed {
    // nearest named ancestor: walk in BFS order (raw is BFS from the root)
    let mut o_of: AHashMap<String, u32> = AHashMap::new();
    let mut tree = BTreeMap::new();
    let mut traps = Vec::new();
    for n in raw {
        let Some(pos) = parse(&n.epd) else { continue };
        let white = pos.turn() == Color::White;
        let own_o = op_by_epd.get(&n.epd).copied().or_else(|| o_of.get(&n.epd).copied());
        let Some(ev) = evals.get(&n.epd) else { continue };
        let mut scored = Vec::with_capacity(n.m.len());
        let mut children = Vec::with_capacity(n.m.len());
        for (u, games, ..) in &n.m {
            let Some(m) = parse_uci(&pos, u) else { continue };
            let mut c = pos.clone();
            c.play_unchecked(m);
            let ce = epd(&c);
            if let Some(o) = own_o {
                o_of.entry(ce.clone()).or_insert(o);
            }
            let ccp = evals.get(&ce).map(|e| e.cp);
            scored.push((u.clone(), ccp));
            children.push((u.clone(), *games, ce, ccp));
        }
        // engine lines may write castling king-takes-rook (e1h1); store standard UCI (e1g1)
        let best = ev.pv.first().and_then(|u| parse_uci(&pos, u)).map(|m| chess::uci(&m)).unwrap_or_default();
        let d = default_move(white, ev.cp, &scored, &best);
        // traps from this node's moves
        let side_here = if white { 'w' } else { 'b' };
        let side_next = if white { 'b' } else { 'w' };
        for (u, games, ce, ccp) in &children {
            let Some(ccp) = ccp else { continue };
            if n.g == 0 {
                continue;
            }
            let freq = *games as f64 / n.g as f64;
            let loss = move_loss(white, ev.cp, *ccp);
            if loss < 15.0 || freq < 0.03 {
                continue;
            }
            let Some(cev) = evals.get(ce) else { continue };
            let o = own_o.unwrap_or(0);
            // Punish: after the mistake, the other side finds the refutation (up to 3 of its moves).
            let pv = forcing_prefix(ce, &legal_prefix(ce, &cev.pv, 5));
            if !pv.is_empty() {
                let line = pv;
                let answer: Vec<String> = line.iter().step_by(2).cloned().collect();
                traps.push(Trap {
                    id: stable_id(&[ce, "punish", u]),
                    kind: "punish".into(),
                    epd: ce.clone(),
                    side: side_next,
                    answer,
                    line,
                    bait: None,
                    refute: None,
                    loss: round2(loss),
                    freq: round4(freq),
                    o,
                });
            }
            // Danger: before the popular losing move, the mover finds the safe default move.
            if freq >= 0.05 && &d != u && !d.is_empty() {
                traps.push(Trap {
                    id: stable_id(&[&n.epd, "danger", u]),
                    kind: "danger".into(),
                    epd: n.epd.clone(),
                    side: side_here,
                    answer: vec![d.clone()],
                    line: vec![d.clone()],
                    bait: Some(u.clone()),
                    refute: Some(legal_prefix(ce, &cev.pv, 5)),
                    loss: round2(loss),
                    freq: round4(freq),
                    o,
                });
            }
        }
        tree.insert(n.epd.clone(), TreeNode { g: n.g, e: ev.cp, o: own_o, d, m: n.m.clone() });
    }
    Analysed { tree, traps }
}

/// The longest legal prefix of a PV (up to `max` plies) from a position.
fn legal_prefix(epd_s: &str, pv: &[String], max: usize) -> Vec<String> {
    let Some(mut pos) = parse(epd_s) else { return vec![] };
    let mut out = Vec::new();
    for u in pv.iter().take(max) {
        match chess::parse_uci(&pos, u) {
            Some(m) => {
                out.push(chess::uci(&m));
                pos.play_unchecked(m);
            }
            None => break,
        }
        if pos.is_game_over() {
            break;
        }
    }
    out
}

/// Cut a punishing PV so every move of the punisher after the first is forcing
/// (a capture or a check). Quiet follow-ups have many good alternatives and
/// would make a fair answer count as wrong. Always ends on the punisher's move.
pub fn forcing_prefix(epd_s: &str, pv: &[String]) -> Vec<String> {
    let Some(mut pos) = parse(epd_s) else { return vec![] };
    let mut out: Vec<String> = Vec::new();
    for (i, u) in pv.iter().enumerate() {
        let Some(m) = chess::parse_uci(&pos, u) else { break };
        let ours = i % 2 == 0;
        let capture = m.is_capture();
        let std = chess::uci(&m);
        pos.play_unchecked(m);
        if ours && i > 0 && !capture && !pos.is_check() {
            break;
        }
        out.push(std);
    }
    if out.len() % 2 == 0 {
        out.pop();
    }
    out
}

fn round2(x: f64) -> f64 {
    (x * 100.0).round() / 100.0
}
fn round4(x: f64) -> f64 {
    (x * 10000.0).round() / 10000.0
}

/// Lowercase letters and digits only, single spaces: "Queen's Gambit: Declined" → "queens gambit declined".
pub fn norm(s: &str) -> String {
    let mut out = String::new();
    let mut space = false;
    for c in s.chars() {
        if c.is_alphanumeric() {
            if space && !out.is_empty() {
                out.push(' ');
            }
            space = false;
            out.extend(c.to_lowercase());
        } else if c != '\'' && c != '’' {
            space = true;
        }
    }
    out
}

/// Step 9: filter the puzzle CSV and link puzzles to openings by tag.
pub fn puzzles(csv: impl std::io::BufRead, ops: &[Opening]) -> Vec<Puzzle> {
    let mut by_name: HashMap<String, u32> = HashMap::new();
    for o in ops {
        by_name.entry(norm(&o.name)).or_insert(o.id);
        by_name.entry(norm(&o.family)).or_insert(o.id);
    }
    let mut per_family: HashMap<String, Vec<Puzzle>> = HashMap::new();
    for line in csv.lines().map_while(Result::ok) {
        let c: Vec<&str> = line.split(',').collect();
        if c.len() < 10 || c[0] == "PuzzleId" || c[9].trim().is_empty() {
            continue;
        }
        let fen = c[1];
        let full_move: u32 = fen.split(' ').nth(5).and_then(|s| s.parse().ok()).unwrap_or(99);
        let (rating, pop, plays): (u32, i32, u32) = (c[3].parse().unwrap_or(9999), c[5].parse().unwrap_or(0), c[6].parse().unwrap_or(0));
        if full_move > 15 || pop < 80 || plays < 300 || rating > 2000 {
            continue;
        }
        let tags: Vec<&str> = c[9].split_whitespace().collect();
        let families: Vec<u32> = tags.iter().filter_map(|t| by_name.get(&norm(&t.replace('_', " "))).copied()).collect();
        if families.is_empty() {
            continue;
        }
        per_family.entry(tags[0].to_string()).or_default().push(Puzzle {
            id: c[0].to_string(),
            fen: fen.to_string(),
            moves: c[2].split_whitespace().map(String::from).collect(),
            rating,
            themes: c[7].split_whitespace().map(String::from).collect(),
            families,
            plays,
        });
    }
    let mut out = Vec::new();
    let mut keys: Vec<_> = per_family.keys().cloned().collect();
    keys.sort();
    for k in keys {
        let mut v = per_family.remove(&k).unwrap();
        v.sort_by(|a, b| b.plays.cmp(&a.plays).then(a.id.cmp(&b.id)));
        v.truncate(150);
        out.extend(v);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_move_rule() {
        // White to move, position +40. Most played move drops to −20 (60 cp worse): not eligible.
        // Second most played keeps +25 (15 cp worse): chosen.
        let moves = vec![("a2a3".to_string(), Some(-20)), ("e2e4".to_string(), Some(25)), ("d2d4".to_string(), Some(40))];
        assert_eq!(default_move(true, 40, &moves, "d2d4"), "e2e4");
        // Black to move, eval −40 is good for Black; a move to −15 is 25 worse for Black: within 30.
        let b = vec![("e7e5".to_string(), Some(-15))];
        assert_eq!(default_move(false, -40, &b, "c7c5"), "e7e5");
        // Nothing within 30 cp (or unevaluated) → engine best move.
        let none = vec![("g2g4".to_string(), Some(-150)), ("h2h4".to_string(), None)];
        assert_eq!(default_move(true, 30, &none, "e2e4"), "e2e4");
        // Exactly 30 worse is still in.
        assert_eq!(default_move(true, 30, &[("x".to_string(), Some(0))], "y"), "x");
    }

    #[test]
    fn loss_is_from_the_movers_view() {
        assert!(move_loss(true, 0, -300) > 15.0);
        assert!(move_loss(false, 0, 300) > 15.0);
        assert!(move_loss(false, 0, -300) < 0.0);
    }

    #[test]
    fn names_normalise_like_puzzle_tags() {
        assert_eq!(norm("Queen's Gambit Declined"), norm(&"Queens_Gambit_Declined".replace('_', " ")));
        assert_eq!(norm("Italian Game: Two Knights Defense"), "italian game two knights defense");
    }

    #[test]
    fn punish_lines_stop_when_quiet() {
        // Stafford: 1.e4 e5 2.Nf3 Nf6 3.Nxe5 Nc6 — White takes on c6, then d3 is quiet.
        let e = "r1bqkb1r/pppp1ppp/2n2n2/4N3/4P3/8/PPPP1PPP/RNBQKB1R w KQkq -";
        let pv: Vec<String> = ["e5c6", "d7c6", "d2d3", "d8e7", "b1c3"].iter().map(|s| s.to_string()).collect();
        assert_eq!(forcing_prefix(e, &pv), vec!["e5c6"]);
        // Fried Liver: Nxf7 Kxf7 Qf3+ is forcing all the way.
        let f = "r1bqkb1r/ppp2ppp/2n5/3np1N1/2B5/8/PPPP1PPP/RNBQK2R w KQkq -";
        let pv2: Vec<String> = ["g5f7", "e8f7", "d1f3", "f7e6", "b1c3"].iter().map(|s| s.to_string()).collect();
        assert_eq!(forcing_prefix(f, &pv2), vec!["g5f7", "e8f7", "d1f3"]);
    }

    #[test]
    fn engine_castling_becomes_standard_uci() {
        // eval DB lines write castling as king takes rook
        let e = "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq -";
        let pv: Vec<String> = ["e1h1", "g8f6"].iter().map(|s| s.to_string()).collect();
        assert_eq!(legal_prefix(e, &pv, 5), vec!["e1g1", "g8f6"]);
    }

    #[test]
    fn ids_are_stable() {
        assert_eq!(stable_id(&["a", "punish", "e2e4"]), stable_id(&["a", "punish", "e2e4"]));
        assert_ne!(stable_id(&["a", "punish", "e2e4"]), stable_id(&["a", "danger", "e2e4"]));
    }
}
