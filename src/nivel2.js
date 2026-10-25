// =============================================================================
// nivel2.js — Puntos emitidos y canjeados A TRAVÉS del programa Anchor.
//
// Diferencias con el nivel 1:
// - La universidad ya no es el mint authority: lo es el programa (PDA config).
//   Para emitir hay que llamar a `award_points`, que aplica el tope por
//   estudiante y el presupuesto global del período.
// - El canje (`redeem`) exige la firma del estudiante, quema los puntos y deja
//   un registro `Redemption` en la cadena: la liquidación con los comercios se
//   calcula leyendo la cadena, no un archivo del backend.
// - El hash del motivo va en el evento `PointsAwarded` (no hace falta memo).
//
// El cliente se genera a partir del IDL (idl/unipuntos.json), que describe
// las instrucciones y cuentas del programa.
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
  getMint,
} from '@solana/spl-token';
import anchor from '@anchor-lang/core';
import {
  RAIZ, conexion, seed, llaveUniversidad, llaveEstudiante, llaveComercio, validarCantidad,
  hashMotivo, completarMotivo, guardarMotivo, registrarEnHistorial, enlaceExplorador,
  enviarTransaccion,
} from './comun.js';

const { AnchorProvider, Program, Wallet, BN } = anchor;

const idl = JSON.parse(fs.readFileSync(path.join(RAIZ, 'idl', 'unipuntos.json'), 'utf8'));
export const PROGRAM_ID = new PublicKey(idl.address);

// ---------------------------------------------------------------------------
// Direcciones (PDAs): se calculan igual que en el programa
// ---------------------------------------------------------------------------
const pda = (...semillas) =>
  PublicKey.findProgramAddressSync(
    semillas.map((s) => (typeof s === 'string' ? Buffer.from(s) : s)),
    PROGRAM_ID,
  )[0];

export const CONFIG = pda('config');
export const MINT = pda('mint');
const estadoDe = (estudiante) => pda('student', estudiante.toBuffer());
const comercioDe = (wallet) => pda('merchant', wallet.toBuffer());
const canjeDe = (estudiante, numero) => pda('redemption', estudiante.toBuffer(), numero.toArrayLike(Buffer, 'le', 8));
const cuentaDePuntos = (dueno) => getAssociatedTokenAddressSync(MINT, dueno, false, TOKEN_2022_PROGRAM_ID);

// La universidad firma como "provider": paga comisiones y cuentas nuevas.
let programa;
function obtenerPrograma() {
  if (!programa) {
    const proveedor = new AnchorProvider(conexion, new Wallet(llaveUniversidad()), { commitment: 'confirmed' });
    programa = new Program(idl, proveedor);
  }
  return programa;
}

// Convierte los errores del programa (#[error_code]) en mensajes legibles.
async function ejecutar(llamada) {
  try {
    return await llamada();
  } catch (error) {
    throw new Error(error.error?.errorMessage ?? error.message);
  }
}

// ---------------------------------------------------------------------------
// Configuración inicial (la corre una vez la universidad)
// ---------------------------------------------------------------------------

/** Inicializa el programa: crea Config y el mint con sus reglas fijas. */
export async function inicializarPrograma({ topeEstudiante, presupuesto, segundosPeriodo }) {
  const p = obtenerPrograma();
  if (await p.account.config.fetchNullable(CONFIG)) return null; // ya inicializado
  return ejecutar(() =>
    p.methods
      .initialize(new BN(topeEstudiante), new BN(presupuesto), new BN(segundosPeriodo))
      .accountsPartial({
        authority: p.provider.wallet.publicKey,
        config: CONFIG,
        mint: MINT,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc(),
  );
}

/** Registra un comercio del seed en la cadena (si no lo estaba). */
export async function registrarComercio(idComercio) {
  const p = obtenerPrograma();
  const wallet = llaveComercio(idComercio).publicKey;
  if (await p.account.merchant.fetchNullable(comercioDe(wallet))) return null;
  // El programa acepta nombres de hasta 32 bytes: se recorta letra por letra.
  let nombre = seed.comercios.find((c) => c.id === idComercio).nombre;
  while (Buffer.byteLength(nombre) > 32) nombre = [...nombre].slice(0, -1).join('');
  return ejecutar(() =>
    p.methods
      .registerMerchant(nombre)
      .accountsPartial({
        authority: p.provider.wallet.publicKey,
        config: CONFIG,
        merchantWallet: wallet,
        merchant: comercioDe(wallet),
        systemProgram: SystemProgram.programId,
      })
      .rpc(),
  );
}

// ---------------------------------------------------------------------------
// Operaciones (misma interfaz que el nivel 1)
// ---------------------------------------------------------------------------

/** La universidad otorga puntos; el programa rechaza si se pasa algún tope. */
export async function otorgarPuntos(idEstudiante, cantidad, motivo) {
  validarCantidad(cantidad);
  const p = obtenerPrograma();
  const estudiante = llaveEstudiante(idEstudiante).publicKey;

  const motivoCompleto = completarMotivo(idEstudiante, cantidad, motivo);
  const hash = hashMotivo(motivoCompleto);

  const tx = await p.methods
      .awardPoints(new BN(cantidad), Array.from(Buffer.from(hash, 'hex')))
      .accountsPartial({
        authority: p.provider.wallet.publicKey,
        config: CONFIG,
        mint: MINT,
        student: estudiante,
        studentState: estadoDe(estudiante),
        studentTokens: cuentaDePuntos(estudiante),
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .transaction();
  const firma = await enviarTransaccion(tx, [llaveUniversidad()]);

  guardarMotivo(hash, motivoCompleto);
  registrarEnHistorial({ tipo: 'award', estudiante: idEstudiante, cantidad, hash, firma, fecha: motivoCompleto.fecha });
  return { firma, hash };
}

/**
 * El estudiante canjea: firma él (dueño de los puntos) y la universidad paga.
 * El programa quema los puntos y crea el registro `Redemption`.
 * `alFirmar` recibe la firma antes de enviar (ver enviarTransaccion en comun.js).
 */
export async function canjearPuntos(idEstudiante, cantidad, { recompensa, comercio }, { alFirmar } = {}) {
  validarCantidad(cantidad);
  const p = obtenerPrograma();
  const llave = llaveEstudiante(idEstudiante);
  const estudiante = llave.publicKey;
  const walletComercio = llaveComercio(comercio).publicKey;

  const saldo = await consultarSaldo(idEstudiante);
  if (saldo < cantidad) {
    throw new Error(`Saldo insuficiente: tiene ${saldo} puntos y se necesitan ${cantidad}.`);
  }

  // Cada canje usa como semilla el número de canjes previos del estudiante.
  const estado = await p.account.studentState.fetch(estadoDe(estudiante));
  const canje = canjeDe(estudiante, estado.redemptions);

  const tx = await p.methods
      .redeem(new BN(cantidad), recompensa)
      .accountsPartial({
        payer: p.provider.wallet.publicKey,
        student: estudiante,
        config: CONFIG,
        mint: MINT,
        studentState: estadoDe(estudiante),
        studentTokens: cuentaDePuntos(estudiante),
        merchant: comercioDe(walletComercio),
        redemption: canje,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .transaction();
  // La universidad va primero: es la que paga la comisión.
  const firma = await enviarTransaccion(tx, [llaveUniversidad(), llave], { alFirmar });

  registrarEnHistorial({
    tipo: 'redeem', estudiante: idEstudiante, cantidad, firma, fecha: new Date().toISOString(),
    recompensa, comercio, cuentaCanje: canje.toBase58(),
  });
  return { firma, canje: canje.toBase58() };
}

/** Saldo de puntos leído directamente de la cadena. */
export async function consultarSaldo(idEstudiante) {
  const estudiante = llaveEstudiante(idEstudiante).publicKey;
  try {
    const cuenta = await getAccount(conexion, cuentaDePuntos(estudiante), 'confirmed', TOKEN_2022_PROGRAM_ID);
    return Number(cuenta.amount);
  } catch (error) {
    if (error.name === 'TokenAccountNotFoundError') return 0;
    throw error;
  }
}

/** Emisión y reglas del programa: todo verificable por cualquiera en la cadena. */
export async function consultarEmision() {
  const config = await obtenerPrograma().account.config.fetchNullable(CONFIG);
  if (!config) throw new Error('El programa no está inicializado. Corre: npm run inicializar-programa');
  const mint = await getMint(conexion, MINT, 'confirmed', TOKEN_2022_PROGRAM_ID);
  return {
    mint: MINT.toBase58(),
    enCirculacion: Number(mint.supply),
    programa: PROGRAM_ID.toBase58(),
    totalOtorgado: config.totalAwarded.toNumber(),
    totalCanjeado: config.totalRedeemed.toNumber(),
    topeEstudiante: config.capPerStudent.toNumber(),
    presupuestoPeriodo: config.budgetPerPeriod.toNumber(),
    otorgadoEnPeriodo: config.awardedInPeriod.toNumber(),
    diasPorPeriodo: config.periodSeconds.toNumber() / 86_400,
  };
}

/**
 * Canjes de un comercio leídos de las cuentas `Redemption` en la cadena.
 * Es la base de la liquidación: no depende de ningún archivo del backend.
 */
export async function canjesDeComercio(idComercio) {
  const wallet = llaveComercio(idComercio).publicKey;
  // En Redemption, el comercio está después del discriminador (8) y del estudiante (32).
  const cuentas = await obtenerPrograma().account.redemption.all([
    { memcmp: { offset: 8 + 32, bytes: wallet.toBase58() } },
  ]);
  return cuentas
    .map(({ publicKey, account }) => ({
      recompensa: account.rewardId,
      cantidad: account.amount.toNumber(),
      fecha: new Date(account.timestamp.toNumber() * 1000).toISOString(),
      explorador: enlaceExplorador(publicKey.toBase58(), 'address'),
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}
