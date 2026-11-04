// exportar-llaves.js — Junta las llaves de keys/ en un solo archivo para el servidor.
//
// Genera keys/llaves.json con este formato:
//   { "universidad": [...], "estudiantes/ana": [...], "comercios/cafe-campus": [...] }
// Ese archivo se sube a Render como "Secret File" con el nombre llaves.json.
//
// Contiene llaves PRIVADAS (de devnet). Queda dentro de keys/, que git ignora:
// nunca se sube al repositorio. Este script solo imprime direcciones públicas.
//
// Uso:  npm run exportar-llaves
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Keypair } from '@solana/web3.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(RAIZ, 'keys');
const SALIDA = path.join(DIR, 'llaves.json');

const leer = (archivo) => JSON.parse(fs.readFileSync(archivo, 'utf8'));
const paquete = {};

if (!fs.existsSync(path.join(DIR, 'universidad.json'))) {
  console.error('Falta keys/universidad.json.');
  process.exit(1);
}
paquete.universidad = leer(path.join(DIR, 'universidad.json'));

for (const carpeta of ['estudiantes', 'comercios']) {
  const dir = path.join(DIR, carpeta);
  if (!fs.existsSync(dir)) continue;
  for (const archivo of fs.readdirSync(dir).filter((a) => a.endsWith('.json')).sort()) {
    paquete[`${carpeta}/${path.basename(archivo, '.json')}`] = leer(path.join(dir, archivo));
  }
}

fs.writeFileSync(SALIDA, JSON.stringify(paquete), { mode: 0o600 });

console.log(`Paquete creado: keys/llaves.json (${Object.keys(paquete).length} llaves)\n`);
for (const [nombre, bytes] of Object.entries(paquete)) {
  const direccion = Keypair.fromSecretKey(Uint8Array.from(bytes)).publicKey.toBase58();
  console.log(`  ${nombre.padEnd(24)} ${direccion}`);
}
console.log('\nSúbelo a Render como Secret File llamado "llaves.json". No lo compartas ni lo subas a git.');
