use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::Token2022,
    token_interface::{mint_to, Mint, MintTo, TokenAccount},
};

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Config, PointsAwarded, StudentState},
};

#[derive(Accounts)]
pub struct AwardPoints<'info> {
    /// La universidad: firma y paga las cuentas nuevas.
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ ErrorCode::Unauthorized,
        has_one = mint
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
    /// CHECK: wallet del estudiante; solo se usa como dueño de la cuenta de puntos y semilla.
    pub student: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + StudentState::INIT_SPACE,
        seeds = [STUDENT_SEED, student.key().as_ref()],
        bump
    )]
    pub student_state: Account<'info, StudentState>,
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = student,
        associated_token::token_program = token_program
    )]
    pub student_tokens: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// La universidad otorga puntos respetando dos topes por período:
/// el del estudiante y el presupuesto global.
pub fn handle_award_points(ctx: Context<AwardPoints>, amount: u64, reason_hash: [u8; 32]) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);

    let config = &mut ctx.accounts.config;
    let period = config.current_period()?;

    // Primera vez que el estudiante recibe puntos: se registra.
    let student_state = &mut ctx.accounts.student_state;
    if student_state.student == Pubkey::default() {
        student_state.student = ctx.accounts.student.key();
        student_state.bump = ctx.bumps.student_state;
    }

    // Si cambió el período, los contadores vuelven a cero.
    if student_state.period_id != period {
        student_state.period_id = period;
        student_state.earned_in_period = 0;
    }
    if config.budget_period_id != period {
        config.budget_period_id = period;
        config.awarded_in_period = 0;
    }

    // Tope por estudiante.
    let earned = student_state.earned_in_period.checked_add(amount).ok_or(ErrorCode::Overflow)?;
    require!(earned <= config.cap_per_student, ErrorCode::StudentCapExceeded);

    // Presupuesto global del período.
    let awarded = config.awarded_in_period.checked_add(amount).ok_or(ErrorCode::Overflow)?;
    require!(awarded <= config.budget_per_period, ErrorCode::BudgetExceeded);

    student_state.earned_in_period = earned;
    config.awarded_in_period = awarded;
    config.total_awarded = config.total_awarded.checked_add(amount).ok_or(ErrorCode::Overflow)?;

    // Emitir: firma la PDA config, que es la autoridad del mint.
    let config_seeds: &[&[u8]] = &[CONFIG_SEED, &[config.bump]];
    mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.student_tokens.to_account_info(),
                authority: config.to_account_info(),
            },
            &[config_seeds],
        ),
        amount,
    )?;

    emit!(PointsAwarded { student: ctx.accounts.student.key(), amount, reason_hash, period });
    Ok(())
}
