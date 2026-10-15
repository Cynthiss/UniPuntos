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
import { Connection, Keypair } from '@solana/web3.js';

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

// Carga una llave o, si no existe, la genera (custodia de la demo).
function llaveCustodiada(carpeta, id) {
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
