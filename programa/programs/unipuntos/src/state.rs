use anchor_lang::prelude::*;

use crate::constants::MAX_TEXT_LEN;

/// Configuración global. Es también la autoridad del mint (PDA), así que
/// la única forma de emitir puntos es pasar por `award_points` y sus reglas.
#[account]
#[derive(InitSpace)]
pub struct Config {
    /// Llave de la universidad: la única que puede otorgar puntos y registrar comercios.
    pub authority: Pubkey,
    /// Mint de puntos (Token-2022, NonTransferable, 0 decimales).
    pub mint: Pubkey,
    /// Tope de puntos que un estudiante puede recibir por período (`update_limits` lo cambia).
    pub cap_per_student: u64,
    /// Presupuesto total de puntos que se pueden emitir por período (todos los estudiantes).
    pub budget_per_period: u64,
    /// Duración del período en segundos. Fija desde `initialize`: la U no puede
    /// "adelantar" períodos para reiniciar los topes.
    pub period_seconds: u64,
    /// Período al que corresponde `awarded_in_period`.
    pub budget_period_id: u64,
    /// Puntos emitidos en el período `budget_period_id`.
    pub awarded_in_period: u64,
    /// Totales históricos (auditoría).
    pub total_awarded: u64,
    pub total_redeemed: u64,
    pub bump: u8,
    pub mint_bump: u8,
}

impl Config {
    /// Período actual según el reloj de la cadena.
    pub fn current_period(&self) -> Result<u64> {
        let ahora = Clock::get()?.unix_timestamp.max(0) as u64;
        Ok(ahora / self.period_seconds)
    }
}

/// Estado de cada estudiante (uno por wallet).
#[account]
#[derive(InitSpace)]
pub struct StudentState {
    pub student: Pubkey,
    /// Período al que corresponde `earned_in_period`.
    pub period_id: u64,
    pub earned_in_period: u64,
    /// Número de canjes hechos; se usa como semilla de cada `Redemption`.
    pub redemptions: u64,
    pub bump: u8,
}

/// Comercio registrado por la universidad.
#[account]
#[derive(InitSpace)]
pub struct Merchant {
    /// Wallet del comercio (identifica al comercio; no necesita firmar canjes).
    pub wallet: Pubkey,
    #[max_len(MAX_TEXT_LEN)]
    pub name: String,
    pub active: bool,
    /// Puntos canjeados en este comercio (base para la liquidación).
    pub total_redeemed: u64,
    pub bump: u8,
}

/// Registro de un canje, para la liquidación mensual con el comercio.
#[account]
#[derive(InitSpace)]
pub struct Redemption {
    pub student: Pubkey,
    /// Wallet del comercio.
    pub merchant: Pubkey,
    #[max_len(MAX_TEXT_LEN)]
    pub reward_id: String,
    pub amount: u64,
    pub timestamp: i64,
    pub bump: u8,
}

// Eventos: quedan en los logs de cada transacción y cualquiera puede leerlos.

#[event]
pub struct PointsAwarded {
    pub student: Pubkey,
    pub amount: u64,
    /// sha256 del motivo; el motivo real queda fuera de la cadena.
    pub reason_hash: [u8; 32],
    pub period: u64,
}

#[event]
pub struct PointsRedeemed {
    pub student: Pubkey,
    pub merchant: Pubkey,
    pub reward_id: String,
    pub amount: u64,
    pub redemption: Pubkey,
}

#[event]
pub struct LimitsUpdated {
    pub old_cap_per_student: u64,
    pub old_budget_per_period: u64,
    pub cap_per_student: u64,
    pub budget_per_period: u64,
}

#[event]
pub struct MerchantUpdated {
    pub merchant: Pubkey,
    pub active: bool,
}
