// =============================================================================
// zk.js — Nivel 3: canje privado con conocimiento cero (Groth16).
//
// Caso: Café 2x1 solo para quien pagó puntual este mes. El comercio verifica
// que el estudiante es elegible SIN saber quién es.
//
// Quién sabe qué:
// - La universidad sabe quién pagó puntual y publica solo un árbol de Merkle
//   con los compromisos Poseidon(secreto) de los elegibles (su raíz).
// - El estudiante guarda su `secreto` (en producción, en su celular con WDK)
//   y genera una prueba de que su compromiso está en el árbol.
// - El comercio recibe la prueba: ve la raíz, la promo y un nullifier. No ve
//   el secreto, ni el compromiso, ni la posición en el árbol.
// - Ni la universidad puede saber cuál de los elegibles canjeó: el nullifier
//   no se puede relacionar con un compromiso sin conocer el secreto.
//
// Doble canje: nullifierHash = Poseidon(secreto, promoId) es siempre igual
// para el mismo estudiante y la misma promo. El verificador guarda los usados.
// =============================================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { groth16 } from 'snarkjs';
import { buildPoseidon } from 'circomlibjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(RAIZ, 'zk', 'build');
const WASM = path.join(BUILD, 'canje_privado_js', 'canje_privado.wasm');
const ZKEY = path.join(BUILD, 'canje_final.zkey');
const VKEY = path.join(BUILD, 'verification_key.json');
const DIR_SECRETOS = path.join(RAIZ, 'keys', 'zk');
const ARCHIVO_NULLIFIERS = path.join(RAIZ, 'data', 'zk-nullifiers.local.json');

export const seed = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'seed.json'), 'utf8'));

/** Profundidad del árbol: debe coincidir con CanjePrivado(10) en el circuito. */
export const NIVELES = 10;

// Orden del campo de la curva BN254: todos los valores del circuito viven aquí.
const P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const leerJson = (archivo, porDefecto) =>
  fs.existsSync(archivo) ? JSON.parse(fs.readFileSync(archivo, 'utf8')) : porDefecto;

function escribirJson(archivo, datos) {
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  fs.writeFileSync(archivo, JSON.stringify(datos, null, 2));
}

let poseidon;
/** Hash Poseidon (el mismo que usa el circuito). Devuelve un BigInt. */
async function hash(entradas) {
  poseidon ??= await buildPoseidon();
  return poseidon.F.toObject(poseidon(entradas));
}

export function buscarPromo(idPromo) {
  const promo = seed.promosPrivadas.find((p) => p.id === idPromo);
  if (!promo) throw new Error(`Promo "${idPromo}" no existe.`);
  return promo;
}

/** promoId: identifica la promo de un mes como número del campo. */
export function promoIdDe(idPromo, mes) {
  const digest = crypto.createHash('sha256').update(`${idPromo}:${mes}`).digest('hex');
  return BigInt(`0x${digest}`) % P;
}

const archivoPromo = (idPromo, mes) => path.join(RAIZ, 'data', `zk-promo-${idPromo}-${mes}.local.json`);

// ---------------------------------------------------------------------------
// Estudiante: secreto y compromiso
// ---------------------------------------------------------------------------

// DEMO (custodia): el secreto se genera y guarda aquí. En producción se genera
// en el celular del estudiante y la universidad solo recibe el compromiso.
function secretoDe(idEstudiante) {
  if (!seed.estudiantes.some((e) => e.id === idEstudiante)) {
    throw new Error(`Estudiante "${idEstudiante}" no existe.`);
  }
  const archivo = path.join(DIR_SECRETOS, `${idEstudiante}.json`);
  if (!fs.existsSync(archivo)) {
    // 31 bytes aleatorios: siempre menor que P.
    const secreto = BigInt(`0x${crypto.randomBytes(31).toString('hex')}`);
    fs.mkdirSync(DIR_SECRETOS, { recursive: true });
    fs.writeFileSync(archivo, JSON.stringify({ secreto: secreto.toString() }), { mode: 0o600 });
  }
  return BigInt(leerJson(archivo).secreto);
}

/** Compromiso público del estudiante: Poseidon(secreto). No revela el secreto. */
export async function compromisoDe(idEstudiante) {
  return hash([secretoDe(idEstudiante)]);
}

// ---------------------------------------------------------------------------
// Árbol de Merkle (Poseidon)
// ---------------------------------------------------------------------------

/** Construye todos los niveles del árbol. Las hojas vacías valen 0. */
async function construirArbol(hojas) {
  const tamano = 2 ** NIVELES;
  if (hojas.length > tamano) throw new Error(`El árbol admite hasta ${tamano} hojas.`);
  const niveles = [[...hojas, ...Array(tamano - hojas.length).fill(0n)]];
  for (let n = 0; n < NIVELES; n++) {
    const actual = niveles[n];
    const siguiente = [];
    for (let i = 0; i < actual.length; i += 2) siguiente.push(await hash([actual[i], actual[i + 1]]));
    niveles.push(siguiente);
  }
  return niveles;
}

/** Camino de una hoja hasta la raíz: los hermanos y la dirección en cada nivel. */
function caminoDe(niveles, indice) {
  const hermanos = [];
  const direcciones = [];
  for (let n = 0; n < NIVELES; n++) {
    const esDerecha = indice % 2;
    hermanos.push(niveles[n][esDerecha ? indice - 1 : indice + 1]);
    direcciones.push(esDerecha);
    indice = Math.floor(indice / 2);
  }
  return { hermanos, direcciones };
}

// ---------------------------------------------------------------------------
// 1. Universidad: publica la promo del mes
// ---------------------------------------------------------------------------

/**
 * Arma el árbol con los compromisos de quienes pagaron puntual y "publica"
 * la promo (raíz + lista de compromisos). Esto es público: en producción iría
 * en la cadena o en la web de la U. No contiene nombres ni datos de pago.
 */
export async function publicarPromo(idPromo, mes) {
  buscarPromo(idPromo);
  const elegibles = seed.pagosPuntuales[mes];
  if (!elegibles) throw new Error(`No hay registro de pagos puntuales para ${mes}.`);

  const compromisos = await Promise.all(elegibles.map(compromisoDe));
  // Se ordenan por valor para que la posición no delate a nadie
  // (por ejemplo, si la lista siguiera el orden alfabético de los estudiantes).
  compromisos.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const niveles = await construirArbol(compromisos);
  const promo = {
    promo: idPromo,
    mes,
    promoId: promoIdDe(idPromo, mes).toString(),
    raiz: niveles[NIVELES][0].toString(),
    compromisos: compromisos.map(String),
  };
  escribirJson(archivoPromo(idPromo, mes), promo);
  return promo;
}

export function promoPublicada(idPromo, mes) {
  const promo = leerJson(archivoPromo(idPromo, mes), null);
  if (!promo) throw new Error(`La promo ${idPromo} de ${mes} no está publicada. Corre: npm run zk -- publicar ${mes}`);
  return promo;
}

// ---------------------------------------------------------------------------
// 2. Estudiante: genera su prueba (en producción, en su celular)
// ---------------------------------------------------------------------------

/**
 * Genera la prueba de que el estudiante está en el árbol de la promo.
 * Solo usa datos públicos (la promo publicada) y el secreto del estudiante.
 * `trampa` (solo para la demo) fuerza el camino de otra hoja para mostrar
 * que el circuito rechaza a quien no es elegible.
 */
export async function generarPrueba(idEstudiante, idPromo, mes, { trampa = false } = {}) {
  const promo = promoPublicada(idPromo, mes);
  const secreto = secretoDe(idEstudiante);
  const compromiso = (await hash([secreto])).toString();

  let indice = promo.compromisos.indexOf(compromiso);
  if (indice === -1) {
    if (!trampa) throw new Error(`${idEstudiante} no está en la lista de elegibles de ${idPromo} (${mes}).`);
    indice = 0; // usa el camino de otra persona: el circuito no lo aceptará
  }

  const niveles = await construirArbol(promo.compromisos.map(BigInt));
  const { hermanos, direcciones } = caminoDe(niveles, indice);
  const promoId = BigInt(promo.promoId);

  const entrada = {
    // Privadas
    secreto: secreto.toString(),
    hermanos: hermanos.map(String),
    direcciones: direcciones.map(String),
    // Públicas
    raiz: promo.raiz,
    nullifierHash: (await hash([secreto, promoId])).toString(),
    promoId: promo.promoId,
  };

  // El calculador de testigos imprime sus errores además de lanzarlos;
  // se silencia mientras corre porque el error ya llega en la excepción.
  const consoleError = console.error;
  console.error = () => {};
  try {
    // Calcula el testigo con el .wasm y la prueba Groth16 con la .zkey.
    const { proof, publicSignals } = await groth16.fullProve(entrada, WASM, ZKEY);
    return { promo: idPromo, mes, proof, publicSignals };
  } catch (error) {
    throw new Error(`El circuito rechazó los datos: no se puede generar la prueba (${error.message.split('\n')[0]}).`);
  } finally {
    console.error = consoleError;
  }
}

// ---------------------------------------------------------------------------
// 3. Comercio / backend: verifica y registra el nullifier
// ---------------------------------------------------------------------------

/**
 * Verifica una prueba de canje. El comercio solo necesita la llave de
 * verificación y la promo publicada; nunca recibe datos del estudiante.
 * Si es válida, guarda el nullifier para impedir el doble canje.
 */
export async function verificarCanje({ promo: idPromo, mes, proof, publicSignals }) {
  const promo = promoPublicada(idPromo, mes);
  // Orden de las señales públicas, igual que en el circuito: raiz, nullifierHash, promoId.
  const [raiz, nullifierHash, promoId] = publicSignals;

  if (raiz !== promo.raiz) return { ok: false, motivo: 'La raíz no es la del árbol publicado para esta promo.' };
  if (promoId !== promo.promoId) return { ok: false, motivo: 'La prueba es de otra promoción.' };

  const usados = leerJson(ARCHIVO_NULLIFIERS, {});
  const clave = `${idPromo}:${mes}`;
  if ((usados[clave] ?? []).includes(nullifierHash)) {
    return { ok: false, motivo: 'Esta promoción ya fue canjeada con esta credencial (doble canje).' };
  }

  const llaveVerificacion = leerJson(VKEY, null);
  if (!llaveVerificacion) throw new Error('Falta zk/build/verification_key.json. Corre: npm run zk:setup');
  if (!(await groth16.verify(llaveVerificacion, publicSignals, proof))) {
    return { ok: false, motivo: 'La prueba no es válida.' };
  }

  usados[clave] = [...(usados[clave] ?? []), nullifierHash];
  escribirJson(ARCHIVO_NULLIFIERS, usados);
  return { ok: true, nullifierHash };
}

/** Borra los nullifiers de una promo (solo para repetir la demo). */
export function reiniciarNullifiers(idPromo, mes) {
  const usados = leerJson(ARCHIVO_NULLIFIERS, {});
  delete usados[`${idPromo}:${mes}`];
  escribirJson(ARCHIVO_NULLIFIERS, usados);
}

/** snarkjs deja hilos de trabajo abiertos; esto los cierra al terminar. */
export async function cerrar() {
  await globalThis.curve_bn128?.terminate();
}
