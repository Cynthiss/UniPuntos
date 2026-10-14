// =============================================================================
// puntos.js — Lógica central de UniPuntos (nivel 1).
//
// Lo usan los scripts (award, redeem, balance) y el servidor web.
//
// Ideas clave para la presentación:
// - Los puntos son un token Token-2022 con la extensión NonTransferable.
// - Solo la universidad (mint authority) puede emitir puntos.
// - Solo el estudiante puede quemar sus puntos: el burn exige SU firma.
// - En la cadena va la cantidad y un hash del motivo (memo), nunca el motivo.
//   El motivo completo se guarda fuera de la cadena (data/motivos.local.json).
// - La universidad paga las comisiones (fee payer); el estudiante no necesita SOL.
//
// DEMO: el backend genera y guarda las llaves de los estudiantes (custodia).
// En producción cada estudiante tendría su propia wallet embebida con WDK
// y firmaría el canje desde su celular; el backend nunca vería su llave.
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  Connection,
  Keypair,
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

// ---------------------------------------------------------------------------
// Rutas y configuración
// ---------------------------------------------------------------------------
export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR_LLAVES = path.join(RAIZ, 'keys');
const DIR_LLAVES_ESTUDIANTES = path.join(DIR_LLAVES, 'estudiantes');
const ARCHIVO_MINT = path.join(RAIZ, 'data', 'mint.local.json');
const ARCHIVO_MOTIVOS = path.join(RAIZ, 'data', 'motivos.local.json');
const ARCHIVO_HISTORIAL = path.join(RAIZ, 'data', 'historial.local.json');

export const URL_RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

// Programa Memo de Solana: guarda un texto corto en la transacción.
const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

export const conexion = new Connection(URL_RPC, 'confirmed');
export const seed = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'seed.json'), 'utf8'));

// ---------------------------------------------------------------------------
// Utilidades de archivos
// ---------------------------------------------------------------------------
function leerJson(archivo, porDefecto) {
  if (!fs.existsSync(archivo)) return porDefecto;
  return JSON.parse(fs.readFileSync(archivo, 'utf8'));
}

function escribirJson(archivo, datos) {
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  fs.writeFileSync(archivo, JSON.stringify(datos, null, 2));
}

function cargarKeypair(archivo) {
  const bytes = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

export function enlaceExplorador(firmaOCuenta, tipo = 'tx') {
  return `https://explorer.solana.com/${tipo}/${firmaOCuenta}?cluster=devnet`;
}

// ---------------------------------------------------------------------------
// Llaves: universidad, mint y estudiantes
// ---------------------------------------------------------------------------
export function llaveUniversidad() {
  const archivo = path.join(DIR_LLAVES, 'universidad.json');
  if (!fs.existsSync(archivo)) {
    throw new Error('Falta keys/universidad.json. Revisa el README (paso de configuración).');
  }
  return cargarKeypair(archivo);
}

export function direccionMint() {
  const datos = leerJson(ARCHIVO_MINT, null);
  if (!datos) throw new Error('No hay mint. Corre primero: npm run crear-mint');
  return new PublicKey(datos.mint);
}

export function buscarEstudiante(id) {
  const estudiante = seed.estudiantes.find((e) => e.id === id);
  if (!estudiante) {
    const ids = seed.estudiantes.map((e) => e.id).join(', ');
    throw new Error(`Estudiante "${id}" no existe. Opciones: ${ids}`);
  }
  return estudiante;
}

// DEMO (custodia): si el estudiante no tiene llave, el backend la genera.
// En producción esto lo reemplaza la wallet del estudiante creada con WDK.
export function llaveEstudiante(id) {
  buscarEstudiante(id);
  const archivo = path.join(DIR_LLAVES_ESTUDIANTES, `${id}.json`);
  if (!fs.existsSync(archivo)) {
    const nueva = Keypair.generate();
    fs.mkdirSync(DIR_LLAVES_ESTUDIANTES, { recursive: true });
    fs.writeFileSync(archivo, JSON.stringify(Array.from(nueva.secretKey)), { mode: 0o600 });
  }
  return cargarKeypair(archivo);
}

// Cuenta de token asociada (ATA) del estudiante para el mint de puntos.
function cuentaDePuntos(dueno) {
  return getAssociatedTokenAddressSync(direccionMint(), dueno, false, TOKEN_2022_PROGRAM_ID);
}

// ---------------------------------------------------------------------------
// Memo con hash del motivo (privacidad)
// ---------------------------------------------------------------------------
// El motivo completo (quién, qué conducta, cuándo, notas) se queda fuera de la
// cadena. En la cadena solo va "unipuntos:<accion>:<sha256>". Con el registro
// off-chain cualquiera autorizado puede verificar que el hash coincide, pero
// quien solo mira la cadena no aprende nada del estudiante.
export function hashMotivo(motivo) {
  return crypto.createHash('sha256').update(JSON.stringify(motivo)).digest('hex');
}

function instruccionMemo(texto, firmantes) {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: firmantes.map((pubkey) => ({ pubkey, isSigner: true, isWritable: false })),
    data: Buffer.from(texto, 'utf8'),
  });
}

function guardarMotivo(hash, motivo) {
  const motivos = leerJson(ARCHIVO_MOTIVOS, {});
  motivos[hash] = motivo;
  escribirJson(ARCHIVO_MOTIVOS, motivos);
}

function registrarEnHistorial(entrada) {
  const historial = leerJson(ARCHIVO_HISTORIAL, []);
  historial.push(entrada);
  escribirJson(ARCHIVO_HISTORIAL, historial);
}

// ---------------------------------------------------------------------------
// Operaciones
// ---------------------------------------------------------------------------

/**
 * La universidad otorga puntos a un estudiante.
 * @param {string} idEstudiante  id del seed (ana, bruno, carla)
 * @param {number} cantidad      puntos enteros (> 0)
 * @param {object} motivo        datos off-chain, p. ej. { conducta: 'pago-puntual', mes: '2026-10' }
 */
export async function otorgarPuntos(idEstudiante, cantidad, motivo) {
  validarCantidad(cantidad);
  const universidad = llaveUniversidad();
  const estudiante = llaveEstudiante(idEstudiante);
  const mint = direccionMint();
  const ata = cuentaDePuntos(estudiante.publicKey);

  // Se agrega fecha y un valor aleatorio para que dos premios iguales
  // no produzcan el mismo hash (y no se puedan correlacionar entre sí).
  const motivoCompleto = {
    estudiante: idEstudiante,
    cantidad,
    ...motivo,
    fecha: new Date().toISOString(),
    sal: crypto.randomBytes(8).toString('hex'),
  };
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

/** Historial de un estudiante (registro off-chain con enlaces a la cadena). */
export function historialDe(idEstudiante) {
  return leerJson(ARCHIVO_HISTORIAL, []).filter((h) => h.estudiante === idEstudiante).reverse();
}

/** Todos los canjes, para la liquidación mensual con los comercios. */
export function canjesRegistrados() {
  return leerJson(ARCHIVO_HISTORIAL, []).filter((h) => h.tipo === 'redeem');
}

function validarCantidad(cantidad) {
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    throw new Error('La cantidad debe ser un número entero mayor que 0.');
  }
}
