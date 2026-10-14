use anchor_lang::prelude::*;

// Semillas de las PDAs (direcciones derivadas del programa).

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";

#[constant]
pub const MINT_SEED: &[u8] = b"mint";

#[constant]
pub const STUDENT_SEED: &[u8] = b"student";

#[constant]
pub const MERCHANT_SEED: &[u8] = b"merchant";

#[constant]
pub const REDEMPTION_SEED: &[u8] = b"redemption";

/// Largo máximo del nombre de un comercio y del id de una recompensa.
pub const MAX_TEXT_LEN: usize = 32;
