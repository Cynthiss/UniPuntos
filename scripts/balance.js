// balance.js — Consulta saldos en la cadena y la emisión total (auditoría).
//
// Uso:
//   node scripts/balance.js            (todos los estudiantes + emisión total)
//   node scripts/balance.js ana        (solo un estudiante)
import { consultarSaldo, consultarEmision, llaveEstudiante, seed, enlaceExplorador } from '../src/puntos.js';

const [idEstudiante] = process.argv.slice(2);
const ids = idEstudiante ? [idEstudiante] : seed.estudiantes.map((e) => e.id);

try {
  for (const id of ids) {
    const saldo = await consultarSaldo(id);
    console.log(`${id.padEnd(8)} ${String(saldo).padStart(5)} puntos   wallet ${llaveEstudiante(id).publicKey.toBase58()}`);
  }
  const { mint, enCirculacion } = await consultarEmision();
  console.log(`\nPuntos en circulación: ${enCirculacion}`);
  console.log(`Mint (verificable por cualquiera): ${enlaceExplorador(mint, 'address')}`);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
