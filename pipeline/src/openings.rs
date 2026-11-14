//! Step 1: lichess-org/chess-openings TSVs → every named position.

use crate::chess::{epd, uci};
use anyhow::Result;
use serde::{Deserialize, Serialize};
use shakmaty::san::San;
use shakmaty::{Chess, Position};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Opening {
    pub id: u32,
    pub eco: String,
    pub name: String,
    pub family: String,
    pub epd: String,
    /// Moves from the start position, UCI. Lets the app jump to the opening.
    pub uci: Vec<String>,
    /// The same moves in SAN, for labels and search.
    pub san: String,
}

pub const TSV_BASE: &str = "https://raw.githubusercontent.com/lichess-org/chess-openings/master/";

/// Parse the five TSVs. Rows are kept in file order (ECO order), ids are that index.
pub fn parse(tsvs: &[String]) -> Result<Vec<Opening>> {
    let mut out = Vec::new();
    for t in tsvs {
        for line in t.lines().skip(1) {
            let cols: Vec<&str> = line.split('\t').collect();
            if cols.len() < 3 {
                continue;
            }
            let (eco, name, pgn) = (cols[0], cols[1], cols[2]);
            let mut pos = Chess::default();
            let mut ucis = Vec::new();
            let mut sans = Vec::new();
            let mut ok = true;
            for tok in pgn.split_whitespace() {
                if tok.ends_with('.') || tok.contains("...") && tok.ends_with('.') {
                    continue;
                }
                let tok = tok.trim_start_matches(|c: char| c.is_ascii_digit() || c == '.');
                if tok.is_empty() {
                    continue;
                }
                match tok.parse::<San>().ok().and_then(|s| s.to_move(&pos).ok()) {
                    Some(m) => {
                        ucis.push(uci(&m));
                        sans.push(tok.to_string());
                        pos.play_unchecked(m);
                    }
                    None => {
                        ok = false;
                        break;
                    }
                }
            }
            if !ok {
                eprintln!("  skipping unplayable opening row: {name} {pgn}");
                continue;
            }
            let family = name.split(':').next().unwrap_or(name).trim().to_string();
            out.push(Opening {
                id: out.len() as u32,
                eco: eco.to_string(),
                name: name.to_string(),
                family,
                epd: epd(&pos),
                uci: ucis,
                san: sans.join(" "),
            });
        }
    }
    Ok(out)
}

/// EPD → opening id. When several rows end on one position, the first
/// (lowest ECO, then file order) wins, which matches lichess's own naming.
pub fn by_epd(ops: &[Opening]) -> HashMap<String, u32> {
    let mut m = HashMap::new();
    for o in ops {
        m.entry(o.epd.clone()).or_insert(o.id);
    }
    m
}

pub fn load_all(dir_or_base: &str) -> Result<Vec<Opening>> {
    let mut tsvs = Vec::new();
    for f in ["a", "b", "c", "d", "e"] {
        let src = if dir_or_base.starts_with("http") { format!("{dir_or_base}{f}.tsv") } else { format!("{dir_or_base}/{f}.tsv") };
        tsvs.push(crate::source::text(&src)?);
    }
    parse(&tsvs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_rows_and_names_positions() {
        let tsv = "eco\tname\tpgn\nC50\tItalian Game\t1. e4 e5 2. Nf3 Nc6 3. Bc4\nC50\tItalian Game: Giuoco Piano\t1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5\n".to_string();
        let ops = parse(&[tsv]).unwrap();
        assert_eq!(ops.len(), 2);
        assert_eq!(ops[0].family, "Italian Game");
        assert_eq!(ops[1].uci.last().unwrap(), "f8c5");
        assert_eq!(ops[0].epd, "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq -");
    }
}
