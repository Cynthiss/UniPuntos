//! Pruebas del programa UniPuntos con LiteSVM (una blockchain simulada en memoria).
//!
//! Cada prueba verifica una garantía que defendemos en la presentación:
//! topes por período, solo la U emite, solo el estudiante quema, puntos
//! no transferibles y comercios inactivos sin canjes.
use {
    anchor_lang::{
        prelude::{Clock, Pubkey},
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    anchor_spl::{
        associated_token::{self, get_associated_token_address_with_program_id},
        token_2022,
        token_interface::spl_token_2022::{
            self,
            extension::{BaseStateWithExtensions, ExtensionType, StateWithExtensions},
            state::{Account as TokenAccountState, Mint as MintState},
        },
    },
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
    unipuntos::{constants::*, state::*},
};

const TOPE_ESTUDIANTE: u64 = 100;
const PRESUPUESTO: u64 = 250;
const PERIODO: u64 = 30 * 24 * 60 * 60; // 30 días

/// Entorno de prueba: programa cargado, universidad con fondos y config inicializada.
struct Entorno {
    svm: LiteSVM,
    universidad: Keypair,
    config: Pubkey,
    mint: Pubkey,
}

fn pda(semillas: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(semillas, &unipuntos::id()).0
}

impl Entorno {
    fn nuevo() -> Self {
        let mut svm = LiteSVM::new();
        let bytes = include_bytes!(concat!(env!("CARGO_TARGET_TMPDIR"), "/../deploy/unipuntos.so"));
        svm.add_program(unipuntos::id(), bytes).unwrap();
        let universidad = Keypair::new();
        svm.airdrop(&universidad.pubkey(), 100_000_000_000).unwrap();

        let mut entorno = Entorno { svm, universidad, config: pda(&[CONFIG_SEED]), mint: pda(&[MINT_SEED]) };
        let ix = Instruction::new_with_bytes(
            unipuntos::id(),
            &unipuntos::instruction::Initialize {
                cap_per_student: TOPE_ESTUDIANTE,
                budget_per_period: PRESUPUESTO,
                period_seconds: PERIODO,
            }
            .data(),
            unipuntos::accounts::Initialize {
                authority: entorno.universidad.pubkey(),
                config: entorno.config,
                mint: entorno.mint,
                token_program: token_2022::ID,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        let universidad = entorno.universidad.insecure_clone();
        entorno.enviar(ix, &[&universidad]).expect("initialize debe funcionar");
        entorno
    }

    /// Envía una transacción pagada por el primer firmante. Devuelve los logs si falla.
    fn enviar(&mut self, ix: Instruction, firmantes: &[&Keypair]) -> Result<(), String> {
        self.svm.expire_blockhash();
        let blockhash = self.svm.latest_blockhash();
        let msg = Message::new_with_blockhash(&[ix], Some(&firmantes[0].pubkey()), &blockhash);
        let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), firmantes).unwrap();
        self.svm.send_transaction(tx).map(|_| ()).map_err(|e| e.meta.logs.join("\n"))
    }

    fn cuenta_de_puntos(&self, estudiante: &Pubkey) -> Pubkey {
        get_associated_token_address_with_program_id(estudiante, &self.mint, &token_2022::ID)
    }

    fn ix_otorgar(&self, autoridad: &Pubkey, estudiante: &Pubkey, cantidad: u64) -> Instruction {
        Instruction::new_with_bytes(
            unipuntos::id(),
            &unipuntos::instruction::AwardPoints { amount: cantidad, reason_hash: [7u8; 32] }.data(),
            unipuntos::accounts::AwardPoints {
                authority: *autoridad,
                config: self.config,
                mint: self.mint,
                student: *estudiante,
                student_state: pda(&[STUDENT_SEED, estudiante.as_ref()]),
                student_tokens: self.cuenta_de_puntos(estudiante),
                token_program: token_2022::ID,
                associated_token_program: associated_token::ID,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        )
    }

    fn otorgar(&mut self, estudiante: &Pubkey, cantidad: u64) -> Result<(), String> {
        let ix = self.ix_otorgar(&self.universidad.pubkey(), estudiante, cantidad);
        let universidad = self.universidad.insecure_clone();
        self.enviar(ix, &[&universidad])
    }

    fn registrar_comercio(&mut self, nombre: &str) -> Pubkey {
        let wallet = Keypair::new().pubkey();
        let ix = Instruction::new_with_bytes(
            unipuntos::id(),
            &unipuntos::instruction::RegisterMerchant { name: nombre.to_string() }.data(),
            unipuntos::accounts::RegisterMerchant {
                authority: self.universidad.pubkey(),
                config: self.config,
                merchant_wallet: wallet,
                merchant: pda(&[MERCHANT_SEED, wallet.as_ref()]),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        let universidad = self.universidad.insecure_clone();
        self.enviar(ix, &[&universidad]).expect("registrar comercio");
        wallet
    }

    fn ix_canjear(&self, estudiante: &Pubkey, comercio: &Pubkey, cantidad: u64, firma_estudiante: bool) -> Instruction {
        let estado = self.leer::<StudentState>(&pda(&[STUDENT_SEED, estudiante.as_ref()]));
        let mut metas = unipuntos::accounts::Redeem {
            payer: self.universidad.pubkey(),
            student: *estudiante,
            config: self.config,
            mint: self.mint,
            student_state: pda(&[STUDENT_SEED, estudiante.as_ref()]),
            student_tokens: self.cuenta_de_puntos(estudiante),
            merchant: pda(&[MERCHANT_SEED, comercio.as_ref()]),
            redemption: pda(&[REDEMPTION_SEED, estudiante.as_ref(), &estado.redemptions.to_le_bytes()]),
            token_program: token_2022::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None);
        if !firma_estudiante {
            // Simula a alguien que intenta quemar sin la firma del estudiante.
            metas.iter_mut().find(|m| m.pubkey == *estudiante).unwrap().is_signer = false;
        }
        Instruction::new_with_bytes(
            unipuntos::id(),
            &unipuntos::instruction::Redeem { amount: cantidad, reward_id: "cafe-2x1".to_string() }.data(),
            metas,
        )
    }

    fn saldo(&self, estudiante: &Pubkey) -> u64 {
        let cuenta = self.svm.get_account(&self.cuenta_de_puntos(estudiante)).unwrap();
        StateWithExtensions::<TokenAccountState>::unpack(&cuenta.data).unwrap().base.amount
    }

    fn leer<T: AccountDeserialize>(&self, direccion: &Pubkey) -> T {
        let cuenta = self.svm.get_account(direccion).unwrap();
        T::try_deserialize(&mut cuenta.data.as_slice()).unwrap()
    }

    fn avanzar_tiempo(&mut self, segundos: u64) {
        let mut reloj: Clock = self.svm.get_sysvar();
        reloj.unix_timestamp += segundos as i64;
        self.svm.set_sysvar(&reloj);
    }
}

#[test]
fn el_mint_es_no_transferible_y_su_autoridad_es_el_programa() {
    let e = Entorno::nuevo();
    let cuenta = e.svm.get_account(&e.mint).unwrap();
    assert_eq!(cuenta.owner, token_2022::ID);

    let mint = StateWithExtensions::<MintState>::unpack(&cuenta.data).unwrap();
    assert_eq!(mint.base.decimals, 0);
    assert_eq!(Option::<Pubkey>::from(mint.base.mint_authority), Some(e.config), "autoridad = PDA config");
    assert_eq!(Option::<Pubkey>::from(mint.base.freeze_authority), None, "nadie puede congelar");
    assert_eq!(mint.get_extension_types().unwrap(), vec![ExtensionType::NonTransferable]);
}

#[test]
fn otorgar_respeta_el_tope_por_estudiante() {
    let mut e = Entorno::nuevo();
    let ana = Keypair::new().pubkey();

    e.otorgar(&ana, 60).unwrap();
    e.otorgar(&ana, 40).unwrap();
    assert_eq!(e.saldo(&ana), 100);

    let logs = e.otorgar(&ana, 1).unwrap_err();
    assert!(logs.contains("StudentCapExceeded"), "{logs}");
    assert_eq!(e.saldo(&ana), 100);
}

#[test]
fn el_tope_se_reinicia_solo_con_el_reloj_de_la_cadena() {
    let mut e = Entorno::nuevo();
    let ana = Keypair::new().pubkey();

    e.otorgar(&ana, 100).unwrap();
    assert!(e.otorgar(&ana, 10).is_err());

    e.avanzar_tiempo(PERIODO);
    e.otorgar(&ana, 100).unwrap();
    assert_eq!(e.saldo(&ana), 200);
}

#[test]
fn otorgar_respeta_el_presupuesto_global() {
    let mut e = Entorno::nuevo();
    // Muchas wallets no permiten saltarse el presupuesto del período.
    for _ in 0..2 {
        e.otorgar(&Keypair::new().pubkey(), 100).unwrap();
    }
    e.otorgar(&Keypair::new().pubkey(), 50).unwrap();
    let logs = e.otorgar(&Keypair::new().pubkey(), 1).unwrap_err();
    assert!(logs.contains("BudgetExceeded"), "{logs}");

    let config: Config = e.leer(&e.config);
    assert_eq!(config.total_awarded, PRESUPUESTO);
}

#[test]
fn solo_la_universidad_puede_otorgar() {
    let mut e = Entorno::nuevo();
    let impostor = Keypair::new();
    e.svm.airdrop(&impostor.pubkey(), 1_000_000_000).unwrap();

    let ix = e.ix_otorgar(&impostor.pubkey(), &impostor.pubkey(), 10);
    let logs = e.enviar(ix, &[&impostor]).unwrap_err();
    assert!(logs.contains("Unauthorized"), "{logs}");
}

#[test]
fn canjear_quema_puntos_y_registra_el_canje() {
    let mut e = Entorno::nuevo();
    let ana = Keypair::new();
    let cafe = e.registrar_comercio("Café del Campus");
    e.otorgar(&ana.pubkey(), 50).unwrap();

    let redemption = pda(&[REDEMPTION_SEED, ana.pubkey().as_ref(), &0u64.to_le_bytes()]);
    let ix = e.ix_canjear(&ana.pubkey(), &cafe, 20, true);
    let universidad = e.universidad.insecure_clone();
    // La U paga la comisión; el estudiante solo firma (no necesita SOL).
    e.enviar(ix, &[&universidad, &ana]).unwrap();

    assert_eq!(e.saldo(&ana.pubkey()), 30);
    let canje: Redemption = e.leer(&redemption);
    assert_eq!((canje.student, canje.merchant, canje.amount), (ana.pubkey(), cafe, 20));
    assert_eq!(canje.reward_id, "cafe-2x1");
    let comercio: Merchant = e.leer(&pda(&[MERCHANT_SEED, cafe.as_ref()]));
    assert_eq!(comercio.total_redeemed, 20);
    let config: Config = e.leer(&e.config);
    assert_eq!(config.total_redeemed, 20);

    // Segundo canje: usa la siguiente semilla y no choca con el primero.
    let ix = e.ix_canjear(&ana.pubkey(), &cafe, 30, true);
    e.enviar(ix, &[&universidad, &ana]).unwrap();
    assert_eq!(e.saldo(&ana.pubkey()), 0);
}

#[test]
fn nadie_puede_quemar_sin_la_firma_del_estudiante() {
    let mut e = Entorno::nuevo();
    let ana = Keypair::new();
    let cafe = e.registrar_comercio("Café del Campus");
    e.otorgar(&ana.pubkey(), 50).unwrap();

    // La universidad intenta canjear en nombre de Ana sin su firma.
    let ix = e.ix_canjear(&ana.pubkey(), &cafe, 50, false);
    let universidad = e.universidad.insecure_clone();
    assert!(e.enviar(ix, &[&universidad]).is_err());
    assert_eq!(e.saldo(&ana.pubkey()), 50);
}

#[test]
fn no_se_puede_canjear_mas_de_lo_que_se_tiene() {
    let mut e = Entorno::nuevo();
    let ana = Keypair::new();
    let cafe = e.registrar_comercio("Café del Campus");
    e.otorgar(&ana.pubkey(), 10).unwrap();

    let ix = e.ix_canjear(&ana.pubkey(), &cafe, 20, true);
    let universidad = e.universidad.insecure_clone();
    assert!(e.enviar(ix, &[&universidad, &ana]).is_err());
    assert_eq!(e.saldo(&ana.pubkey()), 10);
}

#[test]
fn comercio_inactivo_no_recibe_canjes() {
    let mut e = Entorno::nuevo();
    let ana = Keypair::new();
    let cafe = e.registrar_comercio("Café del Campus");
    e.otorgar(&ana.pubkey(), 50).unwrap();

    let ix = Instruction::new_with_bytes(
        unipuntos::id(),
        &unipuntos::instruction::SetMerchantActive { active: false }.data(),
        unipuntos::accounts::SetMerchantActive {
            authority: e.universidad.pubkey(),
            config: e.config,
            merchant: pda(&[MERCHANT_SEED, cafe.as_ref()]),
        }
        .to_account_metas(None),
    );
    let universidad = e.universidad.insecure_clone();
    e.enviar(ix, &[&universidad]).unwrap();

    let ix = e.ix_canjear(&ana.pubkey(), &cafe, 20, true);
    let logs = e.enviar(ix, &[&universidad, &ana]).unwrap_err();
    assert!(logs.contains("MerchantInactive"), "{logs}");
    assert_eq!(e.saldo(&ana.pubkey()), 50);
}

#[test]
fn los_puntos_no_se_pueden_transferir() {
    let mut e = Entorno::nuevo();
    let ana = Keypair::new();
    let bruno = Keypair::new().pubkey();
    e.otorgar(&ana.pubkey(), 50).unwrap();
    e.otorgar(&bruno, 1).unwrap(); // para que Bruno tenga cuenta de puntos

    let ix = spl_token_2022::instruction::transfer_checked(
        &token_2022::ID,
        &e.cuenta_de_puntos(&ana.pubkey()),
        &e.mint,
        &e.cuenta_de_puntos(&bruno),
        &ana.pubkey(),
        &[],
        10,
        0,
    )
    .unwrap();
    let universidad = e.universidad.insecure_clone();
    let logs = e.enviar(ix, &[&universidad, &ana]).unwrap_err();
    assert!(logs.contains("Transfer is disabled for this mint"), "{logs}");
    assert_eq!(e.saldo(&ana.pubkey()), 50);
}

fn ix_limites(autoridad: &Pubkey, config: Pubkey, tope: u64, presupuesto: u64) -> Instruction {
    Instruction::new_with_bytes(
        unipuntos::id(),
        &unipuntos::instruction::UpdateLimits { cap_per_student: tope, budget_per_period: presupuesto }.data(),
        unipuntos::accounts::UpdateLimits { authority: *autoridad, config }.to_account_metas(None),
    )
}

#[test]
fn la_universidad_puede_subir_el_tope_y_se_aplica_de_inmediato() {
    let mut e = Entorno::nuevo();
    let ana = Keypair::new().pubkey();
    e.otorgar(&ana, 100).unwrap();
    assert!(e.otorgar(&ana, 1).is_err(), "con tope 100 no puede recibir más");

    let universidad = e.universidad.insecure_clone();
    e.enviar(ix_limites(&universidad.pubkey(), e.config, 200, PRESUPUESTO), &[&universidad]).unwrap();

    let config: Config = e.leer(&e.config);
    assert_eq!(config.cap_per_student, 200);
    assert_eq!(config.period_seconds, PERIODO, "la duración del período no cambia");

    // En el mismo período ya puede llegar a 200, pero no pasarse.
    e.otorgar(&ana, 100).unwrap();
    assert_eq!(e.saldo(&ana), 200);
    let logs = e.otorgar(&ana, 1).unwrap_err();
    assert!(logs.contains("StudentCapExceeded"), "{logs}");
}

#[test]
fn solo_la_universidad_puede_cambiar_los_limites() {
    let mut e = Entorno::nuevo();
    let impostor = Keypair::new();
    e.svm.airdrop(&impostor.pubkey(), 1_000_000_000).unwrap();

    let logs = e.enviar(ix_limites(&impostor.pubkey(), e.config, 1_000_000, 1_000_000), &[&impostor]).unwrap_err();
    assert!(logs.contains("Unauthorized"), "{logs}");

    let universidad = e.universidad.insecure_clone();
    let logs = e.enviar(ix_limites(&universidad.pubkey(), e.config, 0, PRESUPUESTO), &[&universidad]).unwrap_err();
    assert!(logs.contains("InvalidAmount"), "{logs}");

    let config: Config = e.leer(&e.config);
    assert_eq!(config.cap_per_student, TOPE_ESTUDIANTE);
}
