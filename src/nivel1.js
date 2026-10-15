// =============================================================================
// nivel1.js — Puntos emitidos directamente con la llave de la universidad.
//
// - Los puntos son un token Token-2022 con la extensión NonTransferable.
// - La universidad es el mint authority: solo ella emite, pero SIN tope
//   (limitación conocida; la resuelve el nivel 2).
// - Solo el estudiante puede quemar sus puntos: el burn exige SU firma.
// - En la cadena va la cantidad y el hash del motivo en un memo.
// - La universidad paga las comisiones (fee payer); el estudiante no necesita SOL.
// =============================================================================
import path from 'node:path';
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  createBurnInstruction,
  getAccount,
  getMint,
} from '@solana/spl-token';
import {
  RAIZ, conexion, leerJson, llaveUniversidad, llaveEstudiante, validarCantidad,
  hashMotivo, completarMotivo, guardarMotivo, registrarEnHistorial, canjesDelHistorial,
} from './comun.js';

const ARCHIVO_MINT = path.join(RAIZ, 'data', 'mint.local.json');

// Programa Memo de Solana: guarda un texto corto en la transacción.
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

export function direccionMint() {
  const datos = leerJson(ARCHIVO_MINT, null);
  if (!datos) throw new Error('No hay mint. Corre primero: npm run crear-mint');
  return new PublicKey(datos.mint);
}

// Cuenta de token asociada (ATA) del estudiante para el mint de puntos.
function cuentaDePuntos(dueno) {
  return getAssociatedTokenAddressSync(direccionMint(), dueno, false, TOKEN_2022_PROGRAM_ID);
}

// En la cadena solo va "unipuntos:<accion>:<sha256>".
function instruccionMemo(texto, firmantes) {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: firmantes.map((pubkey) => ({ pubkey, isSigner: true, isWritable: false })),
    data: Buffer.from(texto, 'utf8'),
  });
}

/**
 * La universidad otorga puntos a un estudiante.
 * @param {string} idEstudiante  id del seed (ana, bruno, carla)
 * @param {number} cantidad      puntos enteros (> 0)
 * @param {object} motivo        datos off-chain, p. ej. { conducta: 'pago-puntual' }
 */
export async function otorgarPuntos(idEstudiante, cantidad, motivo) {
  validarCantidad(cantidad);
  const universidad = llaveUniversidad();
  const estudiante = llaveEstudiante(idEstudiante);
  const mint = direccionMint();
  const ata = cuentaDePuntos(estudiante.publicKey);

  const motivoCompleto = completarMotivo(idEstudiante, cantidad, motivo);
  const hash = hashMotivo(motivoCompleto);

  const tx = new Transaction().add(
    // Crea la cuenta de puntos del estudiante si aún no existe (la paga la U).
    createAssociatedTokenAccountIdempotentInstruction(
      universidad.publicKey, ata, estudiante.publicKey, mint, TOKEN_2022_PROGRAM_ID,
    ),
    // Emite los puntos: solo funciona con la firma del mint authority (la U).
    createMintToInstruction(mint, ata, universidad.publicKey, cantidad, [], TOKEN_2022_PROGRAM_ID),
    instruccionMemo(`unipuntos:award:${hash}`, [universidad.publicKey]),
  );

  const firma = await sendAndConfirmTransaction(conexion, tx, [universidad]);
  guardarMotivo(hash, motivoCompleto);
  registrarEnHistorial({ tipo: 'award', estudiante: idEstudiante, cantidad, hash, firma, fecha: motivoCompleto.fecha });
  return { firma, hash };
}

/**
 * El estudiante quema puntos para canjear una recompensa.
 * La transacción la firman DOS partes:
 *   - el estudiante (dueño de los puntos): sin su firma no se puede quemar nada.
 *   - la universidad, solo como fee payer (paga la comisión).
 */
export async function canjearPuntos(idEstudiante, cantidad, detalle) {
  validarCantidad(cantidad);
  const universidad = llaveUniversidad();
  const estudiante = llaveEstudiante(idEstudiante);
  const mint = direccionMint();
  const ata = cuentaDePuntos(estudiante.publicKey);

  const saldo = await consultarSaldo(idEstudiante);
  if (saldo < cantidad) {
    throw new Error(`Saldo insuficiente: tiene ${saldo} puntos y se necesitan ${cantidad}.`);
  }

  const registro = { estudiante: idEstudiante, cantidad, ...detalle, fecha: new Date().toISOString() };
  const hash = hashMotivo(registro);

  const tx = new Transaction().add(
    createBurnInstruction(ata, mint, estudiante.publicKey, cantidad, [], TOKEN_2022_PROGRAM_ID),
    instruccionMemo(`unipuntos:redeem:${hash}`, [estudiante.publicKey]),
  );
  tx.feePayer = universidad.publicKey;

  const firma = await sendAndConfirmTransaction(conexion, tx, [universidad, estudiante]);
  guardarMotivo(hash, registro);
  registrarEnHistorial({
    tipo: 'redeem', estudiante: idEstudiante, cantidad, hash, firma, fecha: registro.fecha,
    recompensa: detalle?.recompensa, comercio: detalle?.comercio,
  });
  return { firma, hash };
}

/** Saldo de puntos leído directamente de la cadena. */
export async function consultarSaldo(idEstudiante) {
  const estudiante = llaveEstudiante(idEstudiante);
  try {
    const cuenta = await getAccount(conexion, cuentaDePuntos(estudiante.publicKey), 'confirmed', TOKEN_2022_PROGRAM_ID);
    return Number(cuenta.amount);
  } catch (error) {
    // Si la cuenta todavía no existe, el estudiante no ha recibido puntos.
    if (error.name === 'TokenAccountNotFoundError') return 0;
    throw error;
  }
}

/** Emisión total en circulación: cualquiera puede verificarla en la cadena. */
export async function consultarEmision() {
  const mint = await getMint(conexion, direccionMint(), 'confirmed', TOKEN_2022_PROGRAM_ID);
  return { mint: mint.address.toBase58(), enCirculacion: Number(mint.supply) };
}

/** Canjes de un comercio, para la liquidación mensual (registro off-chain). */
export async function canjesDeComercio(idComercio) {
  return canjesDelHistorial(idComercio);
}
