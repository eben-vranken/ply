//! Position keys, compact moves and the win% formula shared by every stage.

use shakmaty::fen::Epd;
use shakmaty::uci::UciMove;
use shakmaty::zobrist::Zobrist64;
use shakmaty::{CastlingMode, Chess, EnPassantMode, Move, Position, Role, Square};

/// The app's position key: the first four FEN fields. En passant only when a
/// capture is actually legal, so transpositions merge (chess.js does the same).
pub fn epd(pos: &Chess) -> String {
    Epd::from_position(pos, EnPassantMode::Legal).to_string()
}

pub fn key(pos: &Chess) -> u64 {
    let z: Zobrist64 = pos.zobrist_hash(EnPassantMode::Legal);
    z.0
}

/// Parse an EPD (four fields) or a full FEN into a position.
pub fn parse(epd_or_fen: &str) -> Option<Chess> {
    let fields: Vec<&str> = epd_or_fen.split_whitespace().collect();
    if fields.len() < 4 {
        return None;
    }
    let fen = format!("{} {} {} {} 0 1", fields[0], fields[1], fields[2], fields[3]);
    let f: shakmaty::fen::Fen = fen.parse().ok()?;
    f.into_position(CastlingMode::Standard).ok()
}

/// Normalise any EPD/FEN string to the canonical key form.
pub fn normalise(epd_or_fen: &str) -> Option<String> {
    parse(epd_or_fen).map(|p| epd(&p))
}

/// A move packed into 16 bits: from (6) | to (6) | promotion role (3).
pub type M16 = u16;

pub fn pack(m: &Move) -> M16 {
    match m.to_uci(CastlingMode::Standard) {
        UciMove::Normal { from, to, promotion } => {
            (u16::from(from) as u16) | ((u16::from(to) as u16) << 6) | ((promotion.map(|r| r as u16).unwrap_or(0)) << 12)
        }
        _ => 0,
    }
}

pub fn uci_of(m: M16) -> String {
    let from = Square::new((m & 63) as u32);
    let to = Square::new(((m >> 6) & 63) as u32);
    let promo = match m >> 12 {
        2 => "n",
        3 => "b",
        4 => "r",
        5 => "q",
        _ => "",
    };
    format!("{from}{to}{promo}")
}

pub fn parse_uci(pos: &Chess, uci: &str) -> Option<Move> {
    let u: UciMove = uci.parse().ok()?;
    u.to_move(pos).ok()
}

pub fn uci(m: &Move) -> String {
    m.to_uci(CastlingMode::Standard).to_string()
}

#[allow(dead_code)]
pub fn role_char(r: Role) -> char {
    r.char()
}

/// Mix a position key with a move to key an edge.
pub fn edge_key(pos_key: u64, m: M16) -> u64 {
    let x = pos_key ^ ((m as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15));
    // splitmix finaliser so nearby moves spread out
    let mut z = x.wrapping_add(0x9E37_79B9_7F4A_7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

/// Lichess win% for a centipawn score, from the side the score belongs to.
pub fn win_pct(cp: i32) -> f64 {
    let cp = cp.clamp(-10000, 10000) as f64;
    50.0 + 50.0 * (2.0 / (1.0 + (-0.003_682_08 * cp).exp()) - 1.0)
}

/// Eval from White's view turned to the mover's view.
pub fn pov(cp_white: i32, white_to_move: bool) -> i32 {
    if white_to_move { cp_white } else { -cp_white }
}

/// Mate scores become ±10000 (minus distance so faster mates rank higher).
pub fn mate_cp(mate: i32) -> i32 {
    if mate > 0 { 10000 - mate.min(99) } else { -10000 + (-mate).min(99) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use shakmaty::san::San;

    fn play(sans: &str) -> Chess {
        let mut p = Chess::default();
        for s in sans.split_whitespace() {
            let m = s.parse::<San>().unwrap().to_move(&p).unwrap();
            p.play_unchecked(m);
        }
        p
    }

    #[test]
    fn epd_is_four_fields() {
        let p = play("e4");
        // no black pawn can take on e3, so no en passant square
        assert_eq!(epd(&p), "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -");
    }

    #[test]
    fn en_passant_only_when_legal() {
        let p = play("e4 a6 e5 d5");
        assert!(epd(&p).ends_with(" w KQkq d6"));
    }

    #[test]
    fn transpositions_share_a_key() {
        let a = play("Nf3 Nf6 g3");
        let b = play("g3 Nf6 Nf3");
        assert_eq!(epd(&a), epd(&b));
        assert_eq!(key(&a), key(&b));
    }

    #[test]
    fn move_packing_round_trips() {
        let p = Chess::default();
        for m in p.legal_moves() {
            assert_eq!(uci_of(pack(&m)), uci(&m));
        }
        let c = play("e4 e5 Nf3 Nc6 Bc4 Bc5");
        let castle = parse_uci(&c, "e1g1").unwrap();
        assert_eq!(uci_of(pack(&castle)), "e1g1");
    }

    #[test]
    fn normalise_strips_counters() {
        let n = normalise("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1").unwrap();
        assert_eq!(n, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -");
    }

    #[test]
    fn win_pct_matches_lichess() {
        assert!((win_pct(0) - 50.0).abs() < 1e-9);
        assert!((win_pct(100) - 59.1).abs() < 0.1);
        assert!(win_pct(10000) > 99.9);
    }
}
