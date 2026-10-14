use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    token_interface::{burn, Burn, Mint, TokenAccount},
};

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Config, Merchant, PointsRedeemed, Redemption, StudentState},
};

#[derive(Accounts)]
pub struct Redeem<'info> {
    /// Paga la comisión y la cuenta `Redemption` (en la práctica, la universidad).
    #[account(mut)]
    pub payer: Signer<'info>,
    /// El estudiante DEBE firmar: es la única forma de quemar sus puntos.
    pub student: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = mint)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [STUDENT_SEED, student.key().as_ref()],
        bump = student_state.bump
    )]
    pub student_state: Account<'info, StudentState>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = student,
        associated_token::token_program = token_program
    )]
    pub student_tokens: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [MERCHANT_SEED, merchant.wallet.as_ref()],
        bump = merchant.bump,
        constraint = merchant.active @ ErrorCode::MerchantInactive
    )]
    pub merchant: Account<'info, Merchant>,
    #[account(
        init,
        payer = payer,
        space = 8 + Redemption::INIT_SPACE,
        seeds = [REDEMPTION_SEED, student.key().as_ref(), &student_state.redemptions.to_le_bytes()],
        bump
    )]
    pub redemption: Account<'info, Redemption>,
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

/// El estudiante quema puntos para canjear una recompensa en un comercio activo.
/// Queda un registro `Redemption` para la liquidación mensual.
pub fn handle_redeem(ctx: Context<Redeem>, amount: u64, reward_id: String) -> Result<()> {
    require!(amount > 0, ErrorCode::InvalidAmount);
    require!(reward_id.len() <= MAX_TEXT_LEN, ErrorCode::TextTooLong);

    // Quemar: la autoridad es el estudiante (firmante), no la universidad.
    // Si el saldo no alcanza, Token-2022 rechaza la instrucción.
    burn(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.student_tokens.to_account_info(),
                authority: ctx.accounts.student.to_account_info(),
            },
        ),
        amount,
    )?;

    let student = ctx.accounts.student.key();
    let merchant_wallet = ctx.accounts.merchant.wallet;
    ctx.accounts.redemption.set_inner(Redemption {
        student,
        merchant: merchant_wallet,
        reward_id: reward_id.clone(),
        amount,
        timestamp: Clock::get()?.unix_timestamp,
        bump: ctx.bumps.redemption,
    });

    let student_state = &mut ctx.accounts.student_state;
    student_state.redemptions = student_state.redemptions.checked_add(1).ok_or(ErrorCode::Overflow)?;
    let merchant = &mut ctx.accounts.merchant;
    merchant.total_redeemed = merchant.total_redeemed.checked_add(amount).ok_or(ErrorCode::Overflow)?;
    let config = &mut ctx.accounts.config;
    config.total_redeemed = config.total_redeemed.checked_add(amount).ok_or(ErrorCode::Overflow)?;

    emit!(PointsRedeemed {
        student,
        merchant: merchant_wallet,
        reward_id,
        amount,
        redemption: ctx.accounts.redemption.key(),
    });
    Ok(())
}
