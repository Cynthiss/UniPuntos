// =============================================================================
// puntos.js — Punto de entrada que usan los scripts y el servidor.
//
// Elige la implementación según la variable UNIPUNTOS_NIVEL:
//   1 (por defecto) → nivel1.js: la universidad emite directo con su llave.
//   2              → nivel2.js: todo pasa por el programa Anchor y sus reglas.
// Las dos exponen las mismas funciones, así que el resto del código no cambia.
// =============================================================================
export * from './comun.js';

export const NIVEL = Number(process.env.UNIPUNTOS_NIVEL || 1);
if (![1, 2].includes(NIVEL)) throw new Error('UNIPUNTOS_NIVEL debe ser 1 o 2.');

const nivel = NIVEL === 2 ? await import('./nivel2.js') : await import('./nivel1.js');

export const { otorgarPuntos, canjearPuntos, consultarSaldo, consultarEmision, canjesDeComercio } = nivel;
