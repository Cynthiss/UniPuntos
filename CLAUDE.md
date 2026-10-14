# UniPuntos — Contexto del proyecto

> Este archivo es el contexto completo para trabajar en el proyecto. Responde siempre en **español**.

## 1. Qué es

**UniPuntos** (nombre provisional) es un venture para la clase **Tech and Freedom** (UFM, Semestre 8).

Es un programa de recompensas universitario: la universidad otorga puntos a los estudiantes por **pagar la mensualidad a tiempo** y por **participación** (tutorías, talleres, voluntariado). Los estudiantes canjean los puntos en **servicios del campus** (parqueo, exámenes extracurriculares) y en **comercios del campus** que se unan al programa.

Inspiración: el anime *Classroom of the Elite*, pero **usado como contraste**. En la serie, la escuela controla los puntos y los usa para vigilar y castigar. UniPuntos diseña el mismo mecanismo al revés: voluntario, transparente y sin castigos, con garantías técnicas que impiden que la universidad abuse del sistema.

Pitch en una frase:
> Ayudamos a la universidad a reducir la mora y aumentar la participación estudiantil, convirtiendo la puntualidad y el esfuerzo en beneficios dentro del campus.

## 2. Preguntas que la presentación debe responder

1. ¿Cuál es el problema?
2. ¿Cómo se va a resolver?
3. ¿Con qué tecnologías?
4. ¿Cuál es el modelo de negocio?
5. ¿Qué se necesita para hacerlo realidad?

## 3. Problema y argumento económico

**Problema principal: la morosidad en mensualidades.** Es medible, tiene un cliente con presupuesto (el área financiera) y el ahorro que genera financia las recompensas.

Cómo gana la universidad:

1. **Retención (el argumento más fuerte).** La mora acumulada lleva a la deserción, y un estudiante que se va hace perder todas las mensualidades restantes. Ejemplo hipotético: mensualidad de Q2,500 × 10 meses restantes = Q25,000 por estudiante retenido. Evitar 5 abandonos al año = Q125,000, frente a un presupuesto de recompensas de Q20/mes × 200 estudiantes × 12 meses = Q48,000.
2. **Flujo de caja y menor costo de cobranza.**
3. **Costo marginal casi cero.** Un parqueo vacío, un cupo libre en un examen o un taller que ya se iba a dar valen mucho para el estudiante y casi nada para la U. Los puntos se canjean por valor percibido y se pagan a costo marginal. El catálogo inicial debe cargarse hacia servicios propios de la U.
4. **Los comercios cofinancian** promociones porque ganan clientes.

Fórmula: **Beneficio = retención + ahorro en cobranza − costo de recompensas − costo de operación**

Objeción esperada: "La mora genera recargos". Respuesta: los recargos son pequeños comparados con la deserción, y parte de la mora nunca se cobra.

Objeción esperada: "¿Por qué no un descuento por pronto pago?". Respuesta: el descuento solo resta ingresos. Los puntos se gastan dentro del campus, generan clientes para los comercios (que cofinancian) y dan datos sobre qué incentivos funcionan.

Los números son ilustrativos: hay que validarlos con el área financiera de la U (por ejemplo, el % de estudiantes que paga tarde).

## 4. Modelo de negocio

- **Usuario:** el estudiante. **Cliente:** la universidad.
- Ingresos: suscripción de la universidad (plataforma, soporte, reportes) y, más adelante, una comisión pequeña a los comercios por canje o promoción destacada.
- Dos presupuestos separados:
  - **Operación** (desarrollo, hosting, soporte): se cubre con ingresos de la plataforma.
  - **Recompensas**: aportes de la U, promociones de los comercios o patrocinios.
- **Los puntos no crean dinero.** Ejemplo: un canje de Q10 sobre una compra de Q30. Si financia la U, el estudiante paga Q20 y la U reembolsa Q10 al comercio. Si financia el comercio, acepta recibir Q20 como promoción.
- Puntos no canjeados: se reconoce que existen y se devuelven al fondo de recompensas (transparencia).
- Piloto propuesto: un semestre, 100–200 estudiantes, 2–3 comercios, 2 formas de ganar puntos, catálogo pequeño, presupuesto y reglas definidos antes de lanzar.

## 5. Principios de diseño (garantizados por el código)

- **Puntos no transferibles:** no se compran ni venden, sin mercado negro.
- **Nadie puede quitarlos:** no existe instrucción para quemar puntos sin la firma del estudiante (sin permanent delegate).
- **Emisión auditable:** cualquiera puede verificar cuánto se emitió y canjeó.
- **Privacidad:** en la cadena solo va un **hash del motivo**, nunca notas ni estado de pago. Los comercios no ven datos académicos ni financieros.
- **Participación voluntaria, sin rankings públicos, sin castigos.** Los servicios esenciales y los derechos académicos no dependen de los puntos.
- **Puntos por notas: fuera del piloto** (riesgo de presión sobre catedráticos y de premiar a quien ya va bien). Si se incluyen, mejor por mejora o por completar actividades, y se presentan como discusión ética.

Seudónimo ≠ anónimo: los saldos están ligados a direcciones, por eso los motivos van en hash y los canjes sensibles usan conocimiento cero (nivel 3).

## 6. Arquitectura y stack

Stack disponible en la clase: Node.js 24 · Rust · Git · Python 3 · Foundry · MetaMask · Solana CLI · Anchor · WDK · Pear · circom · snarkjs · Tor daemon · i2pd · strfry · Bitcoin Core · Sparrow · Polar · QVAC.

Elegidas (pocas y bien justificadas):

| Herramienta | Rol |
|---|---|
| Solana CLI + Anchor | Token de puntos y programa con las reglas |
| Token-2022 (NonTransferable) | Puntos no transferibles |
| circom + snarkjs | Canje privado con prueba de conocimiento cero |
| WDK | Wallet embebida (en producción; en la demo, llaves en el backend) |
| Node.js | Backend, scripts, app web, paneles |
| Git | Control de versiones |

Fuera del piloto: Bitcoin Core, Sparrow, Foundry, MetaMask, Tor, i2pd, strfry, Pear. Extensiones a mencionar solo en diapositivas: **QVAC** (asistente de IA local en el celular) y **Polar/Lightning** (liquidación futura con comercios).

Justificación de usar blockchain (el jurado lo va a preguntar): una base de datos bastaría para un programa de puntos común. La cadena se justifica porque **le quita a la universidad el poder de manipular los puntos** (no puede quitarlos ni emitir de más sin que se vea) y hace **auditable el presupuesto**.

### Flujo

1. **Alta:** el estudiante entra con su cuenta universitaria y se le crea una wallet.
2. **Ganar:** la U valida una conducta y el backend emite puntos firmando con la autoridad de la U. En la cadena solo va la cantidad y el hash del motivo.
3. **Consultar:** la app muestra saldo, historial y catálogo.
4. **Canjear:** el estudiante elige una recompensa, la app genera un QR de un solo uso, el comercio lo escanea y se queman los puntos.
5. **Liquidar:** a fin de mes la U reembolsa en quetzales a cada comercio según los canjes registrados en la cadena.

La universidad paga las comisiones de transacción (fee payer). En Solana son fracciones de centavo.

## 7. Plan de desarrollo por niveles

Cada nivel funciona por sí solo. Todo en **Solana devnet**.

### Nivel 1 — mínimo funcional (empezar aquí)

1. Script reproducible para crear el mint de puntos con Token-2022:
   - Programa Token-2022: `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`
   - `spl-token --program-id <Token-2022> create-token --enable-non-transferable --decimals 0`
   - Mint authority = keypair de la universidad (también fee payer).
2. Scripts en Node.js (`@solana/web3.js`, `@solana/spl-token`):
   - `award.js`: la U otorga N puntos a un estudiante, con el motivo guardado off-chain y su hash en un memo.
   - `redeem.js`: el estudiante quema puntos para canjear una recompensa.
   - `balance.js`: consulta de saldo.
3. Datos de prueba: 3 estudiantes, 2 comercios y un catálogo de 3–5 recompensas (parqueo, café 2x1, examen extracurricular).
4. Para la demo, el backend genera y guarda las llaves de los estudiantes (custodia). Debe quedar documentado que en producción se usaría WDK.
5. Página web sencilla y adaptable al celular: saldo, catálogo y generación de un QR de un solo uso.
6. Página del comercio: escanea o ingresa el código del QR y confirma el canje (el backend valida que no se haya usado y quema los puntos).

Limitación conocida del nivel 1: el mint authority puede emitir sin tope. Eso se resuelve en el nivel 2.

### Nivel 2 — programa Anchor con reglas

Cuentas (PDAs):
- `Config`: autoridad de la U, mint, tope de puntos por estudiante por período, período actual.
- `StudentState`: estudiante, puntos ganados en el período, id del período.
- `Merchant`: comercio registrado, activo/inactivo.
- `Redemption`: estudiante, comercio, recompensa, cantidad, fecha (para la liquidación).

Instrucciones:
- `initialize`, `register_merchant`, `award_points` (respeta el tope; recibe `reason_hash: [u8; 32]`), `redeem` (requiere la firma del estudiante, quema y crea `Redemption`).
- No debe existir ninguna instrucción que quite puntos sin la firma del estudiante.
- El programa debe ser el mint authority (PDA) para que el tope no se pueda saltar.
- Pruebas con `anchor test`.

### Nivel 3 — canje privado con conocimiento cero

Caso: promoción 2x1 solo para estudiantes que pagaron puntual este mes, sin que el comercio sepa quién es.
- La U publica un árbol de Merkle (Poseidon, profundidad ~10) de compromisos `Poseidon(secret)` de los estudiantes elegibles.
- Circuito en circom (estilo Semaphore, con circomlib): prueba de pertenencia al árbol + `nullifierHash = Poseidon(secret, promoId)`.
- Entradas públicas: `root`, `nullifierHash`, `promoId`.
- Groth16 con snarkjs. Verificación en el backend para la demo; como mejora, verificación dentro de Solana (groth16-solana).
- Se guardan los nullifiers usados para evitar el doble canje.
- Puede ser una demo aislada, no tiene que estar conectada a la app.

## 8. Cómo trabajar

- **Prioridad:** que el nivel 1 funcione de punta a punta antes de pasar al siguiente.
- **Código comentado en español** y un **README en español** que explique cómo correr todo y qué hace cada parte. El equipo debe poder defenderlo en la presentación.
- Antes de empezar, revisar las versiones instaladas de `solana`, `spl-token`, `anchor`, `node` y `rustc`, y que la configuración apunte a devnet.
- Nunca subir keypairs a git (`.gitignore` para `keys/`, `*.json` de llaves y `.env`).
- Computadora: macOS, Apple Silicon (arm64).
