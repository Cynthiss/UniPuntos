// award.js — La universidad otorga puntos a un estudiante.
//
// Uso:
//   node scripts/award.js <estudiante> <conducta> [cantidad]
// Ejemplos:
//   node scripts/award.js ana pago-puntual        (usa los puntos del catálogo de conductas)
//   node scripts/award.js bruno tutoria 20         (cantidad personalizada)
import { otorgarPuntos, seed, enlaceExplorador } from '../src/puntos.js';

const [idEstudiante, idConducta, cantidadTexto] = process.argv.slice(2);

if (!idEstudiante || !idConducta) {
  console.log('Uso: node scripts/award.js <estudiante> <conducta> [cantidad]');
  console.log('Estudiantes:', seed.estudiantes.map((e) => e.id).join(', '));
  console.log('Conductas:  ', seed.conductas.map((c) => `${c.id} (${c.puntos})`).join(', '));
  process.exit(1);
}

const conducta = seed.conductas.find((c) => c.id === idConducta);
if (!conducta) {
  console.error(`Conducta "${idConducta}" no existe.`);
  process.exit(1);
}
const cantidad = cantidadTexto ? Number(cantidadTexto) : conducta.puntos;

try {
  const { firma, hash } = await otorgarPuntos(idEstudiante, cantidad, { conducta: conducta.id });
  console.log(`Otorgados ${cantidad} puntos a ${idEstudiante} por "${conducta.nombre}".`);
  console.log(`Hash del motivo (va en la cadena): ${hash}`);
  console.log(`Transacción: ${enlaceExplorador(firma)}`);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
