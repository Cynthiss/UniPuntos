// balance.js — Consulta saldos en la cadena y la emisión total (auditoría).
//
// Uso:
//   node scripts/balance.js            (todos los estudiantes + emisión total)
//   node scripts/balance.js ana        (solo un estudiante)
import { NIVEL, consultarSaldo, consultarEmision, llaveEstudiante, seed, enlaceExplorador } from '../src/puntos.js';

const [idEstudiante] = process.argv.slice(2);
const ids = idEstudiante ? [idEstudiante] : seed.estudiantes.map((e) => e.id);

try {
  console.log(`Nivel ${NIVEL}\n`);
  for (const id of ids) {
    const saldo = await consultarSaldo(id);
    console.log(`${id.padEnd(8)} ${String(saldo).padStart(5)} puntos   wallet ${llaveEstudiante(id).publicKey.toBase58()}`);
  }
  const emision = await consultarEmision();
  console.log(`\nPuntos en circulación: ${emision.enCirculacion}`);
  if (NIVEL === 2) {
    // Estos datos los guarda el programa en la cuenta Config: cualquiera puede leerlos.
    console.log(`Otorgados en total: ${emision.totalOtorgado} · canjeados: ${emision.totalCanjeado}`);
    console.log(`Este período: ${emision.otorgadoEnPeriodo} de ${emision.presupuestoPeriodo} (tope por estudiante: ${emision.topeEstudiante})`);
  }
  console.log(`Mint (verificable por cualquiera): ${enlaceExplorador(emision.mint, 'address')}`);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
