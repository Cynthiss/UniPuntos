// inicializar-programa.js — Configuración inicial del nivel 2 (se corre una vez).
//
// 1. Inicializa el programa: crea Config y el mint de puntos con reglas FIJAS
//    (tope por estudiante, presupuesto por período y duración del período).
// 2. Registra en la cadena los comercios de data/seed.json.
//
// Requisito: el programa ya desplegado (ver README) y el IDL en idl/unipuntos.json.
//
// Uso:  UNIPUNTOS_NIVEL=2 npm run inicializar-programa
import { inicializarPrograma, registrarComercio, consultarEmision, PROGRAM_ID, CONFIG, MINT } from '../src/nivel2.js';
import { seed, enlaceExplorador } from '../src/comun.js';

// Reglas del piloto. Ejemplo: 200 estudiantes × 100 puntos = 20,000 por período,
// pero el presupuesto limita el total a 10,000 (no todos ganan el máximo).
const REGLAS = {
  topeEstudiante: 100,
  presupuesto: 10_000,
  segundosPeriodo: 30 * 24 * 60 * 60, // 30 días
};

try {
  console.log(`Programa: ${PROGRAM_ID.toBase58()}`);
  const firma = await inicializarPrograma(REGLAS);
  console.log(firma ? `Inicializado: ${enlaceExplorador(firma)}` : 'El programa ya estaba inicializado.');
  console.log(`Config: ${CONFIG.toBase58()}`);
  console.log(`Mint:   ${MINT.toBase58()}`);

  for (const comercio of seed.comercios) {
    const firmaComercio = await registrarComercio(comercio.id);
    console.log(`Comercio ${comercio.id}: ${firmaComercio ? 'registrado' : 'ya estaba registrado'}`);
  }

  const estado = await consultarEmision();
  console.log(`\nReglas en la cadena: tope ${estado.topeEstudiante} por estudiante, ` +
    `presupuesto ${estado.presupuestoPeriodo} por período de ${estado.diasPorPeriodo} días.`);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
