use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Config, LimitsUpdated},
};

#[derive(Accounts)]
pub struct UpdateLimits<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = authority @ ErrorCode::Unauthorized)]
    pub config: Account<'info, Config>,
}

/// La universidad cambia el tope por estudiante y el presupuesto por período.
///
/// - Solo la autoridad puede hacerlo, y cada cambio emite `LimitsUpdated`:
///   cualquiera puede auditar cuándo y cómo cambiaron las reglas.
/// - La duración del período NO se puede cambiar: así la U no puede
///   "adelantar" períodos para reiniciar los topes.
/// - No toca los puntos que ya tienen los estudiantes.
pub fn handle_update_limits(ctx: Context<UpdateLimits>, cap_per_student: u64, budget_per_period: u64) -> Result<()> {
    require!(cap_per_student > 0 && budget_per_period > 0, ErrorCode::InvalidAmount);
    let config = &mut ctx.accounts.config;
    emit!(LimitsUpdated {
        old_cap_per_student: config.cap_per_student,
        old_budget_per_period: config.budget_per_period,
        cap_per_student,
        budget_per_period,
    });
    config.cap_per_student = cap_per_student;
    config.budget_per_period = budget_per_period;
    Ok(())
}
