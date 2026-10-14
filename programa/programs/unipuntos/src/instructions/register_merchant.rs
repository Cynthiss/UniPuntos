use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Config, Merchant, MerchantUpdated},
};

#[derive(Accounts)]
pub struct RegisterMerchant<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = authority @ ErrorCode::Unauthorized)]
    pub config: Account<'info, Config>,
    /// CHECK: wallet del comercio; solo se usa como identificador y semilla.
    pub merchant_wallet: UncheckedAccount<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + Merchant::INIT_SPACE,
        seeds = [MERCHANT_SEED, merchant_wallet.key().as_ref()],
        bump
    )]
    pub merchant: Account<'info, Merchant>,
    pub system_program: Program<'info, System>,
}

/// La universidad registra un comercio (queda activo).
pub fn handle_register_merchant(ctx: Context<RegisterMerchant>, name: String) -> Result<()> {
    require!(name.len() <= MAX_TEXT_LEN, ErrorCode::TextTooLong);

    let wallet = ctx.accounts.merchant_wallet.key();
    ctx.accounts.merchant.set_inner(Merchant {
        wallet,
        name,
        active: true,
        total_redeemed: 0,
        bump: ctx.bumps.merchant,
    });

    emit!(MerchantUpdated { merchant: wallet, active: true });
    Ok(())
}
