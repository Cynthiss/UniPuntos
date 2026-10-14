//! UniPuntos — nivel 2.
//!
//! Programa de Solana (Anchor) con las reglas de los puntos:
//! - El programa es el mint authority (PDA `config`): no hay otra forma de
//!   emitir puntos que `award_points`, que respeta los topes por período.
//! - El período lo marca el reloj de la cadena, no la universidad.
//! - NO existe ninguna instrucción que quite puntos sin la firma del
//!   estudiante: la única que quema es `redeem`, y exige su firma.
pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("GKpeeXMXGGuSd3CGKsnkyVn85wGoJ56nxoexrtpRZKHb");

#[program]
pub mod unipuntos {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        cap_per_student: u64,
        budget_per_period: u64,
        period_seconds: u64,
    ) -> Result<()> {
        crate::instructions::initialize::handle_initialize(ctx, cap_per_student, budget_per_period, period_seconds)
    }

    pub fn register_merchant(ctx: Context<RegisterMerchant>, name: String) -> Result<()> {
        crate::instructions::register_merchant::handle_register_merchant(ctx, name)
    }

    pub fn set_merchant_active(ctx: Context<SetMerchantActive>, active: bool) -> Result<()> {
        crate::instructions::set_merchant_active::handle_set_merchant_active(ctx, active)
    }

    pub fn award_points(ctx: Context<AwardPoints>, amount: u64, reason_hash: [u8; 32]) -> Result<()> {
        crate::instructions::award_points::handle_award_points(ctx, amount, reason_hash)
    }

    pub fn redeem(ctx: Context<Redeem>, amount: u64, reward_id: String) -> Result<()> {
        crate::instructions::redeem::handle_redeem(ctx, amount, reward_id)
    }
}
