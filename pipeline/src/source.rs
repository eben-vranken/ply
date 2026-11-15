//! Opening the big inputs: a local file or an HTTP URL, zstd-decoded on the fly.
//! HTTP streams resume with a Range request when the connection drops, so a
//! 30 GB download never has to restart from zero, and nothing is unpacked to disk.

use anyhow::{Context, Result};
use std::fs::File;
use std::io::{self, BufReader, Read};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

/// Bytes of compressed input read so far, for progress lines.
pub type Progress = Arc<AtomicU64>;

pub struct Resuming {
    url: String,
    offset: u64,
    inner: Option<Box<dyn Read + Send>>,
    progress: Progress,
    retries: u32,
}

impl Resuming {
    fn open(&mut self) -> io::Result<()> {
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .timeout_connect(Some(Duration::from_secs(30)))
            .timeout_recv_body(Some(Duration::from_secs(120)))
            .build()
            .into();
        let mut req = agent.get(&self.url).header("User-Agent", "ply-data (opening trainer data build)");
        if self.offset > 0 {
            req = req.header("Range", &format!("bytes={}-", self.offset));
        }
        let resp = req.call().map_err(io::Error::other)?;
        let body = resp.into_body().into_reader();
        self.inner = Some(Box::new(body));
        Ok(())
    }
}

impl Read for Resuming {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        loop {
            if self.inner.is_none() {
                if let Err(e) = self.open() {
                    self.retries += 1;
                    if self.retries > 50 {
                        return Err(e);
                    }
                    eprintln!("  connection failed ({e}), retry {} in 10 s", self.retries);
                    std::thread::sleep(Duration::from_secs(10));
                    continue;
                }
            }
            match self.inner.as_mut().unwrap().read(buf) {
                Ok(n) => {
                    self.offset += n as u64;
                    self.progress.fetch_add(n as u64, Ordering::Relaxed);
                    if n > 0 {
                        self.retries = 0;
                    }
                    return Ok(n);
                }
                Err(e) => {
                    eprintln!("  stream dropped at {} MB ({e}); resuming", self.offset >> 20);
                    self.inner = None;
                    self.retries += 1;
                    if self.retries > 50 {
                        return Err(e);
                    }
                    std::thread::sleep(Duration::from_secs(5));
                }
            }
        }
    }
}

/// Where downloads are kept (set by `--keep-downloads <dir>`), so re-runs read from disk.
pub static KEEP: std::sync::OnceLock<std::path::PathBuf> = std::sync::OnceLock::new();

/// Copies everything read into `<file>.part`, renamed to `<file>` at a clean end.
struct Tee<R> {
    inner: R,
    out: Option<std::io::BufWriter<File>>,
    part: std::path::PathBuf,
    done: std::path::PathBuf,
}
impl<R: Read> Read for Tee<R> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let n = self.inner.read(buf)?;
        if let Some(o) = self.out.as_mut() {
            use std::io::Write;
            if n == 0 {
                o.flush()?;
                self.out = None;
                std::fs::rename(&self.part, &self.done)?;
                eprintln!("  kept a copy at {}", self.done.display());
            } else if o.write_all(&buf[..n]).is_err() {
                eprintln!("  could not keep a local copy (disk full?); streaming only");
                self.out = None;
                let _ = std::fs::remove_file(&self.part);
            }
        }
        Ok(n)
    }
}

/// Raw (still compressed) bytes from a path or URL.
pub fn raw(src: &str, progress: Progress) -> Result<Box<dyn Read + Send>> {
    if src.starts_with("http://") || src.starts_with("https://") {
        let mut stream = Resuming { url: src.to_string(), offset: 0, inner: None, progress: progress.clone(), retries: 0 };
        if let Some(dir) = KEEP.get() {
            let name = src.rsplit('/').next().unwrap_or("download");
            let done = dir.join(name);
            if done.exists() {
                eprintln!("  reading kept copy {}", done.display());
                return raw(done.to_str().unwrap(), progress);
            }
            std::fs::create_dir_all(dir)?;
            let part = dir.join(format!("{name}.part"));
            // A partial copy from an earlier run: read it from disk, then fetch the rest.
            let have = std::fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
            if have > 0 {
                eprintln!("  resuming from kept partial copy ({} MB)", have >> 20);
                stream.offset = have;
                let head = Counting { inner: File::open(&part)?, progress: progress.clone() };
                let out = std::fs::OpenOptions::new().append(true).open(&part).ok().map(|f| std::io::BufWriter::with_capacity(4 << 20, f));
                let tail = Tee { inner: stream, out, part, done };
                return Ok(Box::new(head.chain(tail)));
            }
            let out = File::create(&part).ok().map(|f| std::io::BufWriter::with_capacity(4 << 20, f));
            return Ok(Box::new(Tee { inner: stream, out, part, done }));
        }
        Ok(Box::new(stream))
    } else {
        let f = File::open(src).with_context(|| format!("open {src}"))?;
        Ok(Box::new(Counting { inner: f, progress }))
    }
}

struct Counting<R> {
    inner: R,
    progress: Progress,
}
impl<R: Read> Read for Counting<R> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let n = self.inner.read(buf)?;
        self.progress.fetch_add(n as u64, Ordering::Relaxed);
        Ok(n)
    }
}

/// A truncated local sample ends mid-frame; treat that as end of input.
pub struct Tolerant<R>(pub R);
impl<R: Read> Read for Tolerant<R> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        match self.0.read(buf) {
            Ok(n) => Ok(n),
            Err(e) if e.kind() == io::ErrorKind::UnexpectedEof || e.to_string().contains("incomplete frame") || e.to_string().contains("Unknown frame") => {
                eprintln!("  input ended early ({e}); using what was read");
                Ok(0)
            }
            Err(e) => Err(e),
        }
    }
}

/// zstd-decoded text from a path or URL, read on a separate thread so the
/// network and the decoder overlap with parsing.
pub fn zstd_text(src: &str, progress: Progress) -> Result<Box<dyn Read + Send>> {
    let raw = raw(src, progress)?;
    let (tx, rx) = crossbeam_channel::bounded::<Vec<u8>>(256);
    std::thread::spawn(move || {
        let mut r = BufReader::with_capacity(1 << 20, raw);
        loop {
            let mut buf = vec![0u8; 256 << 10];
            match r.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    buf.truncate(n);
                    if tx.send(buf).is_err() {
                        break;
                    }
                }
                Err(e) => {
                    eprintln!("  download failed: {e}");
                    break;
                }
            }
        }
    });
    let chan = ChanReader { rx, cur: Vec::new(), pos: 0 };
    let mut dec = zstd::stream::read::Decoder::new(chan)?;
    dec.window_log_max(31)?;
    Ok(Box::new(Tolerant(dec)))
}

struct ChanReader {
    rx: crossbeam_channel::Receiver<Vec<u8>>,
    cur: Vec<u8>,
    pos: usize,
}
impl Read for ChanReader {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        if self.pos >= self.cur.len() {
            match self.rx.recv() {
                Ok(v) => {
                    self.cur = v;
                    self.pos = 0;
                }
                Err(_) => return Ok(0),
            }
        }
        let n = buf.len().min(self.cur.len() - self.pos);
        buf[..n].copy_from_slice(&self.cur[self.pos..self.pos + n]);
        self.pos += n;
        Ok(n)
    }
}

/// Several zstd files read one after another as one text; each is opened only when the one before it
/// ends, so a stream that stops early never touches the rest. A blank line goes between them.
pub fn zstd_chain(srcs: Vec<String>, progress: Progress) -> Result<Box<dyn Read + Send>> {
    let mut it = srcs.into_iter();
    let first = it.next().context("no source")?;
    eprintln!("  reading {first}");
    Ok(Box::new(Chain { cur: zstd_text(&first, progress.clone())?, rest: it, progress, gap: false }))
}
struct Chain {
    cur: Box<dyn Read + Send>,
    rest: std::vec::IntoIter<String>,
    progress: Progress,
    gap: bool,
}
impl Read for Chain {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        loop {
            if self.gap {
                self.gap = false;
                if buf.len() >= 2 {
                    buf[..2].copy_from_slice(b"\n\n");
                    return Ok(2);
                }
            }
            let n = self.cur.read(buf)?;
            if n > 0 || buf.is_empty() {
                return Ok(n);
            }
            let Some(next) = self.rest.next() else { return Ok(0) };
            eprintln!("  reading {next}");
            self.cur = zstd_text(&next, self.progress.clone()).map_err(|e| io::Error::other(e.to_string()))?;
            self.gap = true;
        }
    }
}

pub fn text(src: &str) -> Result<String> {
    if src.starts_with("http") {
        let mut s = String::new();
        raw(src, Progress::default())?.read_to_string(&mut s)?;
        Ok(s)
    } else {
        Ok(std::fs::read_to_string(src)?)
    }
}
