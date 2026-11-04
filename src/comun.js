// =============================================================================
// comun.js — Utilidades compartidas por el nivel 1 y el nivel 2.
//
// Llaves, datos de prueba, conexión a Solana, hash del motivo y el registro
// off-chain (motivos e historial).
//
// DEMO: el backend genera y guarda las llaves de los estudiantes y comercios
// (custodia). En producción cada estudiante tendría su propia wallet embebida
// con WDK y firmaría el canje desde su celular; el backend nunca vería su llave.
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Connection, Keypair, SendTransactionError } from '@solana/web3.js';
import bs58 from 'bs58';

// ---------------------------------------------------------------------------
// Rutas y configuración
// ---------------------------------------------------------------------------
export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR_LLAVES = path.join(RAIZ, 'keys');
const ARCHIVO_MOTIVOS = path.join(RAIZ, 'data', 'motivos.local.json');

// Variables opcionales de .env (SOLANA_RPC_URL, UNIPUNTOS_NIVEL, PORT).
// Las que ya vienen del entorno tienen prioridad.
if (fs.existsSync(path.join(RAIZ, '.env'))) process.loadEnvFile(path.join(RAIZ, '.env'));

// Cada nivel usa un mint distinto, así que cada uno lleva su propio historial.
const ARCHIVO_HISTORIAL = path.join(RAIZ, 'data', `historial-nivel${process.env.UNIPUNTOS_NIVEL || 1}.local.json`);

export const URL_RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
export const conexion = new Connection(URL_RPC, 'confirmed');
export const seed = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'seed.json'), 'utf8'));

// ---------------------------------------------------------------------------
// Utilidades de archivos
// ---------------------------------------------------------------------------
export function leerJson(archivo, porDefecto) {
  if (!fs.existsSync(archivo)) return porDefecto;
  return JSON.parse(fs.readFileSync(archivo, 'utf8'));
}

export function escribirJson(archivo, datos) {
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  fs.writeFileSync(archivo, JSON.stringify(datos, null, 2));
}

function cargarKeypair(archivo) {
  const bytes = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

// ---------------------------------------------------------------------------
// Llaves en un servidor (Render u otro hosting)
// ---------------------------------------------------------------------------
// En un servidor no existe la carpeta keys/. Las llaves llegan en un solo
// paquete JSON ({"universidad": [...], "estudiantes/ana": [...], ...}),
// generado con `npm run exportar-llaves`, por una de estas vías:
//   - un archivo secreto (en Render: /etc/secrets/llaves.json), o
//   - la variable de entorno UNIPUNTOS_LLAVES con el JSON completo.
// Con paquete NO se generan llaves nuevas: una wallet nueva no tendría los
// puntos de la demo y se perdería al reiniciar el servidor.
const ARCHIVO_PAQUETE = process.env.UNIPUNTOS_LLAVES_ARCHIVO || '/etc/secrets/llaves.json';
const paqueteDeLlaves = (() => {
  if (process.env.UNIPUNTOS_LLAVES) return JSON.parse(process.env.UNIPUNTOS_LLAVES);
  if (fs.existsSync(ARCHIVO_PAQUETE)) return JSON.parse(fs.readFileSync(ARCHIVO_PAQUETE, 'utf8'));
  return null;
})();

function llaveDelPaquete(nombre) {
  const bytes = paqueteDeLlaves[nombre];
  if (!bytes) throw new Error(`La llave "${nombre}" no está en el paquete de llaves del servidor.`);
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

// Carga una llave o, si no existe, la genera (custodia de la demo).
function llaveCustodiada(carpeta, id) {
  if (paqueteDeLlaves) return llaveDelPaquete(`${carpeta}/${id}`);
  const archivo = path.join(DIR_LLAVES, carpeta, `${id}.json`);
  if (!fs.existsSync(archivo)) {
    const nueva = Keypair.generate();
    fs.mkdirSync(path.dirname(archivo), { recursive: true });
    fs.writeFileSync(archivo, JSON.stringify(Array.from(nueva.secretKey)), { mode: 0o600 });
  }
  return cargarKeypair(archivo);
}

export function enlaceExplorador(firmaOCuenta, tipo = 'tx') {
  // Con un validador local el explorador necesita la URL del RPC.
  const cluster = URL_RPC.includes('devnet')
    ? 'cluster=devnet'
    : `cluster=custom&customUrl=${encodeURIComponent(URL_RPC)}`;
  return `https://explorer.solana.com/${tipo}/${firmaOCuenta}?${cluster}`;
}

// ---------------------------------------------------------------------------
// Llaves y datos de prueba
// ---------------------------------------------------------------------------
export function llaveUniversidad() {
  if (paqueteDeLlaves) return llaveDelPaquete('universidad');
  const archivo = path.join(DIR_LLAVES, 'universidad.json');
  if (!fs.existsSync(archivo)) {
    throw new Error('Falta keys/universidad.json. Revisa el README (paso de configuración).');
  }
  return cargarKeypair(archivo);
}

export function buscarEstudiante(id) {
  const estudiante = seed.estudiantes.find((e) => e.id === id);
  if (!estudiante) {
    const ids = seed.estudiantes.map((e) => e.id).join(', ');
    throw new Error(`Estudiante "${id}" no existe. Opciones: ${ids}`);
  }
  return estudiante;
}

export function llaveEstudiante(id) {
  buscarEstudiante(id);
  return llaveCustodiada('estudiantes', id);
}

// Wallet del comercio (nivel 2): lo identifica en la cadena.
export function llaveComercio(id) {
  if (!seed.comercios.some((c) => c.id === id)) throw new Error(`Comercio "${id}" no existe.`);
  return llaveCustodiada('comercios', id);
}

export function validarCantidad(cantidad) {
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    throw new Error('La cantidad debe ser un número entero mayor que 0.');
  }
}

// ---------------------------------------------------------------------------
// Motivo: en la cadena solo va su hash (privacidad)
// ---------------------------------------------------------------------------
// El motivo completo (quién, qué conducta, cuándo) se queda fuera de la cadena.
// Con el registro off-chain cualquiera autorizado puede verificar que el hash
// coincide, pero quien solo mira la cadena no aprende nada del estudiante.
export function hashMotivo(motivo) {
  return crypto.createHash('sha256').update(JSON.stringify(motivo)).digest('hex');
}

// Agrega fecha y un valor aleatorio para que dos premios iguales no produzcan
// el mismo hash (y no se puedan correlacionar entre sí).
export function completarMotivo(idEstudiante, cantidad, motivo) {
  return {
    estudiante: idEstudiante,
    cantidad,
    ...motivo,
    fecha: new Date().toISOString(),
    sal: crypto.randomBytes(8).toString('hex'),
  };
}

export function guardarMotivo(hash, motivo) {
  const motivos = leerJson(ARCHIVO_MOTIVOS, {});
  motivos[hash] = motivo;
  escribirJson(ARCHIVO_MOTIVOS, motivos);
}

// ---------------------------------------------------------------------------
// Historial off-chain (para mostrarlo en la app con enlaces a la cadena)
// ---------------------------------------------------------------------------
export function registrarEnHistorial(entrada) {
  const historial = leerJson(ARCHIVO_HISTORIAL, []);
  historial.push(entrada);
  escribirJson(ARCHIVO_HISTORIAL, historial);
}

export function historialDe(idEstudiante) {
  return leerJson(ARCHIVO_HISTORIAL, [])
    .filter((h) => h.estudiante === idEstudiante)
    .map((h) => ({ ...h, explorador: enlaceExplorador(h.firma) }))
    .reverse();
}

export function canjesDelHistorial(idComercio) {
  return leerJson(ARCHIVO_HISTORIAL, [])
    .filter((h) => h.tipo === 'redeem' && h.comercio === idComercio)
    .map(({ recompensa, cantidad, fecha, firma }) => ({ recompensa, cantidad, fecha, explorador: enlaceExplorador(firma) }));
}

// ---------------------------------------------------------------------------
// Envío de transacciones sin cobros dobles
// ---------------------------------------------------------------------------
// Problema: si la red tarda, una transacción puede quedar registrada en la
// cadena aunque nuestra confirmación falle por tiempo de espera. Si en ese
// caso se reintentara el canje, se quemarían los puntos dos veces.
//
// Solución:
// 1. Se firma ANTES de enviar, así la firma (el id de la transacción) se
//    conoce desde el principio y se puede guardar.
// 2. Si la confirmación no llega, se pregunta a la cadena por esa firma.
// 3. Solo se da por NO registrada cuando su blockhash ya venció: a partir de
//    ese momento la red la rechazaría, así que nunca podrá registrarse.

/** La red no respondió y no se sabe si la transacción se registró. */
export class TransaccionIncierta extends Error {
  constructor(firma) {
    super('La red no confirmó a tiempo si la transacción se registró. Se verificará en la cadena antes de reintentar.');
    this.firma = firma;
    this.incierta = true;
  }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Error que garantiza que la transacción NO se registró (no hubo cambios en la cadena).
function noRegistrada(mensaje) {
  const error = new Error(mensaje);
  error.definitiva = true;
  return error;
}

/**
 * Consulta en la cadena qué pasó con una transacción ya firmada.
 * @returns {'confirmada'|'fallida'|'expirada'|'en-espera'|'incierta'}
 *   expirada  = su blockhash venció sin registrarse: ya no puede registrarse.
 *   en-espera = aún puede registrarse (solo con `unaVez`, que no espera).
 *   incierta  = la red no respondió suficientes veces para saberlo.
 */
export async function resultadoDeTransaccion(firma, alturaMaxima, { intervaloMs = 2000, maxErrores = 10, unaVez = false } = {}) {
  let errores = 0;
  for (;;) {
    try {
      const { value } = await conexion.getSignatureStatus(firma, { searchTransactionHistory: true });
      if (value?.err) return 'fallida';
      if (value && ['confirmed', 'finalized'].includes(value.confirmationStatus)) return 'confirmada';
      if (!value && (await conexion.getBlockHeight('confirmed')) > alturaMaxima) {
        // El blockhash ya venció. Una última consulta por si se registró justo al final.
        const { value: final } = await conexion.getSignatureStatus(firma, { searchTransactionHistory: true });
        if (!final) return 'expirada';
        if (final.err) return 'fallida';
      }
    } catch {
      if (unaVez || ++errores >= maxErrores) return 'incierta';
    }
    if (unaVez) return 'en-espera';
    await esperar(intervaloMs);
  }
}

/**
 * Firma, envía y confirma una transacción. Si la confirmación no llega,
 * averigua en la cadena si se registró en vez de suponer que falló.
 * @param {import('@solana/web3.js').Transaction} tx
 * @param {Keypair[]} firmantes   el primero paga la comisión (fee payer)
 * @param {object} [opciones]
 * @param {(firma: string, alturaMaxima: number) => void} [opciones.alFirmar]
 *   se llama antes de enviar, para guardar la firma por si algo sale mal.
 */
export async function enviarTransaccion(tx, firmantes, { alFirmar, esperaResultado } = {}) {
  const { blockhash, lastValidBlockHeight } = await conexion.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer ??= firmantes[0].publicKey;
  tx.sign(...firmantes);
  const firma = bs58.encode(tx.signature);
  alFirmar?.(firma, lastValidBlockHeight);

  try {
    await conexion.sendRawTransaction(tx.serialize());
  } catch (error) {
    // La red respondió con un error (p. ej. la simulación falló): no se envió.
    if (error instanceof SendTransactionError) throw noRegistrada(mensajeDeError(error));
    // Error de conexión: pudo haber llegado o no. Se averigua más abajo.
  }

  let confirmacion = null;
  try {
    confirmacion = await conexion.confirmTransaction({ signature: firma, blockhash, lastValidBlockHeight }, 'confirmed');
  } catch {
    // Tiempo de espera o error de red: no sabemos el resultado todavía.
  }
  if (confirmacion) {
    // Si falla en la cadena, ninguna instrucción se aplica (es atómica).
    if (confirmacion.value.err) throw noRegistrada(`La transacción falló en la cadena: ${JSON.stringify(confirmacion.value.err)}`);
    return firma;
  }

  const resultado = await resultadoDeTransaccion(firma, lastValidBlockHeight, esperaResultado);
  if (resultado === 'confirmada') return firma;
  if (resultado === 'fallida') throw noRegistrada('La transacción falló en la cadena.');
  if (resultado === 'expirada') throw noRegistrada('La transacción no se registró en la cadena. Intenta de nuevo.');
  throw new TransaccionIncierta(firma);
}

/** Saca el mensaje legible de un error del programa (Anchor) o de Token-2022. */
export function mensajeDeError(error) {
  const logs = error.transactionLogs ?? error.logs ?? [];
  const anchor = logs.find((l) => l.includes('Error Message: '));
  if (anchor) return anchor.split('Error Message: ')[1].replace(/\.$/, '');
  if (logs.some((l) => l.includes('insufficient funds'))) return 'Saldo insuficiente en la cadena.';
  return error.message;
}
