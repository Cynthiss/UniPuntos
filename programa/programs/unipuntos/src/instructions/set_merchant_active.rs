use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Config, Merchant, MerchantUpdated},
};

#[derive(Accounts)]
pub struct SetMerchantActive<'info> {
    pub authority: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump, has_one = authority @ ErrorCode::Unauthorized)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [MERCHANT_SEED, merchant.wallet.as_ref()], bump = merchant.bump)]
    pub merchant: Account<'info, Merchant>,
}

/// La universidad activa o desactiva un comercio. Un comercio inactivo no
/// puede recibir canjes; los puntos de los estudiantes no se tocan.
pub fn handle_set_merchant_active(ctx: Context<SetMerchantActive>, active: bool) -> Result<()> {
    ctx.accounts.merchant.active = active;
    emit!(MerchantUpdated { merchant: ctx.accounts.merchant.wallet, active });
    Ok(())
}
