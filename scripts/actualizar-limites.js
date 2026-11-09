// actualizar-limites.js — La universidad cambia el tope por estudiante (nivel 2).
//
// El presupuesto por período se mantiene salvo que se indique otro.
// La duración del período no se puede cambiar (es fija desde la inicialización).
// Cada cambio emite el evento LimitsUpdated: cualquiera puede auditarlo.
//
// Uso:  UNIPUNTOS_NIVEL=2 npm run actualizar-limites -- <tope> [presupuesto]
// Ej.:  UNIPUNTOS_NIVEL=2 npm run actualizar-limites -- 200
import { actualizarLimites, consultarEmision } from '../src/nivel2.js';
import { enlaceExplorador } from '../src/comun.js';

const [tope, presupuestoArg] = process.argv.slice(2).map(Number);
if (!Number.isInteger(tope) || tope <= 0) {
  console.error('Uso: npm run actualizar-limites -- <tope> [presupuesto]');
  process.exit(1);
}

try {
  const antes = await consultarEmision();
  const presupuesto = presupuestoArg || antes.presupuestoPeriodo;
  const firma = await actualizarLimites({ topeEstudiante: tope, presupuesto });
  const despues = await consultarEmision();
  console.log(`Tope por estudiante: ${antes.topeEstudiante} → ${despues.topeEstudiante} pts cada ${despues.diasPorPeriodo} días`);
  console.log(`Presupuesto del período: ${antes.presupuestoPeriodo} → ${despues.presupuestoPeriodo} pts`);
  console.log(`Transacción: ${enlaceExplorador(firma)}`);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
