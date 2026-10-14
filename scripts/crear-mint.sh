#!/usr/bin/env bash
# =============================================================================
# crear-mint.sh — Crea el token de puntos de UniPuntos en Solana devnet.
#
# Qué hace:
#   1. Verifica que la CLI apunte a devnet y que exista la llave de la U.
#   2. Crea un mint con el programa Token-2022 y la extensión NonTransferable:
#      los puntos NO se pueden transferir entre wallets (sin mercado negro).
#   3. Usa 0 decimales: un punto es una unidad entera.
#   4. La universidad queda como mint authority (la única que emite) y como
#      fee payer (paga las comisiones de todas las transacciones).
#   5. Guarda la dirección del mint en data/mint.local.json para los scripts.
#
# Uso:  npm run crear-mint      (o bash scripts/crear-mint.sh)
#
# Es reproducible: si ya existe data/mint.local.json no crea otro mint,
# salvo que se pase --forzar.
# =============================================================================
set -euo pipefail

# Programa Token-2022 (soporta extensiones como NonTransferable)
TOKEN_2022="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
LLAVE_U="$RAIZ/keys/universidad.json"
ARCHIVO_MINT="$RAIZ/data/mint.local.json"
# Devnet por defecto. Para pruebas locales: SOLANA_RPC_URL=http://127.0.0.1:8899
URL_RPC="${SOLANA_RPC_URL:-https://api.devnet.solana.com}"

if [[ ! -f "$LLAVE_U" ]]; then
  echo "No existe $LLAVE_U. Créala con:"
  echo "  solana-keygen new --no-bip39-passphrase -o keys/universidad.json"
  exit 1
fi

if [[ -f "$ARCHIVO_MINT" && "${1:-}" != "--forzar" ]]; then
  echo "Ya existe un mint: $(cat "$ARCHIVO_MINT")"
  echo "Usa --forzar para crear uno nuevo."
  exit 0
fi

echo "Universidad (mint authority y fee payer): $(solana address -k "$LLAVE_U")"
echo "Saldo: $(solana balance -k "$LLAVE_U" --url "$URL_RPC")"

# Generamos la llave del mint aparte para conocer su dirección de antemano.
LLAVE_MINT="$RAIZ/keys/mint.json"
solana-keygen new --no-bip39-passphrase --silent --force -o "$LLAVE_MINT"

spl-token create-token \
  --program-id "$TOKEN_2022" \
  --enable-non-transferable \
  --decimals 0 \
  --mint-authority "$LLAVE_U" \
  --fee-payer "$LLAVE_U" \
  --url "$URL_RPC" \
  "$LLAVE_MINT"

MINT="$(solana address -k "$LLAVE_MINT")"
mkdir -p "$RAIZ/data"
echo "{ \"mint\": \"$MINT\" }" > "$ARCHIVO_MINT"

echo ""
echo "Mint creado: $MINT"
echo "Explorador: https://explorer.solana.com/address/$MINT?cluster=devnet"
