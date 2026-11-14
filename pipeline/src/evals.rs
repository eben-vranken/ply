//! Step 4: evaluations. Join every kept position against the Lichess eval
//! database (deepest eval wins), then run native Stockfish on the rest.
//! Both results are cached as JSON lines so a re-run never repeats the work.

use crate::chess::{mate_cp, normalise};
use crate::source::{self, Progress};
use ahash::{AHashMap, AHashSet};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Eval {
    pub epd: String,
    /// centipawns from White's view, mates clamped to ±10000
    pub cp: i32,
    pub depth: u32,
    /// principal variation, UCI
    pub pv: Vec<String>,
}

pub type Evals = AHashMap<String, Eval>;

pub fn load_cache(path: &Path, into: &mut Evals) -> Result<()> {
    if !path.exists() {
        return Ok(());
    }
    for line in BufReader::new(File::open(path)?).lines() {
        let line = line?;
        if let Ok(e) = serde_json::from_str::<Eval>(&line) {
            into.insert(e.epd.clone(), e);
        }
    }
    Ok(())
}

#[derive(Deserialize)]
struct DbLine {
    fen: String,
    evals: Vec<DbEval>,
}
#[derive(Deserialize)]
struct DbEval {
    pvs: Vec<DbPv>,
    depth: u32,
}
#[derive(Deserialize)]
struct DbPv {
    cp: Option<i32>,
    mate: Option<i32>,
    line: String,
}

/// Parse one line of lichess_db_eval.jsonl into our form (deepest eval, first PV).
pub fn parse_db_line(line: &str) -> Option<Eval> {
    let d: DbLine = serde_json::from_str(line).ok()?;
    let best = d.evals.iter().max_by_key(|e| e.depth)?;
    let pv = best.pvs.first()?;
    let cp = match (pv.cp, pv.mate) {
        (Some(c), _) => c.clamp(-10000, 10000),
        (None, Some(m)) => mate_cp(m),
        _ => return None,
    };
    let epd = normalise(&d.fen)?;
    Some(Eval { epd, cp, depth: best.depth, pv: pv.line.split_whitespace().take(12).map(String::from).collect() })
}

/// Quick EPD pull from the front of a line without parsing JSON.
fn fen_prefix(line: &str) -> Option<&str> {
    let rest = line.strip_prefix("{\"fen\":\"")?;
    Some(&rest[..rest.find('"')?])
}

/// Stream the eval DB once and keep the positions we need.
pub fn join_db(src: &str, need: &AHashSet<String>, cache: &Path, into: &mut Evals) -> Result<()> {
    let progress = Progress::default();
    let input = source::zstd_text(src, progress.clone())?;
    let mut out = BufWriter::new(OpenOptions::new().create(true).append(true).open(cache)?);
    let t0 = Instant::now();
    let mut last = Instant::now();
    let (mut lines, mut hits) = (0u64, 0u64);
    for line in BufReader::with_capacity(1 << 20, input).lines() {
        let line = match line {
            Ok(l) => l,
            Err(e) => {
                eprintln!("  eval stream ended: {e}");
                break;
            }
        };
        lines += 1;
        let Some(f) = fen_prefix(&line) else { continue };
        // en passant fields need normalising; the rest match byte for byte
        let wanted = if f.ends_with(" -") { need.contains(f) } else { normalise(f).map(|n| need.contains(&n)).unwrap_or(false) };
        if wanted {
            if let Some(e) = parse_db_line(&line) {
                hits += 1;
                writeln!(out, "{}", serde_json::to_string(&e)?)?;
                into.insert(e.epd.clone(), e);
            }
        }
        if last.elapsed().as_secs() >= 30 {
            last = Instant::now();
            let mb = progress.load(Ordering::Relaxed) >> 20;
            eprintln!("  evals {:>5}M lines, {} MB in, {:.1} MB/s, {hits} of {} positions found", lines / 1_000_000, mb, mb as f64 / t0.elapsed().as_secs_f64(), need.len());
        }
    }
    out.flush()?;
    eprintln!("  eval DB: {hits} of {} positions found in {lines} lines ({:.0} s)", need.len(), t0.elapsed().as_secs_f64());
    Ok(())
}

pub struct Engine {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

impl Engine {
    pub fn start(path: &str, threads: u32, hash_mb: u32) -> Result<Engine> {
        let mut child = Command::new(path).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().with_context(|| format!("start stockfish at {path}"))?;
        let stdin = child.stdin.take().unwrap();
        let stdout = BufReader::new(child.stdout.take().unwrap());
        let mut e = Engine { child, stdin, stdout };
        e.send("uci")?;
        e.wait_for("uciok")?;
        e.send(&format!("setoption name Threads value {threads}"))?;
        e.send(&format!("setoption name Hash value {hash_mb}"))?;
        e.send("isready")?;
        e.wait_for("readyok")?;
        Ok(e)
    }
    fn send(&mut self, s: &str) -> Result<()> {
        writeln!(self.stdin, "{s}")?;
        self.stdin.flush()?;
        Ok(())
    }
    fn wait_for(&mut self, tok: &str) -> Result<()> {
        let mut l = String::new();
        loop {
            l.clear();
            if self.stdout.read_line(&mut l)? == 0 {
                anyhow::bail!("stockfish exited");
            }
            if l.trim_start().starts_with(tok) {
                return Ok(());
            }
        }
    }
    /// Evaluate a position to a fixed depth. Score returned from White's view.
    pub fn eval(&mut self, epd: &str, depth: u32) -> Result<Eval> {
        let white = epd.split(' ').nth(1) == Some("w");
        self.send(&format!("position fen {epd} 0 1"))?;
        self.send(&format!("go depth {depth}"))?;
        let (mut cp, mut pv, mut d) = (0i32, Vec::new(), 0u32);
        let mut l = String::new();
        loop {
            l.clear();
            if self.stdout.read_line(&mut l)? == 0 {
                anyhow::bail!("stockfish exited");
            }
            let t: Vec<&str> = l.split_whitespace().collect();
            if t.first() == Some(&"bestmove") {
                if pv.is_empty() && t.len() > 1 && t[1] != "(none)" {
                    pv.push(t[1].to_string());
                }
                break;
            }
            if t.first() == Some(&"info") && t.contains(&"pv") && !t.contains(&"upperbound") && !t.contains(&"lowerbound") {
                if let Some(i) = t.iter().position(|x| *x == "depth") {
                    d = t[i + 1].parse().unwrap_or(d);
                }
                if let Some(i) = t.iter().position(|x| *x == "score") {
                    let v: i32 = t[i + 2].parse().unwrap_or(0);
                    cp = if t[i + 1] == "mate" { mate_cp(v) } else { v.clamp(-10000, 10000) };
                }
                if let Some(i) = t.iter().position(|x| *x == "pv") {
                    pv = t[i + 1..].iter().take(12).map(|s| s.to_string()).collect();
                }
            }
        }
        Ok(Eval { epd: epd.to_string(), cp: if white { cp } else { -cp }, depth: d, pv })
    }
}

impl Drop for Engine {
    fn drop(&mut self) {
        let _ = self.send("quit");
        let _ = self.child.wait();
    }
}

/// Run positions through a pool of single-threaded Stockfish processes.
/// N one-thread engines get more positions per second than one N-thread engine.
pub fn stockfish_all(path: &str, todo: Vec<String>, depth: u32, procs: usize, cache: &Path, into: &mut Evals) -> Result<()> {
    if todo.is_empty() {
        return Ok(());
    }
    let total = todo.len();
    let queue = Arc::new(Mutex::new(todo));
    let out = Arc::new(Mutex::new(BufWriter::new(OpenOptions::new().create(true).append(true).open(cache)?)));
    let done = Arc::new(AtomicUsize::new(0));
    let results = Arc::new(Mutex::new(Vec::new()));
    let t0 = Instant::now();
    let mut handles = Vec::new();
    for _ in 0..procs {
        let (queue, out, done, results, path) = (queue.clone(), out.clone(), done.clone(), results.clone(), path.to_string());
        handles.push(std::thread::spawn(move || -> Result<()> {
            let mut eng = Engine::start(&path, 1, 64)?;
            loop {
                let Some(epd) = queue.lock().unwrap().pop() else { break };
                let e = eng.eval(&epd, depth)?;
                writeln!(out.lock().unwrap(), "{}", serde_json::to_string(&e)?)?;
                results.lock().unwrap().push(e);
                let n = done.fetch_add(1, Ordering::Relaxed) + 1;
                if n % 2000 == 0 {
                    out.lock().unwrap().flush()?;
                    let rate = n as f64 / t0.elapsed().as_secs_f64();
                    eprintln!("  stockfish {n}/{total} ({rate:.1}/s, ~{:.0} min left)", (total - n) as f64 / rate / 60.0);
                }
            }
            Ok(())
        }));
    }
    for h in handles {
        h.join().unwrap()?;
    }
    out.lock().unwrap().flush()?;
    for e in results.lock().unwrap().drain(..) {
        into.insert(e.epd.clone(), e);
    }
    eprintln!("  stockfish: {total} positions in {:.0} s", t0.elapsed().as_secs_f64());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_eval_db_lines() {
        let l = r#"{"fen":"rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -","evals":[{"pvs":[{"cp":20,"line":"c7c5 g1f3"}],"knodes":100,"depth":20},{"pvs":[{"cp":31,"line":"e7e5 g1f3 b8c6"}],"knodes":900,"depth":40}]}"#;
        let e = parse_db_line(l).unwrap();
        assert_eq!(e.cp, 31);
        assert_eq!(e.depth, 40);
        assert_eq!(e.pv[0], "e7e5");
        let m = r#"{"fen":"6k1/5ppp/8/8/8/8/5PPP/R5K1 w - -","evals":[{"pvs":[{"mate":1,"line":"a1a8"}],"knodes":1,"depth":30}]}"#;
        assert_eq!(parse_db_line(m).unwrap().cp, 9999);
        assert_eq!(fen_prefix(l), Some("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -"));
    }
}
