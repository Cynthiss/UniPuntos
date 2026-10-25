# UniPuntos

Programa de recompensas universitario sobre **Solana (devnet)**. La universidad otorga puntos por **pagar la mensualidad a tiempo** y por **participar** (tutorías, voluntariado). Los estudiantes los canjean en servicios del campus y en comercios afiliados.

> Venture para la clase *Tech and Freedom* (UFM). El contexto completo del proyecto está en [CLAUDE.md](CLAUDE.md).

Este repositorio contiene:
- **Nivel 1** (raíz): el mínimo funcional de punta a punta, con scripts en Node y una app web.
- **Nivel 2** (`programa/`): un programa Anchor que hace cumplir las reglas en la cadena.
- **Nivel 3** (`zk/`): canje privado con una prueba de conocimiento cero.

## Desplegado en devnet

Cualquiera puede revisar estas cuentas en el explorador de Solana (red devnet):

| Qué | Dirección |
|---|---|
| Universidad (autoridad y fee payer) | [`Dwd21gVT7ckW7AME7gH2qsSxh4eZatvByhFTBdyWnzaA`](https://explorer.solana.com/address/Dwd21gVT7ckW7AME7gH2qsSxh4eZatvByhFTBdyWnzaA?cluster=devnet) |
| Nivel 1: mint de puntos | [`DaMDDpjRecY3W2RECvFaesTPhT7uwaGbexx499LAhcMu`](https://explorer.solana.com/address/DaMDDpjRecY3W2RECvFaesTPhT7uwaGbexx499LAhcMu?cluster=devnet) |
| Nivel 2: programa | [`GKpeeXMXGGuSd3CGKsnkyVn85wGoJ56nxoexrtpRZKHb`](https://explorer.solana.com/address/GKpeeXMXGGuSd3CGKsnkyVn85wGoJ56nxoexrtpRZKHb?cluster=devnet) |
| Nivel 2: `Config` (reglas y totales) | [`DzXapGM9tG5PYFKF8cyTanRFkaekMcSh4tBv2EyuBA49`](https://explorer.solana.com/address/DzXapGM9tG5PYFKF8cyTanRFkaekMcSh4tBv2EyuBA49?cluster=devnet) |
| Nivel 2: mint de puntos (autoridad = programa) | [`5PSiJxV1Ejzmz49PJYHZTxYE9LYvAQPm7XxbJBN3L2kZ`](https://explorer.solana.com/address/5PSiJxV1Ejzmz49PJYHZTxYE9LYvAQPm7XxbJBN3L2kZ?cluster=devnet) |

El IDL del programa también está publicado en la cadena, así que el explorador puede decodificar sus instrucciones y cuentas.

## Qué garantiza el código

| Garantía | Cómo se logra |
|---|---|
| Los puntos **no se pueden transferir** (no hay mercado negro) | Token-2022 con la extensión `NonTransferable`. Probado: la cadena responde *"Transfer is disabled for this mint"*. |
| **Nadie puede quitarle puntos** a un estudiante | Quemar puntos (`burn`) exige la firma del dueño. El mint no tiene *permanent delegate* ni *freeze authority*. |
| **Emisión auditable** | Cualquiera puede ver en el explorador cuántos puntos hay en circulación. |
| **Privacidad** | En la cadena solo va la cantidad y un `sha256` del motivo en un memo (`unipuntos:award:<hash>`). El motivo real queda fuera de la cadena. El comercio ve la recompensa, nunca quién es el estudiante. |
| El estudiante **no necesita SOL** | La universidad es el *fee payer* de todas las transacciones. |

**Limitación conocida del nivel 1:** la universidad (mint authority) puede emitir sin tope. Lo resuelve el nivel 2 (ver más abajo).

## Estructura

```
scripts/
  crear-mint.sh             Nivel 1: crea el mint Token-2022 no transferible (CLI spl-token)
  inicializar-programa.js   Nivel 2: inicializa el programa y registra los comercios
  award.js                  La universidad otorga puntos a un estudiante
  redeem.js                 El estudiante quema puntos para canjear una recompensa
  balance.js                Saldos y emisión total, leídos de la cadena
src/
  puntos.js       Elige el nivel según UNIPUNTOS_NIVEL (lo usan los scripts y el servidor)
  comun.js        Llaves, datos de prueba, hash del motivo e historial
  nivel1.js       Nivel 1: la U emite directo con su llave
  nivel2.js       Nivel 2: todo pasa por el programa Anchor
  server.js       Backend web: API y códigos QR de un solo uso
idl/
  unipuntos.json  Interfaz del programa (la genera anchor build; se copia con npm run idl)
public/           App web (adaptable al celular e instalable como app)
  index.html      Inicio: estadísticas leídas de la cadena y garantías
  estudiante.html Saldo, recompensas, movimientos y QR que se actualiza al confirmarse
  comercio.html   Caja: ingresa o escanea el código y confirma el canje
  app.js          Navegación, avisos y utilidades compartidas
  estilos.css     Estilos (modo claro y oscuro)
data/
  seed.json       Datos de prueba: 3 estudiantes, 2 comercios, 4 recompensas, 3 conductas
  *.local.json    Generados al usar la demo (mint, motivos, historial por nivel, códigos). No se suben.
keys/             Llaves (universidad, mint, estudiantes, comercios) y secretos ZK. NUNCA se suben a git.
programa/         Nivel 2: workspace Anchor
  programs/unipuntos/src/          Programa (cuentas, instrucciones, errores)
  programs/unipuntos/tests/        Pruebas con LiteSVM
zk/               Nivel 3: canje privado con conocimiento cero
  circuito/canje_privado.circom    Circuito (pertenencia al árbol + nullifier)
  setup.sh        Compila el circuito y genera las llaves Groth16
  zk.js           Árbol de Merkle, prueba del estudiante y verificación del comercio
  cli.js, demo.js Comandos y recorrido completo con ataques
```

## Requisitos

Probado en macOS (Apple Silicon) con:

- Node.js 24
- Solana CLI 4.3 (Agave) y `spl-token` 5.6
- Rust 1.99 y Anchor 1.2.1 (nivel 2)
- circom 2.2.3 (nivel 3)

## Cómo correrlo

### 1. Instalar dependencias

```bash
npm install
```

### 2. Llave de la universidad y devnet

```bash
solana-keygen new --no-bip39-passphrase -o keys/universidad.json
solana config set --url devnet --keypair keys/universidad.json
```

La universidad necesita SOL de devnet para pagar comisiones (~1 SOL alcanza para miles de transacciones):

```bash
solana airdrop 1
```

Si el airdrop falla por límite de solicitudes, usa https://faucet.solana.com con la dirección que muestra `solana address`.

### 3. Crear el mint de puntos

```bash
npm run crear-mint
```

Guarda la dirección en `data/mint.local.json`. Si ya existe, no crea otro (usa `--forzar` para reemplazarlo).

### 4. Usar los scripts

```bash
npm run award -- ana pago-puntual      # +50 puntos a Ana
npm run award -- bruno tutoria 20      # cantidad personalizada
npm run redeem -- ana cafe-2x1         # Ana quema 20 puntos
npm run balance                        # saldos de todos + emisión total
```

Cada comando imprime el enlace a la transacción en el explorador de Solana.

### 5. App web

```bash
npm start
```

- Estudiante: http://localhost:3000/estudiante.html
- Comercio: http://localhost:3000/comercio.html

Flujo de la demo: otorga puntos con `award`, abre la página del estudiante, elige una recompensa y se genera un QR. En la página del comercio escribe ese código, verifica y confirma. Los puntos se queman en la cadena.

Si el navegador lo soporta (Chrome en Android), la caja también puede escanear el QR con la cámara. Desde otro dispositivo, la cámara exige HTTPS.

### Pruebas sin devnet (validador local)

Si devnet no da SOL, todo se puede probar en un validador local, que ya incluye Token-2022:

```bash
solana-test-validator --reset                            # en otra terminal
solana airdrop 10 --url localhost
SOLANA_RPC_URL=http://127.0.0.1:8899 npm run crear-mint
SOLANA_RPC_URL=http://127.0.0.1:8899 npm run award -- ana pago-puntual
SOLANA_RPC_URL=http://127.0.0.1:8899 npm start
```

Antes de volver a devnet, borra `data/*.local.json`, porque el mint local no existe en devnet.

## Cómo funciona el canje (paso a paso)

1. El estudiante elige una recompensa. El backend revisa el saldo y crea un **código de un solo uso** de 8 caracteres, válido 10 minutos. Todavía no se quema nada.
2. El comercio ingresa el código. Ve **qué** se canjea y cuántos puntos cuesta, pero **no quién** lo canjea.
3. El comercio confirma. El backend **bloquea el código antes** de ir a la cadena, así dos confirmaciones simultáneas no pueden quemar dos veces. Luego quema los puntos con la firma del estudiante y la universidad paga la comisión.
4. El canje queda registrado con su firma de transacción. Es la base de la **liquidación mensual**: la universidad reembolsa en quetzales a cada comercio según los canjes que se pueden verificar en la cadena.
5. **Sin cobros dobles si la red falla.** La transacción se firma antes de enviarla y su firma se guarda en el código. Si la confirmación no llega, el servidor busca esa firma en la cadena en lugar de suponer:
   - si se registró, el canje queda como usado y no se vuelve a cobrar;
   - si falló, o su blockhash venció (ya no puede registrarse), el código vuelve a estar disponible;
   - si la red no responde, el código queda bloqueado como "verificando en la cadena" y el servidor lo revisa cada 15 segundos, también después de reiniciarse.

   Los puntos solo bajan cuando la transacción queda registrada: generar el QR, que el código venza o que lo intente confirmar otro comercio no resta nada.

## Decisiones de la demo (y qué cambia en producción)

| En la demo | En producción |
|---|---|
| El backend genera y guarda las llaves de los estudiantes (`keys/estudiantes/`) | Cada estudiante tiene una wallet embebida con **WDK** en su celular y firma el canje él mismo. El backend nunca ve su llave. |
| Se elige el estudiante en un menú | Inicio de sesión con la cuenta universitaria |
| Historial, motivos y códigos en archivos JSON | Base de datos del backend |
| La universidad emite sin tope | Programa Anchor con tope por período (nivel 2, ya en `programa/`) |

## Nivel 2: programa Anchor con reglas (`programa/`)

El nivel 1 confía en la universidad: con su llave podría emitir puntos sin límite. En el nivel 2 las reglas viven en un **programa de Solana** y la universidad ya no puede saltárselas.

### Qué cambia

- **El programa es el mint authority.** El mint lo crea el propio programa y su autoridad es una PDA (`config`). La única forma de emitir es `award_points`, que aplica las reglas.
- **Dos topes por período:** uno por estudiante (`cap_per_student`) y un presupuesto global (`budget_per_period`). El global impide repartir puntos a muchas wallets para esquivar el tope individual.
- **El período lo marca el reloj de la cadena**, no la universidad: `period = unix_timestamp / period_seconds`. No hay ninguna instrucción para "avanzar el período", así que la U no puede reiniciar los topes cuando quiera. Los tres valores se fijan en `initialize` y no se pueden cambiar.
- **Ninguna instrucción quita puntos sin la firma del estudiante.** La única que quema es `redeem` y exige que el estudiante firme. El mint no tiene *freeze authority* ni *permanent delegate*.
- **Cada canje queda en la cadena** en una cuenta `Redemption`: quién, en qué comercio, qué recompensa, cuánto y cuándo. Es la base de la liquidación.

### Cuentas (PDAs)

| Cuenta | Semillas | Contenido |
|---|---|---|
| `Config` | `"config"` | autoridad de la U, mint, topes, duración del período, totales emitidos y canjeados |
| mint | `"mint"` | Token-2022, NonTransferable, 0 decimales |
| `StudentState` | `"student"`, wallet | puntos ganados en el período actual, número de canjes |
| `Merchant` | `"merchant"`, wallet del comercio | nombre, activo/inactivo, total canjeado |
| `Redemption` | `"redemption"`, wallet del estudiante, n.º de canje | estudiante, comercio, recompensa, cantidad, fecha |

### Instrucciones

| Instrucción | Quién firma | Qué hace |
|---|---|---|
| `initialize(cap_per_student, budget_per_period, period_seconds)` | U | Crea `Config` y el mint |
| `register_merchant(name)` | U | Registra un comercio (activo) |
| `set_merchant_active(active)` | U | Activa o desactiva un comercio |
| `award_points(amount, reason_hash)` | U | Emite puntos respetando los topes; en la cadena solo va el hash del motivo |
| `redeem(amount, reward_id)` | **estudiante** (+ U como fee payer) | Quema puntos y crea `Redemption` |

Cada instrucción emite un evento (`PointsAwarded`, `PointsRedeemed`, `MerchantUpdated`) que cualquiera puede leer en los logs.

### Pruebas

```bash
cd programa
anchor build
anchor test
```

Las pruebas (`programs/unipuntos/tests/test_unipuntos.rs`) corren sobre LiteSVM, una blockchain simulada en memoria, y verifican:

- el mint es no transferible, su autoridad es el programa y no tiene freeze authority;
- se respetan el tope por estudiante y el presupuesto global, y solo se reinician cuando el reloj pasa al siguiente período;
- nadie más que la U puede otorgar;
- canjear quema los puntos y registra el canje; no se puede canjear más de lo que se tiene;
- **nadie puede quemar sin la firma del estudiante**, ni siquiera la U;
- un comercio inactivo no recibe canjes;
- una transferencia entre estudiantes falla (*"Transfer is disabled for this mint"*).

Notas de la configuración:
- `programa/rust-toolchain.toml` usa Rust `stable` para el host (pruebas e IDL), porque LiteSVM 0.17 pide rustc 1.97.1 o superior. El programa on-chain se compila con el rustc de las platform tools de Solana.
- La llave del programa (`target/deploy/unipuntos-keypair.json`) no se sube a git. En un clon nuevo, `anchor keys sync` genera otra y actualiza el `declare_id!`.

### Usar el nivel 2 con los scripts y la app web

Los scripts y la app son los mismos de los dos niveles. La variable `UNIPUNTOS_NIVEL` decide si se emite directo con la llave de la U (`1`, por defecto) o a través del programa (`2`). Se puede dejar fija en un archivo `.env` (ver `.env.example`).

1. Desplegar el programa (con SOL en la cuenta de la universidad; desplegar cuesta ~2 SOL de devnet):

   ```bash
   cd programa
   anchor build && anchor deploy --provider.cluster devnet
   cd .. && npm run idl
   ```

2. Inicializarlo una sola vez. Esto fija las reglas (100 puntos por estudiante y 10,000 en total por período de 30 días; se cambian en `scripts/inicializar-programa.js` **antes** de inicializar) y registra los comercios:

   ```bash
   UNIPUNTOS_NIVEL=2 npm run inicializar-programa
   ```

3. Usarlo igual que el nivel 1:

   ```bash
   UNIPUNTOS_NIVEL=2 npm run award -- ana pago-puntual
   UNIPUNTOS_NIVEL=2 npm run balance
   UNIPUNTOS_NIVEL=2 npm start
   ```

Diferencias visibles en el nivel 2:
- Si un premio supera un tope, el programa lo rechaza: *"El estudiante superaría el tope de puntos de este período"*.
- `balance` y la página de inicio muestran las reglas y los totales que guarda el programa.
- La caja del comercio lista los canjes leyendo las cuentas `Redemption` de la cadena, no un archivo del backend.

Para probarlo en un validador local, se carga el programa al arrancarlo:

```bash
solana-test-validator --reset --bpf-program GKpeeXMXGGuSd3CGKsnkyVn85wGoJ56nxoexrtpRZKHb programa/target/deploy/unipuntos.so
SOLANA_RPC_URL=http://127.0.0.1:8899 UNIPUNTOS_NIVEL=2 npm run inicializar-programa
```

## Nivel 3: canje privado con conocimiento cero (`zk/`)

**Caso:** Café 2x1 solo para estudiantes que pagaron puntual este mes, **sin que el comercio sepa quién es** el estudiante. Es una demo aislada: no depende de la cadena ni de la app.

### Quién sabe qué

| Actor | Sabe | No sabe |
|---|---|---|
| Universidad | quién pagó puntual; publica un árbol de Merkle con los compromisos `Poseidon(secreto)` de los elegibles | cuál de los elegibles canjeó |
| Estudiante | su `secreto` (en producción, solo en su celular) | — |
| Comercio | que la prueba es válida, de esta promo y no usada antes | nombre, carnet, compromiso ni posición en el árbol |

### Cómo funciona

1. **La U publica la promo del mes:** arma un árbol de Merkle (Poseidon, profundidad 10, hasta 1,024 estudiantes) con los compromisos de quienes pagaron puntual y publica la raíz y la lista de compromisos. Los ordena por valor para que la posición no delate a nadie. No hay nombres.
2. **El estudiante genera una prueba Groth16** (~1 s) de que conoce un secreto cuyo compromiso está en el árbol. La prueba ocupa ~1,000 caracteres y cabe en un QR.
3. **El comercio verifica** (~20 ms) con la llave de verificación. Las entradas públicas son solo `raiz`, `nullifierHash` y `promoId`.
4. **Doble canje:** `nullifierHash = Poseidon(secreto, promoId)` siempre es igual para el mismo estudiante y la misma promo, así que el verificador guarda los usados. No sirve para identificar al estudiante y no se puede relacionar entre promos distintas.

Circuito: [`zk/circuito/canje_privado.circom`](zk/circuito/canje_privado.circom), estilo Semaphore con `circomlib`.

### Cómo correrlo

Requiere `circom` 2.2 (se compila desde https://github.com/iden3/circom con `cargo install --path circom`). `snarkjs` y `circomlib` se instalan con `npm install`.

```bash
npm run zk:setup     # compila el circuito y genera las llaves (~1 min)
npm run zk:demo      # recorrido completo con los ataques
```

O paso a paso:

```bash
npm run zk -- publicar 2026-10                       # la U publica el árbol
npm run zk -- probar ana 2026-10                     # Ana genera su prueba
npm run zk -- verificar data/zk-prueba-ana.local.json   # el comercio verifica
```

La demo muestra que se rechaza:
- el **doble canje** (mismo estudiante, misma promo, aunque genere una prueba nueva);
- a un **estudiante no elegible** que usa el camino de otra persona: el circuito no genera la prueba (falla `arbol.raiz === raiz`);
- una **prueba alterada** (la verificación Groth16 falla);
- una **prueba de otro mes**, aunque el árbol sea idéntico (el `promoId` no coincide; si se cambia, la prueba deja de ser válida).

### Limitaciones de la demo

- **Ceremonia de un solo participante.** `zk/setup.sh` genera las llaves localmente, y quien conozca esa aleatoriedad podría falsificar pruebas. En producción se usaría la ceremonia pública *Perpetual Powers of Tau* para la fase 1 y varios participantes independientes en la fase 2 (basta con que uno sea honesto).
- **Custodia de secretos.** Los secretos se guardan en `keys/zk/`. En producción se generan en el celular del estudiante y la U solo recibe el compromiso.
- **Verificación en el backend.** Los nullifiers se guardan en un archivo. Como mejora, la verificación y el registro de nullifiers podrían ir dentro de Solana con `groth16-solana`.
- **Anonimato según el tamaño del grupo.** Con 2 elegibles, el comercio sabe que fue uno de dos. El anonimato crece con el número de estudiantes en el árbol.
