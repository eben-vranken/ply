//! FSRS weight optimisation for Ply, run on the device.
//!
//! fsrs-rs (the optimiser Anki uses) compiled to WebAssembly without threads or JavaScript glue, so it
//! runs on any page: no SharedArrayBuffer and no cross-origin isolation. The app writes each card's
//! review history into memory from `alloc`, calls `optimize` and reads 22 floats back:
//! `[status, w0 … w20]`. Status 1 is a fit, 0 means too little history (the weights are the
//! defaults), negative values are errors.
//!
//! Input, all u32: `cards`, then per card `n` followed by `n` pairs of (rating 1–4, days since the
//! card's previous review; 0 for its first).

use fsrs::{compute_parameters, ComputeParametersInput, FSRSItem, FSRSReview, DEFAULT_PARAMETERS};

static mut OUT: [f32; 22] = [0.0; 22];

/// getrandom's hook on bare WebAssembly (see .cargo/config.toml). Nothing in training asks for
/// system randomness (it seeds its own generator); this is a fixed xorshift so it still links.
#[cfg(target_arch = "wasm32")]
#[no_mangle]
unsafe extern "Rust" fn __getrandom_v03_custom(dest: *mut u8, len: usize) -> Result<(), getrandom::Error> {
    static mut S: u64 = 0x9E37_79B9_7F4A_7C15;
    for i in 0..len {
        let s = &mut *std::ptr::addr_of_mut!(S);
        *s ^= *s << 13;
        *s ^= *s >> 7;
        *s ^= *s << 17;
        *dest.add(i) = *s as u8;
    }
    Ok(())
}

#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(len);
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

#[no_mangle]
/// # Safety
/// `ptr` and `len` must come from `alloc`.
pub unsafe extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, 0, len));
}

/// Training items: for every card, its history up to each review after the first.
pub fn items(input: &[u32]) -> Option<Vec<FSRSItem>> {
    let mut it = input.iter().copied();
    let cards = it.next()?;
    let mut out = Vec::new();
    for _ in 0..cards {
        let n = it.next()? as usize;
        let mut reviews = Vec::with_capacity(n);
        for _ in 0..n {
            let rating = it.next()?;
            let delta_t = it.next()?;
            if !(1..=4).contains(&rating) {
                return None;
            }
            reviews.push(FSRSReview { rating, delta_t: if reviews.is_empty() { 0 } else { delta_t } });
        }
        for k in 2..=reviews.len() {
            out.push(FSRSItem { reviews: reviews[..k].to_vec() });
        }
    }
    Some(out)
}

pub fn fit(input: &[u32]) -> (f32, Vec<f32>) {
    let Some(train_set) = items(input) else { return (-1.0, DEFAULT_PARAMETERS.to_vec()) };
    // fsrs-rs needs reviews on at least one later day to learn anything
    if !train_set.iter().any(|i| i.reviews.last().map(|r| r.delta_t > 0).unwrap_or(false)) {
        return (0.0, DEFAULT_PARAMETERS.to_vec());
    }
    let input = ComputeParametersInput { train_set, enable_short_term: true, ..Default::default() };
    match compute_parameters(input) {
        Ok(w) if w.len() == 21 => (1.0, w),
        Ok(_) => (-3.0, DEFAULT_PARAMETERS.to_vec()),
        Err(_) => (-2.0, DEFAULT_PARAMETERS.to_vec()),
    }
}

#[no_mangle]
/// # Safety
/// `ptr` must point to `len` u32 values written by the caller. Returns a pointer to 22 f32.
pub unsafe extern "C" fn optimize(ptr: *const u32, len: usize) -> *const f32 {
    let input = std::slice::from_raw_parts(ptr, len);
    let (status, w) = fit(input);
    let out = &mut *std::ptr::addr_of_mut!(OUT);
    out[0] = status;
    for (i, x) in w.iter().take(21).enumerate() {
        out[i + 1] = *x;
    }
    out.as_ptr()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_items_from_histories() {
        // one card: Again, Good after 1 day, Good after 3 days
        let items = items(&[1, 3, 1, 0, 3, 1, 3, 3]).unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(items[1].reviews.iter().map(|r| (r.rating, r.delta_t)).collect::<Vec<_>>(), vec![(1, 0), (3, 1), (3, 3)]);
        assert!(super::items(&[1, 1, 7, 0]).is_none());
    }

    #[test]
    fn too_little_history_keeps_the_defaults() {
        let (s, w) = fit(&[1, 2, 1, 0, 3, 0]);
        assert_eq!(s, 0.0);
        assert_eq!(w, DEFAULT_PARAMETERS.to_vec());
    }

    #[test]
    fn fits_weights_from_a_synthetic_log() {
        // 600 cards: a forgetting curve where longer gaps fail more often
        let mut v = vec![600u32];
        let mut seed = 7u32;
        let mut rnd = || { seed = seed.wrapping_mul(1103515245).wrapping_add(12345); (seed >> 16) % 100 };
        for _ in 0..600 {
            let gaps = [1u32, 3, 8, 20];
            v.push(1 + gaps.len() as u32);
            v.extend([1, 0]);
            for g in gaps {
                let fail = rnd() < (5 + g * 2);
                v.extend([if fail { 1 } else { 3 }, g]);
            }
        }
        let (s, w) = fit(&v);
        assert_eq!(s, 1.0);
        assert_eq!(w.len(), 21);
        assert_ne!(w, DEFAULT_PARAMETERS.to_vec());
    }
}
