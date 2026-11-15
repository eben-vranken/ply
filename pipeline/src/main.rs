//! ply-data: builds Ply's opening data from the Lichess open databases (CC0).
//!
//!   ply-data build --month 2026-10 --out ../app/public/data
//!
//! Each stage caches its result under --cache, so an interrupted build picks up
//! where it stopped. Delete a cache file to redo that stage.

mod chess;
mod emit;
mod evals;
mod games;
mod openings;
mod positions;
mod source;
mod traps;

use ahash::AHashSet;
use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use flate2::read::GzDecoder;
use std::io::BufReader;
use std::path::{Path, PathBuf};
use std::time::Instant;

#[derive(Parser)]
#[command(name = "ply-data", version, about = "Build Ply's opening tree, trap and puzzle data")]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Run every stage and write the app data files.
    Build(Build),
    /// Count the distinct positions in the band trees and how many reach 50, 200 and 1,000 games.
    Positions(Positions),
}

#[derive(Parser)]
struct Positions {
    /// Directory with manifest.json and tree-<band>.json.gz (the app's public/data)
    #[arg(long, default_value = "../app/public/data")]
    data: PathBuf,
    /// Game counts to report
    #[arg(long, value_delimiter = ',', default_value = "50,200,1000")]
    at: Vec<u64>,
}

#[derive(Parser)]
struct Build {
    /// Lichess database month (most recent complete month), YYYY-MM
    #[arg(long)]
    month: String,
    /// Output directory (the app's public/data)
    #[arg(long, default_value = "../app/public/data")]
    out: PathBuf,
    /// Stage cache directory
    #[arg(long, default_value = "cache")]
    cache: PathBuf,
    /// Keep a copy of every download here so re-runs read from disk
    #[arg(long)]
    keep_downloads: Option<PathBuf>,
    /// Override the game source (path or URL)
    #[arg(long)]
    games: Option<String>,
    /// More months (YYYY-MM) or game files to read, in order, when the first runs out before every band
    /// is full: the rarer high-rated bands need more than one month
    #[arg(long, value_delimiter = ',')]
    extra_months: Vec<String>,
    /// Override the eval DB source (path or URL)
    #[arg(long)]
    evals: Option<String>,
    /// Override the puzzle DB source (path or URL)
    #[arg(long)]
    puzzles: Option<String>,
    /// Directory or URL prefix holding a.tsv … e.tsv
    #[arg(long, default_value = openings::TSV_BASE)]
    openings: String,
    /// Stockfish 17 binary
    #[arg(long, default_value = "cache/sf17/stockfish/stockfish-windows-x86-64-avx2.exe")]
    stockfish: String,
    #[arg(long, default_value_t = 18)]
    sf_depth: u32,
    /// Parallel single-threaded Stockfish processes
    #[arg(long, default_value_t = 10)]
    sf_procs: usize,
    #[arg(long, default_value_t = 3_000_000)]
    max_games: u64,
    /// Rating bands to build (Lichess ratings; each takes games where both players are within band−100 … band+99).
    /// Bands already counted in the cache are not counted again.
    #[arg(long, value_delimiter = ',', default_value = "1000,1200,1400,1600,1800,2000")]
    bands: Vec<u32>,
    /// Stop the game stream after this many games (testing)
    #[arg(long, default_value_t = 0)]
    limit_games: u64,
    #[arg(long, default_value_t = 50)]
    min_games: u32,
    /// Moves listed under a node need at least this many games
    #[arg(long, default_value_t = 10)]
    min_edge: u32,
    /// gzipped size budget per band, MB
    #[arg(long, default_value_t = 25)]
    budget_mb: u64,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.cmd {
        Cmd::Build(b) => build(b),
        Cmd::Positions(p) => {
            let m: emit::Manifest = serde_json::from_reader(std::fs::File::open(p.data.join("manifest.json")).context("manifest.json")?)?;
            let trees = m.bands.iter().map(|&b| Ok((b, positions::read_tree(&p.data.join(format!("tree-{b}.json.gz")))?))).collect::<Result<Vec<_>>>()?;
            println!("Data {} ({} bands)\n", m.version, m.bands.len());
            positions::print(&positions::count(&trees, &p.at));
            Ok(())
        }
    }
}

fn read_gz_json<T: serde::de::DeserializeOwned>(p: &Path) -> Result<T> {
    Ok(serde_json::from_reader(BufReader::new(GzDecoder::new(std::fs::File::open(p)?)))?)
}
fn write_gz_json<T: serde::Serialize>(p: &Path, v: &T) -> Result<()> {
    let mut e = flate2::write::GzEncoder::new(std::fs::File::create(p)?, flate2::Compression::fast());
    serde_json::to_writer(&mut e, v)?;
    e.finish()?;
    Ok(())
}

fn build(b: Build) -> Result<()> {
    let t0 = Instant::now();
    std::fs::create_dir_all(&b.cache)?;
    if let Some(k) = &b.keep_downloads {
        source::KEEP.set(k.clone()).ok();
    }
    let games_src = b.games.clone().unwrap_or_else(|| format!("https://database.lichess.org/standard/lichess_db_standard_rated_{}.pgn.zst", b.month));
    let evals_src = b.evals.clone().unwrap_or_else(|| "https://database.lichess.org/lichess_db_eval.jsonl.zst".into());
    let puzzles_src = b.puzzles.clone().unwrap_or_else(|| "https://database.lichess.org/lichess_db_puzzle.csv.zst".into());

    // 1. openings
    eprintln!("[1/6] openings");
    let ops_cache = b.cache.join("openings.json");
    let ops: Vec<openings::Opening> = if ops_cache.exists() {
        serde_json::from_slice(&std::fs::read(&ops_cache)?)?
    } else {
        let o = openings::load_all(&b.openings)?;
        std::fs::write(&ops_cache, serde_json::to_vec(&o)?)?;
        o
    };
    let op_by_epd = openings::by_epd(&ops);
    eprintln!("  {} named openings", ops.len());

    // 2–3. frequencies and pruning
    eprintln!("[2/6] game frequencies ({games_src})");
    let raw_path = |band: u32| b.cache.join(format!("raw-{band}.json.gz"));
    // only the bands not counted yet go through the game stream
    let todo: Vec<u32> = b.bands.iter().copied().filter(|&band| !raw_path(band).exists()).collect();
    if !todo.is_empty() {
        eprintln!("  counting bands {todo:?}");
        let month_url = |m: &str| if m.contains('/') || m.contains('\\') || m.ends_with(".zst") { m.to_string() } else { format!("https://database.lichess.org/standard/lichess_db_standard_rated_{m}.pgn.zst") };
        let srcs: Vec<String> = std::iter::once(games_src.clone()).chain(b.extra_months.iter().map(|m| month_url(m))).collect();
        let counts = games::count(&srcs, &games::StreamOpts { max_per_band: b.max_games, limit_games: b.limit_games }, &todo)?;
        for (i, c) in counts.iter().enumerate() {
            let band = todo[i];
            let raw = games::rebuild(c, b.min_games, b.min_edge);
            eprintln!("  band {band}: {} games, {} nodes", c.games, raw.len());
            write_gz_json(&raw_path(band), &raw)?;
        }
    }
    let mut raws = Vec::new();
    for &band in &b.bands {
        let r: Vec<games::RawNode> = read_gz_json(&raw_path(band))?;
        raws.push(r);
    }

    // 4. evaluations
    eprintln!("[3/6] evaluations");
    let mut need = AHashSet::new();
    for r in &raws {
        for n in r {
            need.insert(n.epd.clone());
        }
    }
    let db_cache = b.cache.join("evals-db.jsonl");
    let db_done = b.cache.join("evals-db.done");
    let sf_cache = b.cache.join("evals-sf.jsonl");
    let mut ev = evals::Evals::default();
    evals::load_cache(&db_cache, &mut ev)?;
    // the done file lists the bands whose positions went through the eval DB (empty: the first six)
    let joined: Vec<u32> = match std::fs::read_to_string(&db_done) {
        Ok(s) if s.trim().is_empty() => games::BANDS.to_vec(),
        Ok(s) => s.split(',').filter_map(|x| x.trim().parse().ok()).collect(),
        Err(_) => Vec::new(),
    };
    if !db_done.exists() {
        // restart the join from scratch (the cache may hold a partial pass)
        ev.clear();
        let _ = std::fs::remove_file(&db_cache);
        evals::join_db(&evals_src, &need, &db_cache, &mut ev)?;
    } else if b.bands.iter().any(|band| !joined.contains(band)) {
        // new bands: look up only their positions that have no eval yet (appended to the cache)
        let fresh: AHashSet<String> = need.iter().filter(|e| !ev.contains_key(*e)).cloned().collect();
        eprintln!("  {} new positions to look up in the eval DB", fresh.len());
        evals::join_db(&evals_src, &fresh, &db_cache, &mut ev)?;
    }
    let all: Vec<String> = joined.iter().chain(b.bands.iter()).copied().collect::<std::collections::BTreeSet<u32>>().iter().map(|x| x.to_string()).collect();
    std::fs::write(&db_done, all.join(","))?;
    evals::load_cache(&sf_cache, &mut ev)?;
    let mut missing: Vec<String> = need.iter().filter(|e| !ev.contains_key(*e)).cloned().collect();
    // most-reached positions first, so a stopped run has the important ones
    let weight: ahash::AHashMap<&str, u32> = raws.iter().flatten().fold(ahash::AHashMap::new(), |mut m, n| {
        *m.entry(n.epd.as_str()).or_insert(0) += n.g;
        m
    });
    missing.sort_by_key(|e| weight.get(e.as_str()).copied().unwrap_or(0));
    eprintln!("  {} of {} positions need Stockfish (depth {})", missing.len(), need.len(), b.sf_depth);
    evals::stockfish_all(&b.stockfish, missing, b.sf_depth, b.sf_procs, &sf_cache, &mut ev)?;

    // 5–8. defaults, traps; emit trees
    eprintln!("[4/6] default moves and traps");
    let version = format!("{}-{}", b.month, emit::git_short_hash());
    let mut files = Vec::new();
    files.push(emit::write(&b.out, "openings.json", &serde_json::to_vec(&ops)?)?);
    for (i, raw) in raws.iter().enumerate() {
        let band = b.bands[i];
        let mut min = b.min_games;
        let mut cut = raw.clone();
        loop {
            let a = traps::analyse(&cut, &ev, &op_by_epd);
            let tree = emit::gz_json(&a.tree)?;
            if (tree.len() as u64) > b.budget_mb << 20 && min < 1000 {
                min = if min < 100 { 100 } else { min * 2 };
                eprintln!("  band {band}: {} MB over budget; rebuilding at ≥{min} games", tree.len() >> 20);
                cut = games::recut(raw, min);
                continue;
            }
            let punish = a.traps.iter().filter(|t| t.kind == "punish").count();
            eprintln!("  band {band}: {} nodes, {:.1} MB gz, {punish} punish, {} danger", a.tree.len(), tree.len() as f64 / 1048576.0, a.traps.len() - punish);
            files.push(emit::write(&b.out, &format!("tree-{band}.json.gz"), &tree)?);
            files.push(emit::write(&b.out, &format!("traps-{band}.json.gz"), &emit::gz_json(&a.traps)?)?);
            break;
        }
    }

    // 9. puzzles
    eprintln!("[5/6] puzzles");
    let pz_cache = b.cache.join("puzzles.json");
    let pz: Vec<traps::Puzzle> = if pz_cache.exists() {
        serde_json::from_slice(&std::fs::read(&pz_cache)?)?
    } else {
        let input = source::zstd_text(&puzzles_src, source::Progress::default()).context("puzzle DB")?;
        let p = traps::puzzles(BufReader::new(input), &ops);
        std::fs::write(&pz_cache, serde_json::to_vec(&p)?)?;
        p
    };
    eprintln!("  {} puzzles kept", pz.len());
    files.push(emit::write(&b.out, "puzzles.json.gz", &emit::gz_json(&pz)?)?);

    // 10. manifest
    eprintln!("[6/6] manifest");
    let m = emit::Manifest { version: version.clone(), month: b.month.clone(), built: chrono_now(), bands: b.bands.clone(), files };
    std::fs::write(b.out.join("manifest.json"), serde_json::to_vec_pretty(&m)?)?;
    eprintln!("done: data version {version} in {:.1} min", t0.elapsed().as_secs_f64() / 60.0);
    Ok(())
}

fn chrono_now() -> String {
    let s = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    // days → civil date (Howard Hinnant's algorithm)
    let z = (s / 86400) as i64 + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mo = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + if mo <= 2 { 1 } else { 0 };
    format!("{y:04}-{mo:02}-{d:02}")
}
