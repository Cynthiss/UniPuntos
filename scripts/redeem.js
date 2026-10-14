// redeem.js — El estudiante quema puntos para canjear una recompensa del catálogo.
//
// Uso:
//   node scripts/redeem.js <estudiante> <recompensa>
// Ejemplo:
//   node scripts/redeem.js ana cafe-2x1
import { canjearPuntos, seed, enlaceExplorador } from '../src/puntos.js';

const [idEstudiante, idRecompensa] = process.argv.slice(2);

if (!idEstudiante || !idRecompensa) {
  console.log('Uso: node scripts/redeem.js <estudiante> <recompensa>');
  console.log('Recompensas:', seed.catalogo.map((r) => `${r.id} (${r.puntos})`).join(', '));
  process.exit(1);
}

const recompensa = seed.catalogo.find((r) => r.id === idRecompensa);
if (!recompensa) {
  console.error(`Recompensa "${idRecompensa}" no existe.`);
  process.exit(1);
}

try {
  const { firma } = await canjearPuntos(idEstudiante, recompensa.puntos, {
    recompensa: recompensa.id,
    comercio: recompensa.comercio,
  });
  console.log(`${idEstudiante} canjeó "${recompensa.nombre}" por ${recompensa.puntos} puntos (quemados).`);
  console.log(`Transacción: ${enlaceExplorador(firma)}`);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
