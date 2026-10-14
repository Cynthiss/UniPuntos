use anchor_lang::{
    prelude::*,
    system_program::{create_account, CreateAccount},
};
use anchor_spl::{
    token_2022::Token2022,
    token_interface::{
        initialize_mint2, non_transferable_mint_initialize,
        spl_token_2022::{extension::ExtensionType, state::Mint as MintState},
        InitializeMint2, NonTransferableMintInitialize,
    },
};

use crate::{constants::*, error::ErrorCode, state::Config};

#[derive(Accounts)]
pub struct Initialize<'info> {
    /// La universidad: queda como autoridad y paga la creación de las cuentas.
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    /// CHECK: se crea e inicializa aquí mismo como mint Token-2022.
    /// Al ser una PDA de este programa, su dirección es única y conocida.
    #[account(mut, seeds = [MINT_SEED], bump)]
    pub mint: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

/// Crea la configuración y el mint de puntos.
///
/// El mint queda así:
/// - extensión NonTransferable: los puntos no se pueden transferir;
/// - 0 decimales;
/// - mint authority = PDA `config` (solo este programa puede emitir);
/// - sin freeze authority y sin permanent delegate: nadie puede congelar
///   ni quitar puntos de una cuenta.
pub fn handle_initialize(
    ctx: Context<Initialize>,
    cap_per_student: u64,
    budget_per_period: u64,
    period_seconds: u64,
) -> Result<()> {
    require!(period_seconds > 0, ErrorCode::InvalidPeriod);
    require!(cap_per_student > 0 && budget_per_period > 0, ErrorCode::InvalidAmount);

    let mint = &ctx.accounts.mint;
    let token_program = &ctx.accounts.token_program;

    // 1. Crear la cuenta del mint con espacio para la extensión NonTransferable.
    let space = ExtensionType::try_calculate_account_len::<MintState>(&[ExtensionType::NonTransferable])?;
    let lamports = Rent::get()?.minimum_balance(space);
    let mint_bump = ctx.bumps.mint;
    let mint_seeds: &[&[u8]] = &[MINT_SEED, &[mint_bump]];
    create_account(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.key(),
            CreateAccount {
                from: ctx.accounts.authority.to_account_info(),
                to: mint.to_account_info(),
            },
            &[mint_seeds],
        ),
        lamports,
        space as u64,
        &token_program.key(),
    )?;

    // 2. Activar NonTransferable (debe hacerse ANTES de inicializar el mint).
    non_transferable_mint_initialize(CpiContext::new(
        token_program.key(),
        NonTransferableMintInitialize {
            token_program_id: token_program.to_account_info(),
            mint: mint.to_account_info(),
        },
    ))?;

    // 3. Inicializar el mint: autoridad = PDA config, sin freeze authority.
    initialize_mint2(
        CpiContext::new(token_program.key(), InitializeMint2 { mint: mint.to_account_info() }),
        0,
        &ctx.accounts.config.key(),
        None,
    )?;

    let config = &mut ctx.accounts.config;
    config.set_inner(Config {
        authority: ctx.accounts.authority.key(),
        mint: mint.key(),
        cap_per_student,
        budget_per_period,
        period_seconds,
        budget_period_id: 0,
        awarded_in_period: 0,
        total_awarded: 0,
        total_redeemed: 0,
        bump: ctx.bumps.config,
        mint_bump,
    });

    msg!("UniPuntos inicializado. Mint: {}", mint.key());
    Ok(())
}
