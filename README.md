# simulador-financiero-y-actuarial

Plataforma web para una **prueba técnica de pasantía en ciencia actuarial, finanzas y riesgos** de una aseguradora colombiana. Equipos de practicantes tarifican un libro de autos, gestionan un portafolio de inversión y son evaluados a lo largo de **4 días de reto / 2 años simulados**, con calificación objetiva (motor actuarial/financiero) y subjetiva (rúbrica del evaluador).

Corre **100% en planes gratuitos** (Vercel Hobby + Neon Postgres free tier) — sin costo alguno para operar.

## Qué hace

- Genera un universo sintético de **1,000,000 de pólizas** de auto en Colombia (riesgo, siniestros y fechas fijados de forma determinística por semilla).
- Cada equipo sube su propia tarifa (prima por póliza) y compite contra los demás equipos en un mercado simulado (elección discreta tipo logit); lo que limita cuánto puede crecer cada equipo es su propio capital y solvencia, no un tope de cuota fijo igual para todos (ver §2.1).
- A lo largo de 4 días, los equipos tarifican, invierten, reservan, cierran P&G, calculan solvencia y hacen recomendaciones sectoriales — todo evaluado automáticamente contra un motor de referencia, más una calificación subjetiva del evaluador.
- El evaluador (admin) controla cuándo cada equipo ve sus resultados (publicación por día, no todo-o-nada).

## Arquitectura

```mermaid
flowchart TB
    subgraph Cliente["Navegador"]
        Admin["Vista Admin"]
        Team["Vista Equipo"]
    end

    subgraph Vercel["Vercel (Hobby, gratis)"]
        NextApp["Next.js App Router\n(UI + API en un solo deploy)"]
        Proxy["proxy.ts\n(gating por rol)"]
    end

    subgraph Neon["Neon Postgres (free tier)"]
        DB[("Tablas: Team, SimulationRun,\nTeamSimResult, TariffSubmission,\nDeliverable, Score...")]
    end

    Admin -->|HTTPS| Proxy
    Team -->|HTTPS| Proxy
    Proxy --> NextApp
    NextApp <-->|"@prisma/adapter-neon\n(driver WebSocket)"| DB
```

| Capa | Elección | Por qué |
|---|---|---|
| Framework | Next.js 16 (App Router) | Un solo repo/deploy para UI + API, roles vía rutas |
| Base de datos | Neon Postgres + Prisma (`@prisma/adapter-neon`) | Tipado end-to-end, migraciones versionadas, tier gratuito generoso |
| Auth | NextAuth (Credentials) | Cuentas de equipo usuario+contraseña creadas por el admin, sin correo (evita servicios de pago) |
| Datos masivos | `bytea` en el mismo Postgres | 1M números Float32 ≈ 4 MB; evita un segundo servicio (Vercel Blob) |
| Deploy | Vercel Hobby | Integración directa con Next.js, dominio `*.vercel.app` gratis |
| CSV | Papa Parse + zod | Parseo real con validación de esquema (no `split(',')`) |

## El motor: universo, mercado y reservas

```mermaid
flowchart LR
    Seed["Semilla"] --> Gen["generateColombia()\n1,000,000 pólizas"]
    Gen --> Risk["Riesgo: λ (frecuencia) y\nseveridad media por póliza\n(modelo GLM multiplicativo)"]
    Risk --> Claims1["Siniestros Año 1\n(fijados en la generación)"]

    Tarifa1["Tarifa Año 1\nde cada equipo"] --> Market1["Mercado Año 1\n(logit + límite por capital/\nsolvencia + redistribución)"]
    Claims1 --> Market1
    Market1 --> Assign1["Asignación: qué equipo\nse queda con cada póliza"]

    Assign1 --> Reserves["Reservas + IBNR\n(RSA avisado + estimado no reportado)"]
    Assign1 --> Claims2["generateYear2Claims()\nnuevos siniestros Año 2"]
    Tarifa2["Tarifa Año 2\n(retarifación)"] --> Market2["Mercado Año 2\ncon retención de clientes"]
    Assign1 --> Market2
    Claims2 --> Market2
    Market2 --> Assign2["Asignación Año 2"]

    Assign2 --> Dev["Desarrollo Año1→Año2\n(pagos reales, reserva restante)"]
    Dev --> FinBench["finBench(): P&G, Balance,\nSolvencia (RK), Dividendos"]
```

La generación es **determinística**: la misma semilla siempre produce el mismo universo, lo mismo que la asignación de mercado (dado el mismo β, factor de marca y techo de cuota — el límite de capital de cada equipo, ver §2.1, es una función pura de sus propios datos ya guardados, así que también es determinístico). Esto permite que cada corrida sea reproducible y auditable.

## Los modelos actuariales y financieros, en detalle

Esta sección explica **qué calcula el motor y por qué**, no solo el flujo general de arriba. Todo el código referenciado vive en `src/domain/` (puro, sin dependencias de Next.js/Prisma/React) y tiene tests unitarios con semilla fija.

### 1 · Generación del riesgo (frecuencia y severidad)

Cada póliza tiene 13 variables (edad, zona, tipo de vehículo, antigüedad, kilometraje, historial de siniestros, valor asegurado, uso, parqueadero, nivel educativo, estrato, género, marca). A partir de esas variables:

- **Frecuencia (λ)** — `calcLambda()` — un modelo GLM multiplicativo: se parte de una frecuencia base y se multiplica por factores de riesgo relativo por cada variable (ej. zona urbana ×1.45, historial de 2+ siniestros ×1.85–3.20, uso comercial ×1.70), más algunas **interacciones** (joven + deportivo, urbano + comercial) y un par de variables "trampa" deliberadamente débiles para que la señal real no sea trivial de encontrar. El resultado es la probabilidad de que esa póliza tenga al menos un siniestro en el año.
- **Severidad media** — `calcMediaSev()` — proporcional al valor asegurado del vehículo, con factores por tipo de vehículo, zona y antigüedad. El siniestro individual se muestrea de una **Gamma** con esa media (forma fija), lo que da una cola derecha realista (muchos siniestros pequeños, pocos grandes). Los siniestros del **Año 2** (`generateYear2Claims()`) usan el mismo modelo de severidad pero con un año adicional de inflación de costo de siniestros (`CLAIMS_INFLATION_ANNUAL = 9%` en `src/domain/generation/constants.ts`) aplicado como un multiplicador plano sobre la media, antes del sorteo Gamma — la frecuencia (λ) no cambia por esto, solo el costo de un siniestro que sí ocurre. Esta tasa exacta no se le comunica a los equipos — la guía del pasante de Día 2 solo les da la inflación general de referencia (`GENERAL_INFLATION_ANNUAL ≈ 6%`, ver abajo) y les señala que la inflación de costo de siniestros es mayor a esa, dejando la estimación del valor exacto como parte del reto (ver §1.1 para cómo un equipo podría acercarse a él combinando ese 6% con la tendencia real del dataset Chile).
- **Fecha de ocurrencia y aviso** — el mes de ocurrencia sigue un patrón estacional (más siniestros en diciembre/enero, `sampleClaimDate()`). El aviso **no es inmediato**, y de hecho es lento: el rezago ocurrencia→aviso sigue una **lognormal** (`sampleReportingLag()`, μ=5.5/σ=1.2 en días, mediana ~245 días, media ~14 meses, cola topada en `LAG_AVISO_MAX_DIAS` = 1.825 días/5 años). Es la fuente real de IBNR (ver §3) y, desde que el pago dejó de repartirse en tres años, también es lo que carga prácticamente toda la duración del pasivo. Medido sobre 200k exposiciones: solo el **36%** de los siniestros de un año se avisa dentro de ese mismo año.

Todo esto se fija en el momento de `generateColombia(seed)`: la misma semilla siempre produce el mismo universo, byte a byte.

#### 1.1 · Dataset Chile — la referencia de tarificación

El CSV público del universo (`/api/universe/public-csv`) trae solo las 13 variables de riesgo, nunca siniestros ni severidad — ninguna aseguradora real regala esos resultados a la competencia, y un equipo tampoco los conoce de antemano de su propio libro. La única fuente con resultados reales que un equipo tiene antes de tarificar el Año 1 es el **dataset Chile** (`generateChile()`, `src/domain/generation/generateChile.ts`): 100,000 pólizas con **tres años de exposición independientes (2021, 2022, 2023)**, cada una con su propio sorteo de siniestro, fecha de ocurrencia y fecha de aviso — descargable como CSV desde la pestaña de Simulación del Día 1 (`/api/universe/chile-csv`, mismo patrón de regeneración desde semilla que el universo de Colombia, nunca un blob almacenado — ver CLAUDE.md §4.1).

No es un atajo: el dataset está diseñado con **retos de transferibilidad deliberados**, que ningún equipo ve documentados en ninguna vista del producto — solo aquí, como referencia del evaluador:

- **Variables con nombre distinto pero mismo concepto** (`kilometraje_anual` → `km`, `siniestros_previos` → `hist`) — transferibles sin más que renombrar.
- **Variables con el mismo nombre pero significado distinto** — `zona` en Chile es región administrativa (metropolitana/norte/centro/sur/austral), no densidad urbana como en Colombia; `comuna_tipo` (gran_ciudad/ciudad_media/rural) es en realidad el análogo más cercano al concepto colombiano de `zona`.
- **Categorías que no existen del otro lado** — `station_wagon`/`furgon` (tipo de vehículo) y `taxi`/`uber` (uso) no tienen equivalente colombiano directo; `caja_automatica`/`seguro_complementario` no existen como variables en Colombia.
- **Moneda** — la severidad de Chile está en UF (Unidad de Fomento chilena), no en pesos colombianos: requiere conversión antes de poder compararse con nada del universo de Colombia.
- **Brecha temporal** — Chile cubre 2021-2023, mientras que el Año 1 de Colombia es **2027**: incluso después de convertir de UF a COP, la severidad de Chile no está a valor presente. Usar la severidad de Chile tal cual para calibrar la tarifa del Año 1 la subestima sistemáticamente — ver el bullet de "Puente Chile → Colombia" más abajo para el mecanismo exacto (no es una sola tasa de inflación general; la UF ya neutraliza esa parte). La plataforma no publica las tasas exactas para cerrar esa brecha; es una decisión que cada equipo debe justificar con criterio propio, igual que el resto de ajustes de este dataset — la misma brecha, un año más, vuelve a aplicar al retarifar para el Año 2 en el Día 2.
- **Tendencia real dentro de Chile mismo (para estimar la inflación de siniestros de Colombia, ver §1.1 arriba, y para el rendimiento real de TES UVR, ver §5)** — `generateChile()` crece la severidad `CHILE_REAL_SEVERITY_GROWTH_ANNUAL = 3%` cada año (aplicado a `baseUf` antes del sorteo Gamma, igual que `CLAIMS_INFLATION_ANNUAL` en Colombia). Como está en UF — una unidad ya indexada a la inflación chilena —, esa tendencia es un crecimiento **real** de costo (repuestos/mano de obra), no inflación disfrazada. No se publica: la pista para un equipo que la mida por su cuenta (comparando severidad promedio 2021 vs. 2022 vs. 2023 en el CSV de Chile) es que, combinada con la inflación general de Colombia que sí se le da como referencia en la guía de Día 2 (`GENERAL_INFLATION_ANNUAL ≈ 6%`, ver arriba), puede acercarlos a la inflación de costo de siniestros real — esa combinación es multiplicativa, no una suma: `(1+CLAIMS_INFLATION_ANNUAL) = (1+GENERAL_INFLATION_ANNUAL)×(1+CHILE_REAL_SEVERITY_GROWTH_ANNUAL)` — el motor mismo nombra el resultado exacto `CLAIMS_INFLATION_ANNUAL = 9%` (`src/domain/generation/constants.ts`), que un equipo puede acercarse a estimar así aunque no se le publique directamente. La misma tendencia de Chile, junto con este mismo despeje, alimenta también cómo se le muestra a un equipo el rendimiento de TES UVR (ver §5, la tabla de instrumentos).

- **Puente Chile → Colombia (transferibilidad de severidad, `chileSeverityToColombia2027Cop()` en `src/domain/generation/constants.ts`)** — dado que la guía de Día 1 le pide a los equipos usar el dataset Chile (2021-2023, en UF) como referencia para su propia severidad de Colombia (Año 1 = 2027, en COP), hay que resolver dos brechas antes de comparar montos, no solo convertir la unidad. **Brecha temporal**: la UF no tiene un "crecimiento real" propio que ajustar — está indexada a diario al IPC chileno precisamente para que su poder adquisitivo real se mantenga constante — así que el único ajuste real necesario es extender `CHILE_REAL_SEVERITY_GROWTH_ANNUAL` desde el año de Chile observado (2021/2022/2023) hasta 2027 (4 a 6 años). **Brecha de moneda**: el monto en UF resultante se convierte a COP vía una tasa de referencia fija (no una proyección a 2027, poco confiable a esa distancia) — `UF_CLP_REFERENCE_VALUE = 40.845` CLP/UF y `CLP_COP_REFERENCE_RATE = 3.5` COP/CLP, ambas el valor de mercado real de jul-2026 (cuando se escribió este ejercicio; fuentes: valoruf.cl y valutafx.com/morsemoney.com). Ninguna de las dos tasas del puente se publica directamente al equipo — la guía de Día 1 explica las dos brechas conceptualmente (§ "El desafío de transferibilidad") y deja la investigación de los valores reales como parte del reto, igual que el resto de las pistas de esta sección. Esta función no la usa `generateColombia()`/`calcMediaSev()` (que se calibra de forma independiente, en COP) — existe para que el reto de transferibilidad tenga una respuesta concreta y verificable, no solo una narrativa. El rango de `valorUf` en `generateChile()` se recalibró de 50-8.000 UF (media ≈4.025) a 50-2.250 UF (media ≈1.150) para que, una vez convertida, la severidad de Chile caiga en el mismo orden de magnitud que la severidad propia de Colombia (~COP 30-40M promedio) — con el rango anterior, el puente daba ~3.5x la severidad real de Colombia, un desajuste que habría hecho que la comparación pareciera un error del equipo en vez de una validación útil.

Lo único que **sí** es directamente transferible sin ajuste es el patrón de desarrollo aviso→pago: ambos datasets muestrean el rezago con la misma distribución lognormal (μ=5.5, σ=1.2), que es justamente lo que calibra internamente la curva de desarrollo de reservas del motor (`src/domain/reserving/constants.ts`, ver §3) — a diferencia de la severidad, el tiempo de desarrollo no depende de en qué año ocurrió el siniestro.

La tabla variable-por-variable de qué tan transferible es cada campo de Chile a Colombia vive solo aquí, como referencia del evaluador — no se le muestra a los equipos, que deben llegar a ella por su cuenta:

| Variable Chile | Análogo Colombia | Truco de transferibilidad |
|---|---|---|
| `edad_conductor` | `edad` | Transferible directamente |
| `tipo_vehiculo` | `tipo` | `station_wagon` y `furgon` no existen en Colombia — requiere mapeo |
| `zona` | `zona` | Mismo nombre, significado distinto: en Chile es región geográfica, no densidad urbana |
| `antiguedad_vehiculo` | `antig` | Transferible |
| `kilometraje_anual` | `km` | Mismo concepto, nombre distinto |
| `siniestros_previos` | `hist` | Transferible |
| `valor_comercial_uf` | `valor` | En UF chilenas — requiere conversión de moneda y recalibración |
| `uso_vehiculo` | `uso` | `taxi`/`uber` no existen como categoría en Colombia |
| `caja_automatica` | — (no existe en Colombia) | Sin análogo directo |
| `seguro_complementario` | — (no existe en Colombia) | Indica si tiene SOAP activo — no existe en Colombia |
| `genero` | `genero` | Transferible (señal débil en ambos datasets — ver "trampas" en §1.2/§1.3) |
| `comuna_tipo` | — (más cercano a `zona` Colombia) | Más parecido al concepto colombiano de `zona` que la propia variable `zona` de Chile |

#### 1.2 · Coeficientes exactos de `calcLambda()` y `calcMediaSev()` (Colombia)

Modelo de referencia completo, para verificar entregables contra el motor exacto (no una aproximación) — `src/domain/pricing/frequency.ts` y `src/domain/pricing/severity.ts`. Ninguno de estos números se muestra en ninguna vista de equipo.

**Frecuencia (`calcLambda()`)** — base `0.065`, multiplicativo, truncado a `[0.01, 0.94]`. La constante de calibración global `CAL_FREQ = 0.33` (`src/domain/generation/constants.ts`) se aplica una sola vez, entre el factor de kilometraje y el de historial, en el orden exacto del código:

| Variable | Categoría → factor |
|---|---|
| Edad | ≤24 ×1.90 · 25–35 ×1.00 · 36–55 ×0.82 · 56–65 ×1.20 · >65 ×1.55 |
| Zona | urbana ×1.45 · rural ×0.70 · (otra) ×1.00 |
| Tipo de vehículo | deportivo ×1.38 · suv/pickup ×1.12 · van ×1.08 · (otro) ×1.00 |
| Historial de siniestros (`hist`) | 0 ×0.75 · 1 ×1.30 · 2 ×1.85 · 3 ×2.60 · 4 ×3.20 · 5+ ×3.20 |
| Kilometraje anual | <15,000 ×0.75 · 15,000–40,000 ×1.00 · 40,001–70,000 ×1.25 · >70,000 ×1.60 |
| Uso | comercial ×1.70 · mixto ×1.30 · (particular) ×1.00 |
| Parqueadero | sí ×0.82 · (no) ×1.00 |
| Educación | básica ×1.25 · técnica ×1.10 · posgrado ×0.90 · (otra) ×1.00 |
| Antigüedad del vehículo | ≤3 ×1.05 · >12 ×1.08 · (4–12) ×1.00 |
| Interacción edad≤24 × deportivo | ×1.40 |
| Interacción edad≤24 × (suv/pickup) | ×1.15 |
| Interacción zona=urbana × uso=comercial | ×1.35 |
| Interacción zona=rural × uso=comercial | ×1.10 |
| Interacción hist≥2 × antig≥8 | ×1.25 |
| Interacción edad≤24 × edu=básica | ×1.20 |
| Género (trampa) | M ×1.04 · F ×0.96 |
| Estrato (trampa, 1→6) | ×1.05 · ×1.03 · ×1.01 · ×0.99 · ×0.97 · ×0.95 |
| Marca (trampa) | chevrolet ×1.02 · renault ×1.01 · mazda ×0.99 · toyota ×0.97 · nissan ×1.01 · hyundai ×0.99 · kia ×0.98 · ford ×1.02 |

**Severidad media (`calcMediaSev()`)** — fracción del valor asegurado del vehículo (`e.valor`):

| Variable | Categoría → factor |
|---|---|
| Tipo de vehículo (factor base sobre `valor`) | deportivo ×0.19 · suv/pickup/van ×0.15 · (otro) ×0.12 |
| Zona | urbana ×1.28 · rural ×0.82 · (otra) ×1.00 |
| Antigüedad del vehículo | ≤3 ×1.22 · >10 ×0.72 · (4–10) ×1.00 |

El siniestro individual se muestrea de una Gamma con media `calcMediaSev()` y forma fija `SEVERITY_SHAPE = 3.306` (`src/domain/generation/constants.ts`). Un `2%` de los siniestros (`OUTLIER_CLAIM_PROBABILITY`) recibe además un multiplicador `×8` (`OUTLIER_CLAIM_MULTIPLIER`) vía un stream de RNG independiente — ver §6. La severidad del Año 2 aplica `CLAIMS_INFLATION_ANNUAL = 9%` como multiplicador plano adicional sobre la media, antes del sorteo Gamma (ver arriba).

**`gammaRand()` (`src/domain/generation/rng.ts`) tuvo un bug heredado del prototipo legacy, corregido.** El sampler Marsaglia-Tsang exige que su variable propuesta `x` venga de una normal estándar N(0,1); la versión portada la tomaba en cambio de `Uniform(-3.5, 3.5)` (varianza ≈4.08 contra la varianza=1 exigida, y una forma completamente distinta — plana y acotada, no acampanada con colas infinitas). Eso inflaba la media empírica del sampler ~33% por encima de la media teórica (`shape`) — verificado con 500,000 muestras: media empírica 4.41 vs. 3.306 esperado para `SEVERITY_SHAPE`, y confirmado contra una implementación corregida de referencia — afectando toda severidad de siniestro, tanto en el universo Colombia como en el dataset Chile (ambos usan la misma función). Corregido usando una normal estándar real (Box-Muller, misma técnica que ya usaba `lognormalRand()`). El fix cambia cuántos números aleatorios consume `gammaRand()` por intento (2 en vez de 1), así que resiembra cada dato posterior al primer siniestro de una semilla dada — todo golden value fijado en pruebas de generación (`generateColombia.test.ts`, `generateChile.test.ts`, `generateYear2Claims.test.ts`) se regeneró corriendo el motor corregido, no se ajustó a mano. El loss ratio real de todo el mercado colombiano — hipotético, con prima comercial de referencia (prima pura verdadera ÷ 0.55) en el denominador, no la prima que ningún equipo cobró — pasó de ~83% (con el bug) a ~63% (corregido) — la brecha restante sobre el 55% teórico de la fórmula queda explicada por completo por el mecanismo de siniestros catastróficos (`OUTLIER_CLAIM_PROBABILITY`/`OUTLIER_CLAIM_MULTIPLIER` de arriba), no por ningún sesgo adicional. Ese ~63% es solo una verificación de consistencia del motor — el loss ratio de mercado que un equipo ve en la guía de Día 2 (§2) es otro número, `computeMarketLossRatio()` (`src/lib/consolidado.ts`), calculado con la prima y los siniestros **reales** de todos los equipos del cohorte (los que de verdad cobraron, agregados, nunca desglosados por equipo) — depende de cómo tarifique ese cohorte específico, así que no tiene por qué acercarse a ese ~63% teórico.

#### 1.3 · Coeficientes exactos del dataset Chile (`calcLambdaChile()` / `calcSeverityBaseChile()`)

Mismo modelo funcional que Colombia, coeficientes propios — `src/domain/pricing/chile.ts`. `genero` se genera para Chile pero no se usa en este modelo (campo puramente descriptivo).

**Frecuencia (`calcLambdaChile()`)** — base `0.072 × CAL_FREQ`, truncado a `[0.01, 0.94]`:

| Variable | Categoría → factor |
|---|---|
| Edad | ≤24 ×1.85 · 25–35 ×1.00 · 36–55 ×0.84 · 56–65 ×1.18 · >65 ×1.50 |
| Zona | metropolitana ×1.40 · norte ×0.95 · centro ×1.05 · sur ×0.90 · austral ×0.78 |
| Tipo de vehículo | furgon ×1.35 · pickup ×1.12 · suv ×1.08 · station_wagon ×1.02 · (otro) ×1.00 |
| Historial de siniestros (`hist`) | 0 ×0.72 · 1 ×1.28 · 2 ×1.80 · 3 ×2.55 · 4 ×3.10 · 5+ ×3.10 |
| Kilometraje anual | <15,000 ×0.76 · 15,000–40,000 ×1.00 · 40,001–70,000 ×1.22 · >70,000 ×1.55 |
| Uso | comercial ×1.60 · taxi ×2.10 · uber ×1.80 · (particular) ×1.00 |
| Caja automática | sí ×0.92 |
| Seguro complementario | sí ×0.88 |
| Tipo de comuna | gran_ciudad ×1.15 · rural ×0.80 · (ciudad_media) ×1.00 |
| Antigüedad del vehículo | ≤3 ×1.04 · >12 ×1.10 · (4–12) ×1.00 |
| Interacción edad≤24 × tipo=furgon | ×1.30 |
| Interacción zona=metropolitana × uso∈{taxi,uber} | ×1.25 |
| Interacción hist≥2 × antig≥8 | ×1.22 |

**Severidad base en UF (`calcSeverityBaseChile()`)** — fracción del valor asegurado en UF (`valorUf`):

| Variable | Categoría → factor |
|---|---|
| Tipo de vehículo (factor base sobre `valorUf`) | furgon ×0.18 · suv/pickup ×0.15 · station_wagon ×0.13 · (otro) ×0.12 |
| Zona metropolitana | ×1.25 (resto de zonas, sin ajuste) |
| Antigüedad del vehículo | ≤3 ×1.20 · >10 ×0.74 · (4–10) ×1.00 |

El siniestro individual se muestrea con la misma Gamma (`SEVERITY_SHAPE = 3.306`) que el universo de Colombia (`generateChile.ts`).

### 2 · Mercado (a quién le toca cada póliza)

Cada equipo sube una tarifa (prima por póliza). El mercado se resuelve en 3 fases (`runSimulation()`):

1. **Preferencias (logit)**: cada póliza calcula una utilidad `u = -β·ln(prima/1,000,000) + ruido_Gumbel·factor_marca` por cada equipo, y "elige" al de mayor utilidad. β es la sensibilidad al precio (mayor β = mercado más sensible a precio); el ruido Gumbel con el factor de marca simula inercia/fidelidad de marca que no depende solo del precio.
2. **Racionamiento por capital y solvencia**: cada equipo tiene su propio límite de pólizas — no un porcentaje fijo igual para todos, sino uno derivado de cuánto capital tiene disponible y qué tan riesgoso es su portafolio (ver §2.1). Si más pólizas lo prefieren de las que su límite permite, se queda con las de **mayor prima** (maximiza ingreso dado el cupo) y rechaza el resto.
3. **Redistribución**: las pólizas rechazadas se reasignan entre los equipos con cupo restante, con el mismo mecanismo logit.

**Año 2** (`runSimulationYear2()`) repite esto pero con dos diferencias: (a) los siniestros del Año 2 son un sorteo **independiente** del Año 1 (mismo modelo de riesgo, un año más de antigüedad, e historial actualizado si hubo siniestro en el Año 1) — no se reciclan los siniestros del Año 1; y (b) cada póliza tiene un **bono de retención** hacia el equipo que la aseguró en el Año 1 (ruido Gumbel adicional escalado por un factor de retención configurable) — a mayor factor, más difícil que un equipo pierda un cliente solo por precio.

#### 2.1 · De dónde sale el límite de cada equipo (capital y solvencia, no un techo arbitrario)

El límite que efectivamente rechaza pólizas es **personalizado por equipo**, derivado del mismo modelo de solvencia que ya usa `finBench()` para el Día 4 (§4) — la idea real detrás: una aseguradora no puede seguir creciendo indefinidamente solo porque tenga buenos precios; el capital que respalda su negocio pone un techo natural a cuánto riesgo puede suscribir. `cuotaPct` (un techo parejo, ej. 30%, igual para los 12 equipos) sigue existiendo como **techo absoluto** que ningún equipo puede superar sin importar su capital (una salvaguarda regulatoria/técnica, no el mecanismo principal), pero el límite que normalmente aplica primero es el de capital.

**El problema de fondo**: `finBench()` calcula el margen de solvencia *después* de conocer cuánta prima y cuántas reservas resultaron del mercado — pero el límite de capacidad se necesita *antes* de correr ese mercado, porque es lo que decide cuántas pólizas puede ganar cada equipo. La solución (`src/domain/finance/capacity.ts`) invierte la fórmula de `finBench()`: en vez de "dado tu volumen de negocio, cuál es tu margen", pregunta "dado tu capital disponible, cuánto volumen de prima puedes sostener manteniendo un margen de solvencia objetivo".

- **`CAPACITY_TARGET_MARGIN = 1.0`** — el margen objetivo para dimensionar capacidad, deliberadamente distinto del `FZ.targetMargin = 1.5` que usa `finBench()` para decidir dividendos (una barra más exigente, "sobra capital para repartir", no "sigo siendo solvente"). Dimensionar la capacidad contra 1.5 habría sido innecesariamente conservador; 1.0 es la línea real de solvencia.
- **Reservas e inversiones, aproximadas proporcionalmente a la prima**: como todavía no se sabe qué pólizas va a ganar cada equipo (eso es justo lo que el racionamiento está decidiendo), no hay una reserva real que usar. Se aproxima como `reserva ≈ prima × 0.796`, donde 0.796 = 0.861 (la misma razón reserva/incurrido de §5.1, medida contra `generateColombia(42)`, invariante al tamaño del equipo porque depende solo de los rezagos aviso/pago del universo) × 0.925 (la razón de siniestralidad de referencia — el punto medio de la banda "sana" que ya usa la analítica sectorial: `LR_BAJO=0.85` "crecer" / `LR_ALTO=1.0` "disminuir", ver `analytics.ts`). El patrimonio se aproxima como el capital disponible mismo (sin sumar utilidad retenida, que todavía no se conoce antes de que el mercado cierre) — una aproximación deliberadamente conservadora, ya que el patrimonio real solo puede ser igual o mayor.
- **Volatilidad del portafolio (`volRatio`)**: el promedio ponderado de la volatilidad de los instrumentos elegidos (sin necesidad de simular nada, es una propiedad de los pesos, no de la simulación), vía el mismo `volRatioFromWeights()` compartido. La fuente de esos pesos es distinta por año (ver abajo): el portafolio de mínima varianza de Día 1 para el Año 1, el calendario real de Día 2 para el Año 2 — nunca el mismo día para ambos.
- **La prima máxima soportable (`maxPremiumForCapital()`) se resuelve por búsqueda binaria**, no con una fórmula cerrada derivada a mano — la función de riesgo de capital (`riskCapitalForPremium()`) es exactamente la misma suma de `rSusc`/`rFin`/`rOp` agregada vía `CORR_MOD` que usa `finBench()`, así que cualquier cambio futuro en esas fórmulas se refleja aquí automáticamente sin tener que re-derivar nada a mano. Esa prima máxima se convierte en un número de pólizas dividiendo por la prima promedio que el propio equipo ya subió (dato conocido antes de que el mercado corra, porque es su propio CSV).

**La conexión entre los dos años (`src/lib/capacityHelper.ts`)**, que es el punto central de este cambio:

- **Año 1** (calculado antes de que cierre el mercado de Año 1, al final de Día 1): todos los equipos parten del mismo `CAPITAL_SOCIAL` fresco — nadie ha comprometido nada todavía. El límite de cada equipo difiere por su propio precio promedio (una prima más barata necesita más pólizas para llegar al mismo techo de prima, así que tiene un límite de pólizas más alto) y la volatilidad del portafolio de mínima varianza que sometió en Día 1 (§5.6) — una especie de presentación regulatoria en el "momento 0", antes de escribir una sola póliza.
- **Año 2** (calculado antes de que cierre el mercado de Año 2, al final de Día 2): el capital disponible que alimenta la misma fórmula ya no es el `CAPITAL_SOCIAL` completo — es `bal1.patrimonio`, calculado por `computeFinBenchForCohort()` usando el ALM **real** de cada equipo (con su prima real, no la ficticia — ver §5.3). Un equipo que tuvo que comprometer mucho Capital Social cubriendo caja en el Año 1 entra al Año 2 con menos capacidad de crecer, **antes incluso de tarificar**. La volatilidad para este año viene del calendario real que el equipo somete en Día 2 (§5) — ya existe para cuando cierra este mercado.

**Qué ve cada equipo**: en los resultados objetivos de cada día (Día 1/2) se muestra el límite por capital, el límite efectivamente aplicado (el menor entre ese y el techo del admin) y cuántas pólizas se rechazaron por él. En el Día 4, un panel adicional pone lado a lado el límite de Año 1 y Año 2, para que un equipo que chocó contra su propio capital pueda conectarlo con el Requerimiento de Capital y el Margen de solvencia que está reportando ese mismo día. El panel del evaluador (`admin/day/[n]`) muestra lo mismo por equipo, directamente junto a las cifras de `finBench()`.

**Qué implica en la práctica, y qué es intencional**: un equipo que agota por completo su Capital Social en el Año 1 (`bal1.patrimonio <= 0`) puede quedar con un límite de capacidad de **cero** pólizas en el Año 2 — expulsado del mercado hasta que, en la vida real, levantara más capital. Es una consecuencia dura, deliberada: la lección es que la solvencia no es solo una nota que se reporta al final, sino una restricción real sobre cuánto se puede crecer.

En el Año 2, `capacityByTeamId`/`cuotaPct` son un techo duro en la fase de redistribución: ningún equipo es forzado a recibir más pólizas que su límite por solvencia, ni siquiera en el caso extremo en que la capacidad sumada de todos los equipos no alcance a cubrir todo el universo — esas exposiciones sobrantes quedan sin asegurar (`assignment = -1`) en vez de forzarse sobre algún equipo. La única excepción deliberada es el piso de `MIN_POLICIES_PER_TEAM` (que evita que un equipo quede en cero por precio poco competitivo): ese piso es incondicional y puede llevar a un equipo por encima de su propio límite de capital — ahí se prioriza que el equipo siga en el juego sobre el techo de solvencia. Para completarlo, primero se usan las exposiciones que quedaron sin asegurar (no le quitan nada a otro equipo) y solo si no alcanzan se le quitan pólizas (las más baratas) a los equipos con excedente. El Año 1 no tiene la restricción de capacidad como techo duro — su techo de mercado siempre cubre el 100% del universo — pero comparte el mismo piso incondicional de `MIN_POLICIES_PER_TEAM`.

### 3 · Reservas e IBNR

Al cierre del Año 1, no todos los siniestros ya ocurridos han sido *avisados* — el rezago aviso→pago (§1) implica que una porción real de la siniestralidad todavía no se conoce. `computeLiabilitySchedules()` construye, por equipo, el calendario de pago real de cada siniestro (severidad y timing verdaderos, nunca una estimación), y con eso la reserva técnica se compone de:

- **RSA** (reserva de siniestros avisados): siniestros ya notificados, pendientes de pago según el patrón de desarrollo real (curva de pagos calibrada contra el dataset de Chile).
- **IBNR** (*Incurred But Not Reported*): siniestros ya ocurridos pero todavía sin avisar — su monto real ya quedó fijado desde la generación del universo (la severidad no depende de cuándo se avisa), así que la reserva técnica de cualquier equipo siempre refleja el total pendiente verdadero, nunca una estimación de mercado.

Cada equipo, sin embargo, sí tiene que **estimar** su propia siniestralidad del Año 1 al armar su Costo de Siniestros A1 (Día 2) — sin conocer todavía cuánto de esa reserva corresponde a siniestros que aún no ha visto avisados, puede subestimarla o sobreestimarla. Al cierre del Año 2, esa estimación propia se compara contra el costo real del Año 1 (`year1.claimsAmount`) — la diferencia es "Ajuste de siniestralidad", su propia línea en el P&G del Año 2 (ver §4), que corrige la utilidad del Año 2 por el error de estimación del Año 1, nunca mezclada con el costo de siniestros del Año 2 mismo. Esto es deliberado: un equipo puede tarifar bien pero estimar mal su propia siniestralidad (o viceversa), y ambas cosas se califican por separado.

**Por qué Día 2 usa ELR y Día 3 puede usar Chain Ladder — un cambio real de mecánica, no solo de guía.** El reporte de Día 2 (`/api/teams/report?day=2`, `src/app/api/teams/report/route.ts`) censura los siniestros propios del Año 1 con la misma regla de IBNR que el reporte de Día 1 (avisado dentro del mismo año de ocurrencia) — un equipo solo ve una diagonal (12 meses de desarrollo), insuficiente para calcular ningún factor de desarrollo, así que el método apropiado es Expected Loss Ratio (Día 2's guide §2). El reporte de Día 3 amplía esa visibilidad del Año 1 a "avisado en su propio año o el siguiente" (24 meses) — segunda diagonal — y expone por primera vez `fecha_siniestro_a1`/`fecha_aviso_a1` (nunca dados antes, con granularidad diaria), suficiente para que un equipo arme su propio triángulo mensual (24 filas posibles, una por mes de ocurrencia entre enero 2027 y diciembre 2028) y calcule sus propios factores edad a edad encadenados, en vez de un único factor anual. Los siniestros propios del Año 2 en ese mismo reporte siguen tan censurados como en Día 2 (avisado en su propio año únicamente) — su propia fila del triángulo solo tiene una columna. Pero al ser un triángulo mensual, esa fila comparte el mismo corte de evaluación (fin de 2028) que las filas de 2027, cuyos meses más maduros ya proveen factores edad a edad encadenables — un equipo no necesita ELR para ninguno de los dos años en Día 3, solo lo necesitaba en Día 2, cuando el reporte todavía no daba ninguna segunda columna para nada. El factor de cola que lleva esos 24 meses a costo último sí se le da directamente al equipo (`CHAIN_LADDER_TAIL_FACTOR = 1.003` en `src/domain/reserving/constants.ts`) porque no hay forma de derivarlo solo con datos propios — depende de la cola de rezago de aviso más allá del propio corte del reporte del equipo. Verificado empíricamente (no solo declarado): generando el universo completo de 1M exposiciones en 5 semillas, el 24 meses captura consistentemente 99.6-99.7% del costo último verdadero (frente a ~88.5% a los 12 meses) — de ahí el factor pequeño (~0.3%), justo lo esperado dado que `sampleReportingLag()` es lognormal(μ=3.0, σ=1.2) con mediana ~20 días, aunque con cola hasta 730 días (~24 meses).

**Qué ve un equipo en los resultados objetivos de Día 1.** Deliberadamente no incluye prima total, monto de siniestros ni loss ratio — esas tres cifras juntas revelarían de inmediato el loss ratio real del Año 1 antes de que el equipo lo estime por su cuenta en Día 2 (ELR, arriba). Lo que sí se muestra: número de asegurados, número de siniestros, pólizas rechazadas (por precio o por el límite de capital/solvencia del equipo, ver §2.1) y la posición del equipo en el ranking objetivo de ese día — suficiente para que un equipo entienda su propio desempeño relativo sin adelantarle la respuesta del ejercicio de reserva.

**Cuándo se paga un siniestro, en detalle** — el pago de un siniestro puntual sigue tres tramos consecutivos, no uno solo (una fuente común de confusión al leer la tabla de caja del ALM, ver §5):

1. **Ocurrencia → aviso**: el rezago lognormal de §1 (mediana ~245 días, media ~14 meses, cola hasta 1.825 días/5 años). Aquí está casi toda la espera.
2. **Aviso → pago**: un rezago **fijo** de 3 meses (`LAG_AVISO_PAGO`), y ahí el siniestro se paga **completo**. No hay desarrollo de pago: `buildKernel()` pone el 100% en un solo mes.

Esto reemplazó al reparto en tres años de desarrollo (`DEV_FRAC = [0.55, 0.30, 0.15]`, calibrado de Chile) que traía el prototipo legacy. El cambio se hizo con el rezago de aviso recalibrado al mismo tiempo, justamente para que la duración total no se moviera: **ocurrencia→pago sigue en ~17 meses** (17,0 antes, 17,1 ahora, medido sobre la generación real), así que el ALM tiene que fondear un pasivo del mismo plazo que antes. Lo que sí cambió, y a propósito, es de dónde viene esa espera: antes era pago lento sobre siniestros conocidos, ahora es aviso lento. Consecuencias medidas: el IBNR al cierre del año de accidente pasa de ~7% a ~64% de los siniestros, lo que se paga dentro del año de accidente pasa de ~15% a ~22%, y el factor de cola del Chain Ladder sube de 1,003 a **1,35** (`CHAIN_LADDER_TAIL_FACTOR`, verificado contra la generación real en `generateColombia.test.ts`).

En el peor caso estos tramos se **suman**: un siniestro ocurrido cerca del cierre del Año 1, con un aviso especialmente tardío (cola de la lognormal), puede seguir generando pagos hasta cerca del límite de la ventana simulada. Por eso el horizonte de proyección del pasivo es `LIABILITY_HORIZON=96` meses desde la valoración, no los 48 de antes: con avisos de hasta 5 años, un siniestro del último mes del Año 2 puede pagarse en el mes 86. Se mantiene separado de `HORIZON` (48), que gobierna la corrida del ALM ficticio y no tiene por qué crecer cuando crece el rezago de aviso. Antes bastaban 48 por la holgura frente a los 3 años de desarrollo puro, justamente para no cortar la cola de los siniestros avisados tarde dentro del Año 1. Lo que aun así exceda esa ventana de 48 meses se trunca — no se paga ni se refleja en la reserva —, una simplificación aceptada del modelo, no un error.

### 4 · P&G, Balance y Solvencia (`finBench()`)

`finBench()` es el motor de referencia (el "Motor" que se compara contra lo que cada equipo reporta, ver §7) para tres entregables: el P&G de cada año, el Balance, y la Solvencia del Día 4. Esta sección explica, línea por línea, de dónde sale cada cifra — no solo el resultado final.

**Qué se reporta cada día.** El equipo nunca sube un solo número aparte — cada estado se reporta completo, línea por línea, en el mismo orden vertical de un P&G/Balance real (`DeliverablesForm` los agrupa así, ver `Concepto.group` en `concepts.ts`):

- **Día 2**: el P&G completo del Año 1 (`p1`, 13 líneas — ver §4.1).
- **Día 3**: el P&G del Año 2 (`p2`, 15 líneas — dos más que Año 1: libera la Reserva de Prima No Devengada de Año 1 y carga Ajuste de siniestralidad, la corrección del propio Costo de Siniestros A1 de Día 2 contra el costo real del Año 1) y la proyección del Año 3 (`p3`, 14 líneas — libera la de Año 2, sin línea de Ajuste de siniestralidad), más el Balance completo de Año 1, 2 y 3 (`bal1`/`bal2`/`bal3`, 11 líneas cada uno). Las reservas técnicas de Año 1 y Año 2 — nunca un reporte aparte del P&G — viven únicamente ahí, como la línea `reservasTec` de cada balance: el saldo de la reserva nunca aparece en ningún P&G, ni siquiera como una ganancia/pérdida.

**Cada línea que es una fórmula pura de otras líneas ya reportadas se califica distinto: contra lo que el equipo mismo reportó en esas otras líneas, no contra la cifra verdadera del motor.** Así, un solo error (una Prima Emitida o un Costo de siniestros equivocados) no se castiga una segunda, tercera y cuarta vez en cada línea que algebraicamente depende de él — Resultado Técnico, Resultado Industrial, Utilidad Antes de Impuestos, Impuesto, Utilidad Neta, y del lado del Balance, Activos/Pasivo/Pasivo+Patrimonio. Esas líneas se marcan **(fórmula)** en las tablas de abajo. Solo los hechos/estimaciones genuinamente primarios (Prima Emitida, Costo de Siniestros, Resultado de Inversiones, Reservas Técnicas, Patrimonio, y — desde que dejaron de ser un porcentaje fijo/un residual, ver §4.3 — Caja, Inversiones y Necesidades de patrimonio o deuda) se califican contra la cifra verdadera de `finBench()`. El mecanismo (`FormulaSpec`/`scoreFormulaConcepto()` en `concepts.ts`) recalcula el valor esperado de la línea-fórmula a partir de los **propios** valores que el equipo ya reportó para las líneas que la componen (incluyendo, en un puñado de casos, una línea reportada un día antes — la Reserva de Prima No Devengada liberada de un año siempre referencia la Prima Emitida de ese año anterior) y compara la línea contra ese número recalculado, no contra la verdad del motor — si falta alguno de esos insumos propios, la línea queda sin calificar (no en 0), igual que cualquier campo que el equipo dejó en blanco. Ajuste de siniestralidad es la única excepción: su fórmula usa el Costo de Siniestros A1 **verdadero**, no lo que el equipo reportó, para medir qué tan bien estimó su propia siniestralidad del Año 1 (ver §4.2).

#### 4.1 · P&G del Año 1 (`p1`)

Construido por `pyg(primaEmitida, rpndLiberada, costo, rinv, reservas)`, con estos insumos. Año 1 no tiene año anterior del que liberar RPND, así que esa línea no aparece aquí (sí en Año 2, ver §4.2). Tampoco tiene "Ajuste de siniestralidad" — esa línea corrige, un día después, el propio Costo de Siniestros A1 que se reporta aquí (ver §4.2).

| Línea | De dónde sale |
|---|---|
| `primaEmitida` | `year1.totalPremium` — la prima real que el equipo efectivamente cobró en el mercado del Año 1 (§2), no la que tarificó: es la suma de las primas de las pólizas que realmente ganó, después del racionamiento por capital/solvencia (§2.1). |
| `rpndConstituida` (fórmula) | `20% × primaEmitida` (`FZ.rpndPct`) — la Reserva de Prima No Devengada que se constituye sobre la prima de este mismo año. |
| `primaDevengada` (fórmula) | `primaEmitida − rpndConstituida` — para Año 1 esto equivale a un 80% plano de la prima emitida, precisamente porque no hay RPND de un año anterior que liberar (ver Año 2, donde deja de ser un 80% plano). |
| `costo` | `year1.claimsAmount` — la severidad real incurrida de las pólizas que ese equipo ganó y tuvieron siniestro, tomada directamente del universo generado, en base **fecha de accidente**: es el costo total de los siniestros ocurridos en el Año 1, sin importar cuándo se avisen. |
| `gadq` (fórmula) | `4% × primaEmitida` (`FZ.gAdq`). |
| `gcom` (fórmula) | `15% × primaEmitida` (`FZ.gCom`). |
| `rt` (Resultado Técnico, fórmula) | `primaDevengada − costo − gadq − gcom` — deliberadamente sin el gasto administrativo, que tiene su propia línea (ver `ri`). |
| `gadm` (fórmula) | `6% × primaEmitida` (`FZ.gAdmin`). |
| `ri` (Resultado Industrial, fórmula) | `rt − gadm` — dónde realmente aterriza el gasto administrativo, separado del resultado técnico puro de suscripción. |
| `rinv` (resultado de inversiones) | El ingreso de inversión que el **ALM real** del Año 1 (§5.3) devengó en sus 12 meses, sobre el calendario de portafolio que el equipo sometió en Día 2 — `AlmRealYearResult.income`, no una fórmula. |
| `uai` (fórmula) | `ri + rinv`. |
| `imp` (fórmula) | `30% × max(0, uai)` (`FZ.tax` — nunca un impuesto negativo). |
| `uneta` (fórmula) | `uai − imp`. |

El saldo de reserva del Año 1 se explica en detalle en §4.3, junto con el resto de la Reserva Técnica.

#### 4.2 · P&G del Año 2 (`p2`) y proyección del Año 3 (`p3`)

Con desarrollo Año1→Año2 ya calculado (Día 3+, `computeDevelopment()` — ver §3):

| Línea | De dónde sale |
|---|---|
| `primaEmitida` | `year2.totalPremium` — prima real cobrada en el mercado del Año 2 (con retención de clientes, §2). |
| `rpndLiberada` (fórmula, cruza a Día 2) | `20% × primaEmitida del Año 1` — se libera el 100% de lo que Año 1 constituyó, ni una fracción distinta. |
| `rpndConstituida` (fórmula) | `20% × primaEmitida` de este mismo Año 2. |
| `primaDevengada` (fórmula) | `primaEmitida − rpndConstituida + rpndLiberada` — un roll-forward genuino, **no** un 80% plano de la prima emitida del Año 2: si la prima creció o bajó frente al Año 1, lo liberado (20% de la prima *vieja*) y lo constituido (20% de la prima *nueva*) no se cancelan exactamente. Solo coinciden con un 80% plano cuando la prima emitida no cambió de un año a otro. |
| `costo` | `development.ultY2` — el costo de los siniestros **propios del Año 2** únicamente, en base fecha de accidente, igual que Año 1. Nunca incluye el desarrollo de Año 1 (esa es su propia línea, `Ajuste de siniestralidad`, abajo): los siniestros del Año 1 avisados tarde ya están en el `costo` del Año 1 desde el principio (`year1.claimsAmount` ya es el último verdadero, avisado + IBNR — ver §3), así que sumarlos otra vez aquí los contaría dos veces. |
| `p2_ajusteSiniestralidad` (Ajuste de siniestralidad A1) | La diferencia entre la siniestralidad real del Año 1 (`year1.claimsAmount`) y lo que el equipo reportó como Costo de Siniestros A1 en Día 2 (`p1_costo`) — positivo si el equipo la subestimó, negativo si la sobreestimó. |
| `gadq` (fórmula) | `4% × primaEmitida` del Año 2. |
| `gcom` (fórmula) | `15% × primaEmitida` del Año 2. |
| `rt` (fórmula) | `primaDevengada − costo − p2_ajusteSiniestralidad − gadq − gcom`. |
| `gadm` (fórmula) | `6% × primaEmitida` del Año 2. |
| `ri` (fórmula) | `rt − gadm`. |
| `rinv` | El ingreso de inversión que el **ALM real** del Año 2 devengó en sus 12 meses — esta corrida no arranca de cero: continúa exactamente donde terminó el Año 1 real (mismas posiciones abiertas, mismo capital comprometido acumulado), financiada por el desarrollo del Año 1 que emerge en el Año 2 más los siniestros propios del Año 2 en su propio primer año (ver §5.3). |
| `uai` (fórmula) | `ri + rinv`. |
| `imp` (fórmula) | `30% × max(0, uai)`. |
| `uneta` (fórmula) | `uai − imp`. |

El saldo de reserva del Año 2 se explica en §4.3 junto al resto de la Reserva Técnica.

El **Año 3 no tiene mercado propio ni año de accidente propio** — no hay un tercer mercado que simular, y sus siniestros no existen todavía. Sí tiene, en cambio, un tercer año de ALM: la misma corrida real continúa 12 meses más sobre las posiciones que el equipo trae del cierre de Año 2, fondeada con la prima proyectada y pagando el calendario de siniestros proyectado (ver `rinv` abajo y §4.3). Cuando `development` trae los campos de cola de Año 3 (ver §3) y además hay `insuredCount` de Año 1/Año 2 y la retención real de Año 2 (`year2Retention`, de `TeamSimResult.extra`), `p3` se construye igual que `p2` pero sin línea de Ajuste de siniestralidad (ver por qué, abajo):

| Línea | De dónde sale |
|---|---|
| `primaEmitida` | Pólizas retenidas + nuevas, no una tasa de crecimiento plana sobre el total: `retentionRate = year2Retention.retainedCount / year1.insuredCount` (la retención real Año1→Año2) aplicada hacia adelante sobre el libro de Año 2 (`retainedPolicies3 = retentionRate × year2.insuredCount`), más las mismas pólizas nuevas que entraron en Año 2 (`newPolicies3 = year2Retention.newCount`), a la prima promedio por póliza de Año 2 repreciada un año más por `CLAIMS_INFLATION_ANNUAL` (9%, la misma tasa que ya infla `costo` abajo) — `primaEmitida3 = (retainedPolicies3 + newPolicies3) × (primaEmitida2 / insuredCount2) × (1 + CLAIMS_INFLATION_ANNUAL)`. Como `costo` usa exactamente el mismo `insuredCount3` y la misma tasa para repreciar su propia severidad (ver la fila de abajo), ambos factores se cancelan en `costo3 / primaEmitida3`: el loss ratio proyectado de Año 3 sale idéntico al de Año 2, sin importar la retención — no es un resultado independiente de la proyección, es una consecuencia matemática directa de repreciar ambas líneas con la misma tasa. |
| `rpndLiberada` (fórmula) | `20% × primaEmitida del Año 2`. |
| `rpndConstituida` (fórmula) | `20% × primaEmitida` de este mismo Año 3 (proyectada). |
| `primaDevengada` (fórmula) | `primaEmitida − rpndConstituida + rpndLiberada` — mismo roll-forward que Año 2. |
| `costo` | Únicamente el siniestro **propio de Año 3, proyectado**: frecuencia igual a la observada en Año 2 (`development.claimCountY2 / year2.insuredCount`) por severidad de Año 2 inflacionada un año más por `CLAIMS_INFLATION_ANNUAL` (9%, el mismo número que ya infla los siniestros de Colombia de Año1→Año2; ver §1.1 para por qué esto no es una segunda tasa distinta). Nunca incluye `devTailY1InY3`/`devTailY2InY3` (las colas reales de pago de Año 1/Año 2 que caen en el calendario de Año 3): ese dinero ya se reconoció como costo incurrido en el P&G de su propio año de accidente — sumarlo aquí también sería contarlo dos veces. Esas colas son puramente un movimiento de reserva (ver `reservas` abajo), sin ningún efecto en el P&G. |
| `gadq` / `gcom` / `rt` / `gadm` / `ri` (fórmula) | Mismas fórmulas que Año 1/Año 2, sobre la `primaDevengada`/`costo` de arriba — **sin** línea de Ajuste de siniestralidad: no hay un día posterior a Día 3 donde corregir un eventual error en la propia estimación de Costo de Siniestros A2. |
| `rinv` | El devengo de la continuación del ALM real durante Año 3 (`almSimRealYear(3, ...)`, arrancando desde el `finalState` de Año 2): mismas posiciones abiertas, mismo capital comprometido acumulado, mismo calendario de Año 2 releído desde su propio mes 0. Lo proyectado es lo que entra y sale, no el portafolio: se fondea con `prima3 / 12` al mes y paga las colas reales de Año 1 y Año 2 que caen en el calendario de Año 3 (`L[12..23]` de cada una) más la parte de `costo3` que se liquida dentro de su propio año, repartida con el perfil mensual del kernel (`ACCIDENT_YEAR_PAYMENT_SHARE` — nada los primeros meses, creciendo después) y escalada a la velocidad de pago que el equipo mostró en Año 2; ver `projectYear3.ts` y §4.3. Esas colas salen de caja aunque ya no sean costo del P&G: se reconocieron como incurridas en su propio año de accidente. **Fallback** cuando no hay ALM real de Año 2 que continuar: `reservas3 × effectiveYield2`, la estimación cerrada que esto era antes — subestima, porque un portafolio real también carga Capital Social y el float de primas acumulado, ambos mucho mayores que la reserva técnica. |
| `uai` / `imp` / `uneta` (fórmula) | Mismas fórmulas que Año 1/Año 2. |

El saldo de reserva del Año 3 (proyectado) se explica en §4.3 junto al resto de la Reserva Técnica.

Balance de Año 3: mismas fórmulas de cxc/cxp/RPND que Año 1/2 (§4.3), y `caja`/`inversiones`/`capitalComprometido` salen de la corrida de ALM de Año 3, igual que los de Año 1/2 salen de las suyas — la caja mínima real al cierre de diciembre, el valor en libros del portafolio a esa fecha, y lo que ese año efectivamente tuvo que comprometer. La hoja cierra sola (`Activos = Pasivo + Patrimonio`, exacto — hay test), sin necesidad de despejar `inversiones` como residuo.

Ese residuo sí existe todavía como último recurso (`solveInversiones`), para el caso en que no haya ninguna corrida de ALM detrás del año. Vale la pena recordar las dos aproximaciones que se probaron y se descartaron antes de tener el ALM de Año 3, ambas contra un cohorte real, por si alguien intenta volver a ellas: (1) extrapolar el delta bruto Año1→Año2 de `portfolioBookValue` se pasa por mucho, porque ese delta está dominado por un año entero de prima bruta entrando, uno o dos órdenes de magnitud mayor que la utilidad neta retenida del año; (2) arrastrar las inversiones de Año 2 por el crecimiento de patrimonio de Año 3 ignora el run-off de reservas — a un equipo cuya reserva técnica se drena entre Año 2 y Año 3 esa plata le sale del portafolio sin que el patrimonio se mueva (el gasto ya se reconoció en el año de accidente; pagarlo es Dr reserva / Cr caja), lo que producía brechas de más del 100% de Pasivo+Patrimonio en carteras que se encogían.

La proyección de `primaEmitida`/`costo`/`reservas` vive en `src/domain/finance/projectYear3.ts`, una función pura que corren **los dos** lados: `finBench()` para armar el P&G, y `finBenchHelper.ts` para fondear y pagar el ALM de Año 3 antes de llamar a `finBench()`. Es una sola definición de qué es el Año 3, no dos que puedan desalinearse.

**Fallback** (cuando falta cualquiera de los insumos de arriba — `development` sin los campos de Año 3, o sin `insuredCount`/`year2Retention`): `p3` cae de vuelta a una proyección plana — `primaEmitida3 = primaEmitida2 × 1.06`, `costo3 = costo2 × 1.06`, `reservas3 = reservas2 × 1.06`, `rinv3 = reservas3 × portYield`, `rpndLiberada3 = rpndConstituida2` (`FZ.growth3 = 6%`).

#### 4.3 · Balance (`bal1`/`bal2`/`bal3`)

Construido por `balance()`, el mismo para los tres años, tomando el P&G de ese año como insumo:

| Línea | De dónde sale |
|---|---|
| `caja` | Año 1/2: el `cajaFinal` real de diciembre del ALM real de ese año (`AlmRealYearResult.cajaFinalAnio`, ver §5.3) — la Caja Mínima que ese ALM realmente sostuvo al cierre, no un porcentaje de la prima. Año 3 igual, desde su propia continuación del ALM (§4.2); solo cae de vuelta a `15% × primaEmitida` (`FZ.cajaPct`) cuando no hay ninguna corrida detrás. Un hecho/estimación primario, no una fórmula de otras líneas del Balance — no se deriva de ninguna otra línea ya reportada, así que el equipo lo estima con su propio criterio, igual que `reservasTec`. Desde Día 3, el equipo sí ve su propio ALM real de Año 1 (`AlmRealYearTiles`/`AlmLadderTable`, tab "Respuestas Día 2"), incluyendo el mismo `cajaFinalAnio` que este concepto califica — deliberadamente, ver la nota de `AlmRealYearTiles` en `AlmLadderTable.tsx`. |
| `cxp` (fórmula) | `10% × primaEmitida` de ese año (`FZ.cxpPct`) — porcentaje fijo, no simulado. Para Año 1, `primaEmitida` es la que se reportó un día antes, en Día 2 (§4.1) — la única otra fórmula (junto con `rpndLiberada` de Año 2) que cruza de un día a otro. |
| `cxc` (Cuentas por cobrar, fórmula) | `(30 × primaEmitida) / 365` (`FZ.diasRotacionCxc = 30`) — la fórmula estándar de días de cartera (DSO, days sales outstanding): 30 son los días que la aseguradora tarda, en promedio, en convertir esa prima emitida en efectivo. Reemplaza el antiguo 7% plano (`FZ.cxcPct`); `GuiaPasanteDia3` comunica el supuesto de 30 días de rotación de cartera para que cada equipo derive esta fórmula por su cuenta. |
| `activos` (fórmula) | `caja + inversiones + cxc`. |
| `rpnd` (Reserva de Prima No Devengada, fórmula) | El mismo número que `rpndConstituida` del P&G de ese año (§4.1/4.2) — un pasivo aparte de las reservas técnicas, la parte de la prima que todavía no se ha ganado. |
| `reservasTec` (Reserva Técnica) | La plata apartada para pagar siniestros que todavía no se han terminado de pagar — ver el detalle año por año justo debajo de esta tabla. Un hecho/estimación primario, no una fórmula de otras líneas del Balance. |
| `necesidadesPatrimonioODeuda` | Lo que queda del `capitalComprometido` después de que el patrimonio absorbió todo lo que podía sin volverse negativo: el capital comprometido consume patrimonio hasta dejarlo en cero, y solo el exceso se reconoce como pasivo. Nunca las dos cosas a la vez (ver más abajo). Es una línea de **Pasivo**, no de Activos. Distinta de cero solo una vez que un equipo agotó por completo su portafolio real (Capital Social incluido, ver §5.3) y aun así necesitó más: por construcción, cualquier `capitalComprometido` a esas alturas ya es financiación genuinamente externa (capital nuevo o deuda), nunca un exceso sobre algún remanente de Capital Social — no hay tope que calcular. Cero para la inmensa mayoría de los equipos (ver el detalle completo debajo de esta tabla). |
| `impuestoPorPagar` (fórmula) | El impuesto **acumulado** hasta ese año — `imp` de Año 1 para `bal1`, `imp` de Año 1 **+** `imp` de Año 2 para `bal2` (no solo el de ese año) — ya reconocido contra `patrimonio` (vía `retenido`) pero que todavía no ha salido en efectivo, misma lógica que `rpnd`/`cxp`. El ALM real nunca modela el pago del impuesto como una salida de caja en NINGÚN año (ver `almSimRealYear()` en `alm.ts`), así que el impuesto de un año anterior sigue tan sin pagar al cierre de Año 2 como lo estaba al cierre de Año 1 — usar solo el impuesto de ese año dejaba a `bal2` corto por exactamente el impuesto de Año 1 no pagado. |
| `pasivo` (fórmula) | `reservasTec + rpnd + cxp + necesidadesPatrimonioODeuda + impuestoPorPagar` — la RPND, `necesidadesPatrimonioODeuda` e `impuestoPorPagar` son pasivos aparte, junto a las reservas técnicas y las cuentas por pagar. |
| `patrimonio` | `CAPITAL_SOCIAL` (fijo, §5.1) `+ utilidades retenidas` (la suma acumulada de `uneta` hasta ese año, incluida la `uneta` proyectada de Año 3 — ver §4.2), menos el `capital comprometido` acumulado al cierre de ese año **hasta dejarlo en cero, no más allá** — lo que exceda pasa a `necesidadesPatrimonioODeuda` (ver debajo de la tabla). El capital comprometido viene del ALM real de ese año (`AlmRealYearResult.capitalComprometidoAcumulado`), y los tres años tienen el suyo. Un hecho/estimación primario — depende del ALM, no de otras líneas del Balance. |
| `pasivoPatrim` (fórmula) | `pasivo + patrimonio` — debe cuadrar exactamente con `activos` (la identidad contable básica); es la razón por la que existe como concepto reportable aparte, no solo de lectura. |
| `inversiones` | Año 1/2: el `portfolioBookValue` bruto real del ALM de ese año directamente (`AlmRealYearResult.portfolioBookValue`) — ya incluye Capital Social, fondeado en el mismo calendario desde el arranque del Año 1 (§5.3), así que no se suma ningún término aparte encima. Un hecho económico real, nunca el residual que hacía cuadrar el balance en la versión anterior de este motor. Año 3 lee la misma línea de su propia continuación del ALM (§4.2), así que también es un hecho de la simulación y no un residual. El despeje (`solveInversiones`) queda solo como último recurso para el caso sin ninguna corrida de ALM detrás, donde no hay hecho independiente que pisar. |

**Cómo entra el `capitalComprometido` al Balance, y por qué una sola vez.** Consume `patrimonio` hasta dejarlo en cero; solo el exceso se reconoce como pasivo, en `necesidadesPatrimonioODeuda`. Nunca las dos cosas con el monto completo — que es lo que se hacía antes, y era un doble conteo: como patrimonio y esa línea están del **mismo** lado de la identidad, se cancelaban entre sí, mientras que del lado del activo `inversiones` ya no podía bajar más (el portafolio está en cero justo cuando esto ocurre). La hoja quedaba corta por exactamente ese monto: medido contra escenarios de bancarrota, brechas de 233B y 1.233B. Con el clamp, la identidad cierra exacto también ahí (hay tests).

En la práctica la parte absorbida siempre es cero: comprometer capital exige haber agotado LIQ **y** el portafolio entero, Capital Social incluido (§5.1), y un equipo que llegó ahí ya quemó su patrimonio — en todos los escenarios medidos el patrimonio previo iba de −485B a −2.120B cuando `capitalComprometido` era distinto de cero. El clamp existe porque esa es la regla contable, no porque se espere que se active.

Y va del lado del **Pasivo**, no de Activos: la plata que entró se gastó pagando siniestros ese mismo mes, así que se refleja en una reserva más baja, no en un activo. Sumarla también a Activos sería inventar un activo que no existe.

Para Año 1/2, `caja`/`inversiones` son hechos reales computados de forma independiente por el ALM real (nunca un residual forzado a cuadrar) — y aun así, `caja + inversiones + cxc` cuadra **exactamente** con `Pasivo + Patrimonio`, sin dejar ningún residuo. Esto costó dos correcciones, ambas ya aplicadas:

1. **`impuestoPorPagar` acumulado** (ver la tabla arriba) — antes de que `impuestoPorPagar` existiera, la brecha llegaba a ~20% de `Pasivo + Patrimonio` en algunos equipos de una cohorte real, porque el impuesto de renta nunca se modelaba como salida de caja real del ALM. Usar solo el impuesto de ese año (en vez del acumulado) todavía dejaba a `bal2` corto por el impuesto de Año 1 no pagado.
2. **El ALM real ahora modela el mismo rezago de 30 días/10% que `cxc`/`cxp` asumen**, en vez de invertir/pagar el 100% de la prima/gastos el mismo mes. `almSimRealYear()` (`alm.ts`) retiene exactamente `cxc` de la prima y exactamente `cxp` de los gastos en el primer mes de cada año (`cxcHoldback0`/`cxpHoldback0`) — con una prima mensual constante, retener un mes completo de cobro en el arranque del año es matemáticamente equivalente, al cierre del año, a desfasar todo el calendario de cobros un mes, así que basta con un solo ajuste en el mes 0, sin tocar la Caja Mínima ni la venta forzada de los demás 11 meses. Para Año 2, el ajuste se **netea contra el de Año 1** (pasado como `priorYearTotalPremium`): la cartera y el pago pendiente de Año 1 se terminan de cobrar/pagar dentro de Año 2, igual que la Reserva Técnica de Año 1 se termina de pagar con los siniestros reales de Año 2 — sin ese neteo, el `cxc`/`cxp` de Año 1 quedaría pegado en el Balance de Año 2 para siempre, ya que el Balance solo reporta el `cxc`/`cxp` de ese año, no un acumulado (mismo tratamiento de "vigente, no acumulado" que ya tiene `rpnd`).

`necesidadesPatrimonioODeuda` **no** existe para absorber esta brecha — solo cubre el caso específico de un portafolio real completamente agotado. Año 3 tampoco tiene residuo, y ahora por la misma razón que Año 1/2: su `caja`/`inversiones` salen de su propia corrida de ALM y la identidad cierra sola (hay test en `finBench.test.ts`).

**Cómo se calcula la Reserva Técnica (`reservasTec`) de cada año.** Es plata que la aseguradora ya reconoció como comprometida — siniestros que ya ocurrieron y hay que pagar, avisados o no (RSA/IBNR, ver §3) — pero que a la fecha de corte todavía no se ha pagado en efectivo. No es una línea del P&G: es un saldo, vive solo en el Balance.

- **Año 1**: siempre el total real por pagar de los siniestros del equipo (`liabilityYear1.reserva`), calculado por `computeLiabilitySchedules()` sobre el calendario de pago exacto de cada siniestro — avisado o no — nunca una estimación de mercado. Es un valor fijo: no cambia según cuándo se consulte (Día 1/2 o Día 3+, con o sin el desarrollo del Año 2 ya calculado), porque no depende de ningún factor agregado, solo de los siniestros reales de ese equipo.
- **Año 2**: lo que sigue pendiente de pago al cerrar el Año 2, sumando dos orígenes — la cola del Año 1 que todavía no se pagó, más lo que del Año 2 mismo sigue abierto. Si el desarrollo del Año 2 todavía no está calculado, se aproxima con un ratio simple: siniestros del Año 2 × (reserva del Año 1 ÷ siniestros del Año 1).
- **Año 3 (proyectado)**: la misma suma de colas pendientes de Año 1 y Año 2, más lo que de los siniestros propios de Año 3 todavía no se habría pagado al cerrar ese año. Esa velocidad de pago es la que el propio equipo mostró en Año 2 (`development.paidY2inY2 ÷ ultY2`) — el mismo criterio que la frecuencia y la severidad, que también salen del Año 2 observado. Sin ese dato, cae al ritmo genérico del kernel (`PAID_WITHIN_ACCIDENT_YEAR`, ~17%). **Ojo con `DEV_FRAC[0]`**: ese 55% es lo que se paga en los primeros 12 meses *desde el primer pago*, que llega 3 meses después del aviso — no es lo que se paga dentro del año de accidente. Usarlo como si lo fuera (que es lo que esta línea hacía) triplicaba los pagos del año y dejaba la reserva de Año 3 en 45% del último, contra el ~83% que la convolución real deja en Año 1 y Año 2. Sin los insumos necesarios para esta proyección, la reserva simplemente crece un 6% plano sobre la del Año 2, igual que el resto del P&G proyectado (§4.2).

#### 4.4 · Solvencia (Día 4)

| Línea | De dónde sale |
|---|---|
| `sol_sigmaLR` (σ de la siniestralidad) | Desviación estándar **muestral** (÷(n−1)=÷2, no ÷3) de `costo/primaEmitida` de Año 1, Año 2 y Año 3 (proyectado) — reemplaza el antiguo 14.76% fijo (`FZ.primeVol`) como el factor de volatilidad de `solRPrimas`, así que el riesgo de prima de cada equipo refleja su propia volatilidad de siniestralidad realizada, no un supuesto de industria plano igual para los 12 equipos. Se marca **(fórmula)**: se recalcula desde las propias líneas ya reportadas por el equipo — Costo/Prima Emitida A1 (Día 2), Costo/Prima Emitida A2 y A3 (Día 3) — **con el loss ratio de Año 1 corregido por el propio Ajuste de siniestralidad A1 que el equipo reportó en Día 3** (la corrección de su propia siniestralidad real de Año 1, ver §4.2), no contra la cifra verdadera del motor. `capacity.ts` (el cupo de mercado de Año 1/Año 2, ver §2.1) sigue usando el 14.76% fijo — corre durante la simulación de mercado, antes de que existan los 3 años de siniestralidad de los que sacar esta desviación estándar. El loss ratio de Año 3 (proyectado por el motor) siempre iguala exactamente al de Año 2 (ver §4.2 — `primaEmitida3`/`costo3` se reprecian por la misma tasa y el mismo conteo de pólizas, así que se cancelan en el cociente); la muestra de 3 puntos que alimenta esta desviación estándar, entonces, solo tiene dos valores genuinamente independientes (Año 1 corregido y Año 2/Año 3, iguales). |
| `solRPrimas` | `primaEmitida del año vigente × sol_sigmaLR` — deliberadamente sobre Prima **Emitida**, no Devengada: el riesgo de prima es sobre el volumen de negocio suscrito, no sobre cuánto de ese volumen ya se ganó. Igual que los gastos (§4.1), que también se calculan sobre Emitida. |
| `solRReservas` | `reservas del año vigente × 30%` (`FZ.resVol`). |
| `solRSusc` (riesgo de suscripción) | `√(rPrimas² + rReservas² + 2×0.75×rPrimas×rReservas)` — 0.75 es la correlación prima-reserva (`FZ.corrPR`). |
| `solRFin` (riesgo financiero) | `inversiones del balance vigente × 6.6% × volRatio` (`FZ.finRiskPct`) — `volRatio` es la volatilidad realizada del portafolio real de ese año dividida entre el promedio del menú (`avgVol/VOL_MENU_AVG`, ver §5.4). |
| `solROp` (riesgo operacional) | `primaEmitida del año vigente × 3%` (`FZ.opPct`) — misma base que `solRPrimas`. |
| `solRConc` (riesgo de concentración) | `inversiones del balance vigente × 3% × concRatio` (`FZ.concRiskPct`) — `concRatio` es `portfolioConcentrationRatio()` del mismo calendario de Día 2 (0 = repartido entre los instrumentos con plazo propio, 1 = concentrado en uno solo; LIQ no cuenta, ver §5.2). Es independiente de `volRatio` — un equipo 100% en CDT90 (baja volatilidad) paga este cargo completo aunque `solRFin` apenas se mueva. |
| `solRAcciones` (riesgo de acciones) | `exposición en ACC al cierre de Año 2 × 39%` (`ACC_STRESS_PCT`) — exposición, distinto de `solRFin`/`solRConc`, viene de las posiciones reales que el ALM real (§5.3) todavía tiene abiertas en ACC en ese momento exacto, no de `inversiones` del balance ni de un ratio decisión-only. 39% es el cargo estándar de Solvencia II para acciones "tipo 1" (cotizadas) — sin precedente propio en este motor antes de este módulo. |
| `solRk` (capital requerido) | `√(ΣΣ CORR_MOD_SOLVENCIA[i][j] × R[i] × R[j])` sobre `R = [rSusc, rFin, rOp, rConc, rAcciones]` — la matriz de correlación (`CORR_MOD_SOLVENCIA`) hace que suscripción-operacional y financiero/concentración/acciones-operacional estén perfectamente correlacionados (1.0), suscripción-financiero, suscripción-concentración y suscripción-acciones parcialmente (0.75), financiero-acciones también 0.75 (ambos vienen del mismo calendario de Día 2 y la exposición ACC ya empuja `volRatio`), y financiero-concentración/concentración-acciones solo débilmente (0.5, riesgos relacionados pero con drivers distintos — ver §5.2). |
| `solFp` (fondos propios) | El `patrimonio` del balance vigente (§4.3) — ya neto de todo el capital comprometido acumulado hasta ese punto. |
| `solMargen` | `solFp / solRk`. |
| `div` (dividendos sugeridos) | `max(0, solFp − solRk × 1.5)` — 1.5 (`FZ.targetMargin`) es la barra de "sobra capital para repartir", más exigente que la de apenas-solvente (1.0, ver §2.1). |
| `eva` (EVA — Valor Económico Agregado) | `Utilidad Neta (año vigente) − 10%` (`FZ.costoCapital`) `× solFp` — la definición clásica de finanzas corporativas (capital invertido = fondos propios/patrimonio, no el requerimiento regulatorio `solRk`): la utilidad debe superar el costo de oportunidad del capital, no solo ser positiva. Se marca **(fórmula)**, igual que las líneas del §4.1/4.2/4.3: se recalcula desde la propia Utilidad Neta A2 que el equipo reportó en Día 3 y sus propios Fondos propios de Día 4, no contra el motor directamente (ver la nota sobre `FormulaSpec` al inicio de esta sección). |
| `riesgoTasa` (riesgo de tasa) | Peor de los dos movimientos de NAV (PV activo real − PV pasivo real, al cierre de Año 2) bajo un choque de ±20%/-15% a la curva **real** — ver §5.7 para la mecánica completa de las dos curvas. No forma parte de `solRk` — es una cifra de descalce, no un cargo de capital. |
| `riesgoInflacion` (riesgo de inflación) | Igual mecánica que `riesgoTasa`, pero el choque es a la curva de inflación implícita en vez de a la curva real — ver §5.7. Tampoco forma parte de `solRk`. |

**De dónde sale la fórmula de agregación (`solRSusc` y `solRk`).** Ambas comparten el mismo origen matemático: la varianza de la suma de dos variables correlacionadas, `Var(A+B) = σA² + σB² + 2·ρ·σA·σB`, el mismo cálculo que ya usa la varianza de portafolio de Día 1 (`markowitz.ts`). Es el método de agregación del estándar europeo de Solvencia II para combinar módulos de riesgo vía una matriz de correlación: con `ρ=1` (correlación perfecta) la fórmula colapsa a una suma lineal directa, con `ρ=0` (independencia) colapsa al teorema de Pitágoras (`√(A²+B²)`), y con un `ρ` intermedio el resultado queda entre ambos extremos — ese ahorro frente a la suma lineal es el beneficio de diversificación: dos riesgos que no siempre se materializan juntos, en la misma dirección, no exigen tanto capital combinado como si lo hicieran.

`solRk` generaliza esa misma fórmula a los cinco módulos (`R = [rSusc, rFin, rOp, rConc, rAcciones]`) vía la matriz `CORR_MOD_SOLVENCIA` (`src/domain/finance/constants.ts`, hasta antes de este módulo era `CORR_MOD_CONCENTRACION`, 4x4 sin acciones):

| ρ | rSusc | rFin | rOp | rConc | rAcciones |
|---|---|---|---|---|---|
| **rSusc** | 1 | 0.75 | 1 | 0.75 | 0.75 |
| **rFin** | 0.75 | 1 | 1 | 0.5 | 0.75 |
| **rOp** | 1 | 1 | 1 | 1 | 1 |
| **rConc** | 0.75 | 0.5 | 1 | 1 | 0.5 |
| **rAcciones** | 0.75 | 0.75 | 1 | 0.5 | 1 |

- Riesgo operacional (`rOp`) correlaciona 1.0 con los otros cuatro — el tratamiento conservador de "sumarlo directamente" que ya usaba `CORR_MOD` (3x3, sin concentración) para el riesgo operacional.
- Suscripción-financiero, suscripción-concentración y suscripción-acciones correlacionan 0.75 — los tres son riesgos del lado de inversión, igual de distantes del riesgo de suscripción.
- Financiero-acciones correlaciona 0.75, no 0.5 — a diferencia de concentración, la exposición en ACC ya empuja directamente el `volRatio` que determina `rFin` (ver la tabla de arriba), así que son drivers más cercanos entre sí que financiero-concentración.
- Financiero-concentración y concentración-acciones correlacionan solo 0.5, el valor más bajo de la matriz — están relacionados pero responden a drivers distintos: un portafolio concentrado en un solo instrumento de baja volatilidad puntúa alto en concentración y bajo en `rFin`, y a la inversa un portafolio repartido pero compuesto de instrumentos individualmente volátiles puntúa bajo en concentración y alto en `rFin`; lo mismo aplica entre una posición ACC pequeña dentro de un calendario por lo demás repartido (baja concentración, `rAcciones` no nulo) y un calendario concentrado en un solo instrumento nominal (alta concentración, `rAcciones` nulo).

"Año/balance vigente" es el Año 2 si existe, si no el Año 1 (`p2 || p1`, `bal2 || bal1`) — la solvencia del Día 4 siempre mira el año más reciente disponible. La única excepción es `sol_sigmaLR`: su desviación estándar muestral toma los tres años (Año 1 corregido, Año 2, Año 3 proyectado) como los tres puntos de la muestra, mientras el resto de las líneas de esta tabla —reservas, inversiones, patrimonio, utilidad neta— se quedan en el año vigente. El Año 3 no tiene mercado ni ALM propio (§4.2): su patrimonio y sus reservas son una extrapolación, no un resultado simulado, así que el capital regulatorio se apoya solo en el año más reciente con datos reales; el loss ratio proyectado de Año 3 sí entra a `sol_sigmaLR` porque es un solo número de la propia proyección del equipo (`p3`), no un balance completo. `solRAcciones`/`riesgoTasa`/`riesgoInflacion` son la excepción contraria: siempre miran el cierre exacto de Año 2 (posiciones reales del ALM real en ese punto), nunca "Año 2 si existe, si no Año 1" — no hay una versión Año-1-únicamente de estos tres, ver §5.7.

Esta es la conexión directa entre la decisión de portafolio y la solvencia del Día 4: (a) un equipo que concentró su portafolio en instrumentos volátiles paga un capital requerido mayor (`rFin` más alto → RK más alto → margen y dividendo más bajos), (b) un equipo cuyo calendario quedó concentrado en un solo instrumento con plazo propio paga un cargo de concentración aparte (`rConc`), sin importar qué tan volátil fuera ese instrumento — es el mismo `concRatio` que ya descontó la nota de Rendimiento del Día 2 (§5.2), así que un equipo que entendió por qué bajó esa nota entonces está en mejor posición para reportar el RK correcto ahora, (c) un equipo que sostuvo ACC hasta el cierre de Año 2 paga `rAcciones` aparte de `rFin`/`rConc` — la misma posición contribuye a los tres cargos por razones distintas, (d) un equipo que tuvo que comprometer Capital Social para cubrir una brecha de caja ve sus fondos propios directamente reducidos por ese monto, y (e) ese mismo capital comprometido — vía `bal1.patrimonio` — es exactamente lo que determina cuánto podía crecer ese equipo en el mercado del Año 2, *antes* de que el Día 4 llegara a mostrárselo (ver §2.1) — todo esto sin importar qué tan bien le fue en rendimiento nominal. La volatilidad y concentración que determinan `rFin`/`rConc`, tanto para el Año 1 como para el Año 2, vienen del mismo calendario real de Día 2 (§5) — es el único calendario que la plataforma recoge (ver §5.0); el portafolio de mínima varianza de Día 1 solo alimenta la cuota de mercado del Año 1 (§2.1), nunca la solvencia.

### 5 · Portafolio de inversión y ALM (asset-liability matching)

#### 5.0 · Dos ejercicios de portafolio distintos, en días distintos

Hay **dos decisiones de portafolio separadas**, deliberadamente en días distintos:

- **Día 1 — portafolio de mínima varianza** (una foto, sin fecha de vencimiento ni reinversión): el equipo asigna pesos entre el menú de instrumentos buscando la **mínima varianza posible sujeta a un retorno mínimo objetivo**, dada una matriz de covarianza — un ejercicio de optimización con respuesta objetiva, no una decisión estratégica libre. Narrativa: es la presentación del equipo al regulador en el "momento 0", antes de escribir una sola póliza. Se detalla en §5.6.
- **Día 2 — el calendario de decisiones real** descrito en el resto de esta sección: la decisión de inversión real del equipo, informada por sus propias cifras de prima/siniestros ya conocidas, con reinversión y vencimientos genuinos a lo largo de 60 meses simulados.

**Por qué el calendario se somete en Día 2, no en Día 1**: para esa fecha el equipo ya conoce sus propias cifras reales de prima y siniestros del Año 1 (junto con las que reporta en el P&G, ver §4.1) — puede razonar su calendario de inversión con datos reales en la mano, no a ciegas sobre lo que todavía no sabe.

**El desface deliberado en la cuota de mercado**: la cuota de mercado por solvencia del Año 1 (§2.1) usa la volatilidad del portafolio de mínima varianza que el equipo sometió en Día 1, nunca el calendario real. La cuota del Año 2 usa el calendario real de Día 2, que ya existe para cuando cierra ese mercado. El portafolio de mínima varianza no vuelve a usarse para nada más allá de la cuota del Año 1: no alimenta ALM, P&G, Balance ni Solvencia.

#### 5.0bis · "Portafolio 2028" — la reestructuración opcional de Día 3

Además de las dos decisiones de arriba, un equipo puede **opcionalmente** someter un tercer calendario en Día 3 ("Portafolio 2028", misma estructura que el de Día 2 — mismo `PortfolioForm`, mismo `PortfolioDecisionV4`, almacenado como `PortfolioAllocation` con `day=3`): ahora que ya conoce su prima real del Año 2 (distinta de la que tuvo que asumir en Día 2, antes de que el Año 1 siquiera cerrara), puede reestructurar su estrategia de inversión para lo que resta del Año 2 en vez de seguir atado a una decisión tomada a ciegas un día antes.

Si lo somete, **reemplaza por completo** el calendario que gobierna el ALM real del Año 2 (`year2Decision` en `finBenchHelper.ts`) — no se combina ni se empalma con el de Día 2, es un calendario propio con su propio mes 0 (que corresponde al inicio calendario del Año 2, mes 12/13 del calendario absoluto — ver `almSimRealYear()`'s `scheduleMonth=i` en `alm.ts`, que ya reinicia la lectura del calendario en el mes 0 propio de cada año). Si no lo somete, el Año 2 sigue exactamente como antes: el mismo calendario de Día 2, sin cambios. `capitalSocialAllocation` de este envío es estructuralmente obligatorio (mismo formulario, misma validación) pero nunca se lee — Capital Social solo se fondea una vez, al mes 0 del Año 1 (§5.1) — por eso el formulario de Día 3 lo oculta.

Esto **no** crea una segunda nota de ALM: la nota que se califica (§5.2) sigue siendo exclusivamente la del calendario de Día 2 contra el ALM ficticio — el "Portafolio 2028" solo cambia qué calendario alimenta el ALM **real** (Año 2), y por lo tanto el Resultado de Inversiones/Balance/Solvencia reales que ya se califican como `reporte` en Día 3/4 (§4). Es también, deliberadamente, la única de las tres decisiones de portafolio visible en la misma pantalla de Día 3 donde el equipo ve su ALM real de Año 1 (§5.3) — un equipo que ya somete Balance Año 1 ese mismo día también puede ver, en la pestaña de al lado, cómo le fue realmente para decidir si vale la pena reestructurar el Año 2.

Cada equipo construye su portafolio real como un **calendario de checkpoints mensuales**, no una asignación estática ni un árbol de reinversión automática. Define, para el mes 0, cómo repartir el excedente disponible entre los instrumentos del menú — y puede agregar tantos checkpoints adicionales como quiera, cada uno diciendo "desde este mes en adelante, repártelo así en su lugar":

```ts
interface MonthlyAllocationEntry {
  month: number;          // 0-indexado; ascendente; el primer checkpoint siempre es el mes 0
  allocation: Allocation; // instrumentId -> peso, el mismo formato plano que Día 1
}

interface PortfolioDecisionV4 {
  schedule: MonthlyAllocationEntry[];
}
```

No hay un `onMaturity` por posición — ni "mantener en caja", ni "repetir", ni "reasignar" — porque ya no hace falta: **todo** lo que vence, sin importar el instrumento, se suma a la caja disponible de ese mes exactamente igual que la prima excedente, y el checkpoint vigente ese mes decide dónde va (ver `activeAllocation()`/`fundFromAllocation()` en `alm.ts`). Tampoco hay un `durationM` elegido por el equipo: cada instrumento tiene ahora un plazo fijo que pone el motor, no el equipo — los instrumentos con plazo propio (CDT90/TES1/TES3/TESUVR8) usan su `plazoM` contractual, LIQ vuelve a estar disponible cada mes (es el instrumento líquido), y ACC vuelve cada `ACC_ROLL_M` = 12 meses (`instrumentDurationM()` en `instruments.ts`). La interfaz de equipo lo recoge como una lista de checkpoints — el mes 0 es obligatorio y fijo, cada checkpoint adicional agrega su propio mes y su propia asignación de pesos — no un asistente de decisiones en cascada.

**TES3 y TESUVR8 pagan un cupón anual en efectivo, no solo un pago único al vencer** (`isCouponBond()` en `instruments.ts`) — a diferencia de CDT90/TES1 (que siguen siendo estrictamente cupón cero: el book compone mes a mes y todo se paga junto al vencer). Para una posición cupón, el book se queda **fijo** en su principal fondeado durante toda su vida — no compone mensualmente, tal como un bono real tampoco capitaliza su principal entre cupones. Cada 12 meses desde que se fondeó (`monthsHeld = t - fundedMonth`, con `fundedMonth = matM - plazoM`), paga `book × ins.yield` como caja, sin madurar ni reducir su propio book (sigue abierta, sigue devengando cupones futuros) — ese cupón entra a `vencimientosCaja` exactamente igual que un vencimiento real. El cupón del último año se junta con el principal en el mes de vencimiento real (una sola línea, como cualquier otro vencimiento). Esto le da a TES3/TESUVR8 liquidez intermedia genuina que antes no tenían — ya no son un bloqueo total hasta su propio vencimiento — a cambio de un book que ya no crece visiblemente entre cupones (todo el crecimiento sale como caja, no como valorización del libro).

**La posición se valora a precio sucio, no a precio limpio** (`Position.accrued` en `alm.ts`): aunque el book no compone y el efectivo del cupón solo llega una vez al año, el interés se reconoce como `rendimientoPortafolio` **cada mes**, a medida que se devenga — no de un solo golpe en la fecha de pago. Cada mes que la posición sigue abierta acumula `book × (ins.yield/12)` en `accrued` (un contador aparte del `book`, que sigue sin moverse); en la fecha de cupón, `accrued` se paga en efectivo y vuelve a cero. El valor reportado de la posición (lo que alimenta `avgPortfolioVol` y el saldo del portafolio) es `book + accrued`, no solo `book` — de lo contrario el rendimiento reconocido mes a mes se adelantaría a lo que la posición realmente vale, rompiendo la identidad `Saldo Final = Saldo Inicial + Rendimiento − Vencimientos − Inversión Neta` que la simulación mantiene exacta todos los meses. La alternativa (reconocer todo el cupón de un año de una sola vez, en su fecha de pago) subestimaba el rendimiento realizado de TES3/TESUVR8 frente a su yield nominal — hasta ~1.9 puntos porcentuales para TESUVR8 corriendo los 60 meses completos de la simulación — no por ningún defecto de la fórmula del bono, sino porque el ciclo de cupón de un bono de 8 años casi nunca cierra dentro de esa ventana: sin reconocimiento mensual, el interés genuinamente devengado durante los meses "entre cupones" simplemente no aparecía en el rendimiento reportado.

**El menú de instrumentos tiene un verdadero trade-off riesgo/retorno**, no solo distintos rendimientos — cada instrumento también tiene una **volatilidad anualizada** (`volAnual` en `src/domain/finance/instruments.ts`):

| Instrumento | Rendimiento | Volatilidad | Sharpe ratio* |
|---|---|---|---|
| LIQ (caja) | 5.0% | 1.0% | 0.00 (es la propia tasa libre de riesgo, por definición) |
| **CDT 90 días** | **9.5%** | **3.2%** | **1.41 (el mejor del menú)** |
| TES 1 año | 10.5% | 4.0% | 1.38 |
| TES 3 años | 11.5% | 7.0% | 0.93 |
| TES UVR 8 años | 12.0% | 6.0% | 1.17 |
| Acciones (ACC) | 14.0% | 20.0% | 0.45 |

*(Rendimiento − 5.0%) ÷ Volatilidad — un Sharpe ratio real, no una resta lineal (`RISK_FREE_RATE` en `src/domain/finance/instruments.ts`, igual al rendimiento nominal de LIQ). Individualmente, CDT90 gana: su spread sobre la tasa libre de riesgo es amplio y su volatilidad, la más baja del menú después de LIQ. TES UVR sigue calibrado con una volatilidad menor de lo que su plazo nominal de 8 años sugeriría (modelando que, al estar indexado a inflación, queda protegido de la inflación inesperada que sí penaliza a un bono nominal del mismo plazo — una simplificación explícita del modelo, no un dato de mercado real), pero eso ya no basta para ganarle a CDT90 en Sharpe individual. Que ningún instrumento "obviamente largo" gane por sí solo es intencional (ver §5.4): lo que sigue haciendo valioso a TES UVR es su baja correlación con CDT90/TES1 (§5.2), no su número en esta tabla. Las acciones quedan penalizadas pero no son el peor caso individual — su 14% nominal no compensa del todo su volatilidad, aunque su Sharpe sigue siendo positivo; LIQ, al ser la propia ancla de la fórmula, tiene Sharpe exactamente 0 por construcción, no por ser "el peor": no está compitiendo, está midiendo.

**Lo que un equipo ve para TES UVR no es el 12.0% nominal de esta tabla.** `displayYield()`/`displayYieldLabel()` (`src/domain/finance/instruments.ts`) son una capa puramente de presentación — nunca tocada por el motor de simulación ni por ningún cálculo (ALM, Markowitz, `scoreFinanciero()`, `finBench()` siguen usando `ins.yield = 12.0%` sin cambios) — que muestran el rendimiento de TES UVR **neto de inflación general** en vez de nominal, con la etiqueta explícita `"Inflación + 5.8%"` (no solo el número solo): `(1+12.0%)/(1+GENERAL_INFLATION_ANNUAL) − 1 ≈ 5.83%` (`src/domain/generation/constants.ts` — descomposición multiplicativa tipo Fisher a partir de `CLAIMS_INFLATION_ANNUAL` y `CHILE_REAL_SEVERITY_GROWTH_ANNUAL`, no una resta). Es una trampa deliberada, del mismo estilo que las de §1.1: TES UVR está indexado a inflación, así que un retorno real por encima de inflación es su verdadera ventaja — el prefijo "Inflación +" avisa que no está en la misma base que el resto del menú (todos nominales), pero no revela cuánto vale esa inflación; un equipo que no la estime por su cuenta no puede comparar TES UVR de igual a igual contra el resto, exactamente el mismo tipo de razonamiento que exige la brecha temporal de Chile.

El rendimiento (con o sin la etiqueta) **no aparece en absoluto** dentro de los formularios interactivos donde un equipo arma su portafolio (`PortfolioForm.tsx`/`MinVarianceForm.tsx` — solo muestran volatilidad por instrumento): el formulario de mínima varianza necesita calcular un retorno esperado agregado contra el `ins.yield` **nominal** real (para validar `TARGET_RETURN`), y mostrar ese agregado nominal junto a una etiqueta de "Inflación + X%" por instrumento en la misma pantalla dejaría despejar la inflación exacta comparando ambos números. Por eso ese formulario tampoco muestra el retorno esperado logrado como número — solo si cumple o no el mínimo (`"Cumple"/"No cumple con el rendimiento mínimo"`). El rendimiento por instrumento sigue siendo visible (con la etiqueta) en las tablas de referencia que no calculan nada agregado: `InstrumentsPanel`, ambas guías y el CSV descargable — consistentes entre sí, así que no hay dos números distintos para el mismo instrumento en ninguna vista.

**La nota que se califica se normaliza contra lo que la simulación realmente logra, no contra la fórmula nominal de arriba.** `RISK_ADJUSTED_YIELD_MIN`/`MAX` (`src/domain/finance/alm.ts`) son el Sharpe ratio (menos el descuento de concentración de §5.2) **realizado** — no el de esta tabla — de dos portafolios de referencia corridos completos a través de `almSim()`/`scoreFinanciero()` (ver `scratchpad/recalibrate-minmax.ts` para el script de búsqueda usado):
- **Piso ≈ −0.07: 100% ACC**, `durationM=ACC_ROLL_M`, "repeat" indefinido. Bajo la fórmula lineal anterior, LIQ siempre era el piso (nada le ganaba en seguridad). Con un Sharpe ratio real eso ya no es automático: LIQ **es** la tasa libre de riesgo, así que su propio Sharpe es ≈0 por construcción — pero también está exenta del descuento de concentración, así que nada la empuja por debajo de ese ≈0. Una apuesta 100% concentrada en ACC, en cambio, sí paga el descuento completo (μ=0.5) sobre un Sharpe crudo (~0.43) que no alcanza a absorberlo, y termina por debajo de LIQ — confirmado contra cada instrumento individual del menú (CDT90/TES1/TES3/TESUVR8 100% puros dan positivo).
- **Techo ≈ 1.405: una mezcla cercana a 20% LIQ / 33% CDT90 / 33% TES1 / 2% TES3 / 12% TESUVR8**, cada uno "repeat" indefinido — hallada por búsqueda en grilla sobre el simplex de 5 instrumentos (ACC excluido; una verificación puntual confirma que cualquier porción de ACC solo empeora esta referencia). Dos cosas rompen la intuición de la fórmula anterior: **(1)** CDT90/TES1 dominan la mezcla, no TES UVR — tienen el mejor Sharpe individual del menú (ver la tabla de arriba), así que el portafolio de máximo Sharpe también se apoya en ellos, solo diluido lo suficiente con TES UVR/TES3 para que su correlación imperfecta baje un poco más la volatilidad de la combinación. **(2)** LIQ entra con un peso real (~20%), algo que nunca pasa bajo Sharpe puro (mezclar el activo libre de riesgo dentro de un Sharpe de activos riesgosos solo lo diluye) — es el término de concentración el que lo trae de vuelta: LIQ es el único instrumento que baja la concentración gratis (queda fuera de la base del índice), así que una mezcla que se apoya en LIQ para diluir concentración mientras deja el resto en CDT90/TES1 le gana a un portafolio de Sharpe puro más concentrado que ignora LIQ por completo.

```mermaid
flowchart LR
    Venc["Cualquier posición que vence\n(sin importar el instrumento)"] --> Caja["Vencimientos en caja"]
    Prima["Prima excedente del mes"] --> Caja
    Caja -->|"checkpoint vigente ese mes"| Inv["Inversión Neta\n(nuevas posiciones)"]
```

`almSim()` simula mes a mes (60 meses: 12 de fondeo + 48 de corrida) dos vistas separadas del mismo portafolio:

- **Un estado de caja** con seis columnas — **Caja Inicial, Prima Cobrada, Pago Siniestros, Gastos, Vencimientos en caja, Inversión Neta, Caja Final** — contra una **Caja Mínima** obligatoria cada mes (15% de Prima+Siniestros, `FZ.cajaPct`).
- **Una evolución del valor del portafolio** — Saldo Inicial, Rendimiento devengado, Saldo Final — separada del estado de caja anterior, porque responde una pregunta distinta: no "¿hay caja suficiente?" sino "¿cuánto vale lo que llevamos invertido?". `Saldo Final = Saldo Inicial + Rendimiento − Vencimientos en caja − Inversión Neta` (un mes con superávit invertido tiene Inversión Neta negativa, así que ese término *suma* al saldo; un mes con retiro para cubrir una brecha la *resta*) — es una identidad exacta, verificada en `alm.test.ts`, y **el Saldo Final puede ser negativo** (ver §5.1).

**Cómo se determina cuánto sobra para invertir cada mes** (`stepMonth()` en `alm.ts`): `Caja Disponible = Caja Inicial + Prima Cobrada − Pago Siniestros − Gastos + Vencimientos en caja`. Esa Caja Disponible se compara contra la Caja Mínima del mes (15% de Prima+Siniestros): si la excede, el excedente completo (`Caja Disponible − Caja Mínima`) es lo que se invierte según el checkpoint vigente ese mes — nunca la Prima Cobrada cruda del mes. Si no la alcanza, no hay nada que invertir ese mes; en su lugar se activa la jerarquía de venta forzada/capital comprometido de abajo. **La Caja Final nunca es una variable libre — el motor la fija exactamente en la Caja Mínima todos los meses** (verificado como invariante en `alm.test.ts`); la Inversión Neta es la que se ajusta (negativa cuando se invierte el excedente, positiva cuando se retira para cubrir una brecha) para que esa igualdad siempre se cumpla.

#### 5.1 · Capital Social y cuándo el portafolio se vuelve negativo

Todos los equipos parten del **mismo Capital Social fijo: $81,000,000,000 COP** (`CAPITAL_SOCIAL` en `src/domain/finance/constants.ts`), deliberadamente independiente de la prima propia de cada equipo — si dependiera de la prima, la elección de tarifa de un equipo alteraría indirectamente cuánto colchón de capital tiene su ALM, y eso no tiene nada que ver con el riesgo que realmente está asumiendo. El monto se calibró contra el tamaño real de los siniestros, no se inventó: un equipo representativo con ~10% de cuota de mercado (100,000 de las 1,000,000 pólizas) tiene una siniestralidad incurrida esperada de ≈$313.9B COP (esta cifra ya incluye los siniestros catastróficos ocasionales que el universo inyecta — ver §6); de eso, ≈86.1% queda como reserva al cierre del Año 1 (medido con `computeLiabilitySchedules()` sobre el universo real, no estimado), dando una reserva de referencia de ≈$270.3B COP; aplicando el 30% de capital de solvencia (la misma razón que ya usaba el modelo) da ≈$81.1B, redondeado a $81B.

Si en algún mes ni LIQ ni el resto del portafolio (vendido antes de tiempo, ver la jerarquía de venta forzada abajo) alcanzan a cubrir la Caja Mínima, la Caja Mínima **se sigue cumpliendo igual** — el motor cubre lo que falte directamente con Capital Social. Esto es intencional: en la vida real, una aseguradora que se queda sin activos líquidos no simplemente "no paga" — sus accionistas inyectan capital o se activa una línea de crédito para cubrir el bache, a costa de erosionar su patrimonio. Ese capital comprometido:

- **Nunca se "recupera" solo** — si el mes siguiente hay superávit, ese superávit se invierte de cero según el checkpoint vigente ese mes; el capital ya comprometido en meses anteriores queda como una marca permanente, no una sobregiro temporal que se paga sola.
- **Deja el Saldo Final del portafolio en negativo** — una vez que LIQ y el resto del portafolio llegan a 0, cualquier capital adicional comprometido resta directamente del Saldo Final reportado (ver la identidad de §5 arriba), y ese número puede quedar negativo indefinidamente.
- **Reduce el patrimonio real** — ver §5.3 y §4: el capital comprometido a fin del Año 1 y a fin del Año 2 (dos cortes del ALM corrido con la prima real de cada equipo, no el ficticio — ver §5.3) se resta directamente del patrimonio en `finBench()`, lo que baja el margen de solvencia del Día 4 automáticamente, sin lógica adicional.

Todo lo anterior describe el mecanismo genérico de venta forzada/capital comprometido, compartido por el ALM ficticio (este) y el real — pero **solo el ALM real invierte Capital Social desde el arranque**, como una posición más del calendario (ver §5.3); en el ficticio sigue siendo puramente el recurso de último caso descrito aquí, nunca una posición fondeada de antemano.

#### 5.2 · Las cuatro notas del ALM (`scoreFinanciero()`)

- **Cumplimiento de Caja Mínima (35%)** — la Caja Mínima siempre se cumple (ver §5.1), así que esta nota mide **cuánto Capital Social hubo que comprometer** para lograrlo: el peor mes individual (riesgo de cola) y lo acumulado en los 60 meses (erosión crónica), cada uno como fracción del Capital Social fijo, combinados 50/50. Un equipo que nunca tocó su capital obtiene 100 aquí, sin importar cómo lo logró.
- **Rendimiento ajustado por riesgo (35%)** — un Sharpe ratio real, no un descuento lineal: `(rendimiento efectivo − RISK_FREE_RATE) ÷ avgPortfolioVol − 0.5 × concentración del portafolio` (`RISK_FREE_RATE` en `src/domain/finance/instruments.ts`, igual al 5.0% nominal de LIQ; `CONCENTRATION_PENALTY_MU` en `src/domain/finance/constants.ts`). El denominador **no** es un promedio de la volatilidad de cada instrumento por separado — es la volatilidad real de la combinación, `√(wᵀΣw)` contra la misma `COVARIANCE_MATRIX` de 6x6 que arma `markowitz.ts` para el ejercicio de mínima varianza de Día 1 (§5.2 de la guía del pasante), recalculada cada mes contra lo que el equipo *realmente* mantuvo invertido ese mes (agrupando el book de cada instrumento vía `portfolioVariance()`), y luego promediada a lo largo del horizonte ponderando por cuánto book hubo cada mes (una posición que pasó la mayoría del horizonte en ACC pesa más en este promedio que una que solo estuvo ahí un mes antes de que el equipo cambiara de estrategia) — así, dos instrumentos con la misma volatilidad individual pero baja correlación entre sí genuinamente bajan este término, el mismo beneficio de diversificación que ya enseña la matriz de covarianza en Día 1, no solo "menos plata en cada uno". `AlmSimResult`/`FinancialScore` siguen exponiendo el promedio simple sin correlaciones como `avgVol` (diagnóstico, ya no alimenta la nota) junto al `avgPortfolioVol` que sí califica, para que se pueda comparar los dos directamente. El término de concentración es aditivo, no multiplicativo — un Sharpe ratio puede salir negativo (un portafolio que rindió menos que la tasa libre de riesgo tras ventas forzadas/capital comprometido), y un descuento multiplicativo haría que concentrarse "ayudara" a un número ya negativo en vez de empeorarlo — e independiente de la volatilidad: `portfolioConcentrationRatio()` mide, sobre la asignación del checkpoint inicial (mes 0) del calendario, qué tan repartido queda el peso entre los instrumentos con plazo propio (CDT90/TES1/TES3/TESUVR8/ACC) vía un índice Herfindahl normalizado a [0,1] — 0 si está repartido en partes iguales entre los 5, 1 si está 100% en uno solo, sin mirar la matriz de covarianza en absoluto (es una penalización aparte por depender de pocos nombres, no una segunda forma de medir el mismo riesgo). **LIQ queda fuera de este cálculo por completo**, no solo puntuado bajo: es un fondo de liquidez pooled, no una exposición individual a un solo emisor/mercado, así que un equipo con la mitad en LIQ y la mitad en ACC queda exactamente tan concentrado como uno 100% en ACC — la mitad en LIQ no "diversifica" ese riesgo, solo tiene menos de él (algo que avgPortfolioVol ya descuenta por su cuenta). Individualmente, CDT90 tiene el mejor Sharpe del menú (ver la tabla de §5) — pero eso no vuelve inútil diversificar: concentrar todo en el instrumento individual con mejor Sharpe (CDT90 100%) da una nota peor que repartir ese mismo capital entre varios de los instrumentos con plazo propio — verificado en `alm.test.ts`: CDT90 100% pesa más en Sharpe crudo antes de aplicar el descuento de concentración, pero queda por debajo de una mezcla diversificada una vez se aplica.
- **Venta forzada de portafolio (20%)** — el castigo por verse obligado a vender antes de tiempo (antes de llegar a comprometer capital), y no es un castigo plano: pesa el monto vendido por la volatilidad *del instrumento vendido* (`ventaForzadaVolWeighted`, normalizado contra el peor caso posible — vender toda la Caja Mínima acumulada en ACC — para dar un score 0-100). Vender ACC bajo presión sale mucho más caro en la nota que vender CDT90 o TES por el mismo monto; vender LIQ no cuenta en absoluto, porque ese es exactamente su trabajo. Esta nota mide *disciplina de liquidez*, no el riesgo del portafolio en sí (eso ya lo mide el Rendimiento ajustado por riesgo de arriba) ni la insolvencia (eso lo mide Cumplimiento de Caja Mínima).
- **Liquidez (10%)** — cobertura de los pagos de los siguientes 6 meses con lo que sigue líquido en ese momento (LIQ, más cualquier tramo que venza dentro de esa ventana).

**Vender antes de tiempo también realiza menos precio, aparte de la nota anterior.** `forceLiquidatePortfolio()` cobra un descuento sobre el valor en libros de cada posición vendida bajo presión (`ventaForzadaHaircut()`): `VENTA_FORZADA_HAIRCUT_MAX × (volAnual / VOL_MAX)³ × (matM − t) / duración` (recortado a [0,1]). El término de volatilidad va al **cubo**, no lineal — vender algo a un mes de su propio vencimiento paga casi nada de descuento independientemente de su volatilidad; vender algo recién fondeado paga hasta el descuento completo (`VENTA_FORZADA_HAIRCUT_MAX = 10%`, alcanzado solo vendiendo ACC recién comprado — el único instrumento cuya razón volAnual/VOL_MAX es exactamente 1), pero un instrumento con menos de la volatilidad máxima paga un descuento desproporcionadamente menor que esa fracción, no proporcional a secas. Esto es deliberado, no cosmético: con un término lineal, un bono largo con cupón (TES3/TESUVR8) que se re-fondea y se vuelve a vender forzado mes a mes bajo un flujo de caja delgado paga casi el descuento completo en cada venta (siempre "recién fondeado", con casi todo su plazo por delante) — eso terminaba invirtiendo la calibración deliberada del menú (el volAnual de ACC calibrado para que su rendimiento nunca compense su riesgo, ver `instruments.ts`) en `alm.test.ts`'s comparación ACC-100%-vs-TESUVR8-100%. Cubicar el término de volatilidad no toca el descuento de ACC (su razón ya es 1, y 1³=1) pero reduce mucho más rápido el de cualquier instrumento menos volátil, restaurando el orden sin tocar el término de plazo. Como el precio es menor, cubrir un mismo faltante de caja consume más valor en libros del que se habría necesitado a precio pleno — esa diferencia (`lostValue`) es una pérdida real que `stepMonth()` resta directamente del rendimiento devengado ese mes, así que termina reflejada en el Rendimiento ajustado por riesgo (y, para el ALM real, en la línea de Resultado de Inversiones del P&G), no en la nota de Venta forzada — las dos notas quedan deliberadamente separadas: una mide la severidad de lo vendido (para la nota de arriba), la otra el costo económico real de haberlo vendido antes de tiempo (para Rendimiento).

**Cómo se acumula el rendimiento mes a mes en `stepMonth()`.** Cada mes, el motor procesa primero los vencimientos y la inversión del excedente de ese mismo mes, y solo después acumula rendimiento sobre las posiciones abiertas — así que cada posición devenga rendimiento exactamente por los meses que estuvo abierta, ni uno menos, sin importar si acaba de crearse ese mismo mes (por reinversión de un vencimiento o por invertir plata nueva). Esto importa más mientras más corto el plazo de la posición: para LIQ, que vence cada mes (`instrumentDurationM()` en `instruments.ts`), el rendimiento realizado de ese mes depende por completo de que se cuente ese único mes de tenencia. TES3/TESUVR8 son la excepción a esta acumulación mensual: no componen mes a mes en absoluto (su `book` se queda fijo en el principal fondeado) — todo su rendimiento se realiza en los meses de cupón/vencimiento, ver §5.0.

En conjunto, las cuatro notas forman una **jerarquía de consecuencias** ante una misma brecha de caja: primero se drena LIQ (gratis), luego se vende el resto del portafolio empezando por lo menos volátil (castiga Venta forzada, proporcional a qué tan volátil era lo vendido), y solo si eso tampoco alcanza se compromete Capital Social (castiga Cumplimiento de Caja Mínima). Ningún paso de esta cadena está oculto — todos son visibles mes a mes en las tablas de la interfaz.

Por separado, `almNAV()` valora el portafolio y la reserva a valor de mercado bajo escenarios de tasa (base/alza/baja) — un diagnóstico de sensibilidad a tasa, informativo (no alimenta la solvencia, que usa la volatilidad realizada y el capital comprometido en su lugar, ver §4). Usa la asignación inicial como foto del balance en la fecha de valoración, no el calendario completo de reinversión. Es el precedente directo del riesgo de tasa/inflación calificado del Día 4 (§5.7), que sí valora el portafolio real completo, en el cierre real de Año 2.

#### 5.3 · El ALM es ficticio — el ALM real es solo para el evaluador

Todo lo anterior corre sobre una **hipótesis deliberadamente irreal**: que la Prima Cobrada de cada mes es exactamente 1/12 de `reserva + pagos del Año 1` — es decir, que la prima cobrada siempre alcanza exactamente para fondear la reserva, ni más ni menos. En la realidad, la prima de un equipo es la que **el mercado le pagó** por su tarifa (Día 1/§2), y casi nunca coincide con su reserva. Este ALM "ficticio" no es un error del modelo — es **a propósito**, y sigue siendo el único que se califica (§5.2) y el único que ve el equipo.

El ALM real (`almSimRealYear()` en `alm.ts`) es un motor **genuinamente distinto** del ficticio, no el mismo motor con un número distinto. Las diferencias son deliberadas:

- **El ALM real solo corre 12 meses por año, nunca 60.** Su único propósito es alimentar el P&G/Balance real de *ese* año — no tiene sentido simular 48 meses de más cuando nada los va a usar. El ALM ficticio, en cambio, corre 60 meses completos por año (12 de fondeo + 48 de corrida) porque eso es lo que su propia nota (§5.2) necesita evaluar.
- **El Año 2 real es una continuación genuina del Año 1 real, no una corrida independiente desde cero.** El motor recibe el estado exacto con el que terminó el Año 1 (las mismas posiciones abiertas — que siguen devengando rendimiento y venciendo según su propio plazo — y el mismo capital comprometido acumulado, que nunca se repone solo) y sigue simulando 12 meses más a partir de ahí, con la prima real del Año 2 y el calendario del equipo — por defecto el mismo que sometió en Día 2, o el que haya sometido opcionalmente en Día 3 ("Portafolio 2028", ver §5.0bis) si decidió reestructurarlo. El ALM ficticio, en contraste, trata cada año como una hipótesis independiente ("qué habría pasado si este calendario hubiera corrido desde el mes 0"), y nunca ve el calendario opcional de Día 3 — solo el de Día 2 sigue calificando la nota de ALM (§5.2).
- **El Año 3 real existe y es la misma continuación, un año más allá.** Es el único año cuyos flujos son proyectados en vez de observados: no hay tercer mercado que cobre prima ni tercer año de accidente que observar, así que se fondea con la `prima3` proyectada y paga el calendario de siniestros proyectado (colas reales de Año 1/Año 2 que caen en ese calendario, más lo que el propio Año 3 liquida dentro de su año — ver `projectYear3.ts` y §4.2). El portafolio sobre el que corre, en cambio, es real: son exactamente las posiciones con que el equipo cierra el Año 2. Por eso el Resultado de inversiones del Año 3 y el activo de su Balance salen de la misma máquina que los del Año 1 y el Año 2, en vez de una aproximación cerrada sobre una base distinta.
- **El siniestro que financia cada año real es distinto al del ficticio.** El Año 1 real se financia contra los siniestros propios del Año 1 (`liabilityYear1.payY1`, los mismos 12 meses que usa el ficticio en su propia fase de fondeo). El Año 2 real se financia contra la **suma de dos cosas**: el desarrollo del Año 1 que emerge en el Año 2 (los primeros 12 meses de `liabilityYear1.L[]` — la misma reserva que el ficticio arrastra indefinidamente, aquí usada solo por 12 meses) *más* los siniestros propios del Año 2 en su propio primer año (una `LiabilitySchedule` nueva, calculada igual que la del Año 1 pero sobre los siniestros de `generateYear2Claims()`). El ALM ficticio, en cambio, usa siempre la reserva del Año 1 para todo su horizonte de 48 meses.
- **Solo el ALM real invierte Capital Social — el ficticio nunca lo toca.** Al arrancar el Año 1 real, `CAPITAL_SOCIAL` se fondea según el checkpoint del mes 0 del calendario del equipo (vía `fundFromAllocation()`, la misma función que fondea cada mes de excedente de prima) antes de correr el primer mes — desde ahí es una posición más, indistinguible de una fondeada con prima: devenga, vence según el plazo de su instrumento, y puede venderse forzosamente si hace falta. El ALM ficticio sigue funcionando exactamente como en §5.1/§5.2 (fondeo puramente nocional `reserva/12`, `CAPITAL_SOCIAL` nunca aparece en `almSim()`/`stepMonth()`/`fundFromAllocation()` cuando el ficticio los llama) — meterlo ahí contaminaría justo lo que ese ejercicio aísla a propósito: calce puro de flujos, independiente de cuánto capital real tiene el equipo.

Esto es **exclusivo del panel de admin** (`AlmPnlBreakdown`, dentro de `admin/day/[n]`), como cruce de referencia para el evaluador, no algo que el equipo pueda consultar. La razón es deliberada: el ejercicio es que el equipo **razone** cómo se vería su ALM con su propia prima, no que lea la respuesta de una pantalla — el ALM real automático existe para que el evaluador pueda verificar qué tan cerca estuvo el número que el equipo reportó, no para resolvérselo de antemano.

Comparando ambos runs (el evaluador sí puede hacerlo) queda claro qué depende de la prima y qué no:

- **La Reserva y el Rendimiento nominal del portafolio (`portYield`) nunca cambian** entre el ficticio y el real — ambos dependen solo del calendario de decisión del equipo, nunca de qué prima fondeó la simulación.
- **Lo que sí puede cambiar es el ingreso de inversión realmente devengado** y el capital comprometido — ambos dependen de cuándo *realmente* entra la caja, y eso sí depende de la prima real.

**La fórmula de referencia para el resultado de inversiones del P&G es directa, no una aproximación**: es el ingreso de inversión que el ALM real simuló mes a mes durante los 12 meses de ese año específico (`AlmRealYearResult.income`, la suma de la columna Rendimiento de la tabla "Valor del portafolio" en esa corrida de 12 meses) — **incluye el devengo de Capital Social**, ya que es una posición más de esa misma corrida (ver el bullet de arriba); un equipo con Capital Social invertido genera un `income`/Resultado de Inversiones sustancialmente mayor al que su sola prima real produciría. No es `reserva × portYield` (ignora el calce real de caja) ni una resta de saldos de portafolio a inicio/fin de año (se contaminaría con cuánta plata nueva entró o salió, que no es rendimiento). El capital comprometido en sí **no** entra en esta cuenta — ya se resta directamente del patrimonio en el Balance (§4); incluirlo también aquí sería castigar el mismo evento dos veces.

**Cuánto Capital Social ha evitado necesitar como financiamiento externo** se muestra siempre de forma explícita en `AlmPnlBreakdown` — `AlmRealYearResult.capitalSocialRestante = CAPITAL_SOCIAL − capitalComprometidoAcumulado`, acumulado desde el Año 1 para el corte del Año 2. Ya **no** significa "cuánto de Capital Social sigue sin invertir" (está invertido desde el arranque del Año 1, ver arriba) — significa cuánto de él el equipo ha evitado tener que reponer con financiamiento genuinamente externo, casi siempre el total. Es exactamente el mismo número (`capitalComprometidoAcumulado`) que `finBench()` resta del patrimonio en el Balance real de ese año — no un cálculo paralelo.

**El mismo ALM real también alimenta `caja`/`inversiones` del Balance (§4.3)**, vía dos campos más de `AlmRealYearResult`: `cajaFinalAnio` (el `cajaFinal` de la última fila de diciembre — un saldo puntual, no un flujo anual) y `portfolioBookValue` (el valor bruto del portafolio a fin de año, `realBookSum` sin descontar `capitalComprometidoAcumulado` — deliberadamente bruto, porque cualquier capital comprometido ya salió de vender posiciones, no se resta dos veces aquí). `portfolioBookValue` **ya incluye Capital Social** — `balance()` (§4.3) lo usa directamente como `inversiones`, sin sumar ningún término aparte de Capital Social no comprometido (eso se eliminó junto con este cambio, ver §4.3).

**Importante para no confundir qué ALM alimenta qué**: la nota de ALM del Día 2 (§5.2, lo que ve el equipo) se califica con el ALM **ficticio** (`almSim()`/`scoreFinanciero()`, 60 meses, independiente por año) contra el calendario de Día 2 exclusivamente — el "Portafolio 2028" opcional de Día 3 (§5.0bis) nunca la afecta. Pero `finBenchHelper.ts` — la plomería que alimenta a `finBench()` (§4) — corre el ALM **real** (`almSimRealYear()`, 12 meses, Año 2 continuando el Año 1) específicamente para eso: benchmarquear un entregable real (Resultado de Inversiones, Balance, Solvencia) contra el ALM ficticio sería comparar contra un escenario hipotético en el que el equipo nunca estuvo. Es también el ALM real, y no el ficticio, el que usa el "Portafolio 2028" cuando existe (§5.0bis). Son dos motores distintos, para dos propósitos distintos — ninguno alimenta al otro.

#### 5.4 · Qué es un portafolio óptimo, y por qué

No existe un solo instrumento "correcto" — un portafolio óptimo balancea las cuatro notas de §5.2 simultáneamente, y eso significa aceptar tensiones reales, no maximizar una sola cosa:

- **Necesita algo de LIQ**, no por su rendimiento (el más bajo del menú) sino porque es la única fuente de cobertura de caja sin castigo — sin nada de LIQ, cualquier brecha cae directo en venta forzada o, peor, en capital comprometido.
- **No debería concentrarse en un único instrumento, ni siquiera en el de mejor Sharpe individual (CDT90, ver la tabla de §5)** — el descuento de concentración de §5.2 castiga eso exactamente: repartir el capital entre varios de los instrumentos con plazo propio (CDT90/TES1/TES3/TESUVR8) da una nota de Rendimiento más alta que concentrarlo todo en el mejor de ellos, y además evita el cargo de concentración aparte de la solvencia del Día 4 (§4.4). Esto no es solo un castigo artificial por diversificar "porque sí": la baja correlación entre CDT90/TES1 y TES UVR/TES3 (§5.2) hace que una mezcla genuinamente diversificada pueda tener mejor Sharpe *incluso antes* del descuento de concentración — no solo después.
- **TES UVR sigue valiendo la pena incluirlo, aunque no sea el mejor individualmente** — un portafolio que ignora TES UVR y se queda solo en CDT90/TES1 deja sobre la mesa el beneficio de diversificación que su baja correlación con esos dos aporta a la combinación.
- **Debería evitar concentrarse en ACC** — su 14% nominal no compensa su 20% de volatilidad: pesa mal en Rendimiento ajustado por riesgo (por partida doble: volatilidad y, si es la única posición riesgosa, concentración), pesa peor si alguna vez hay que vender ACC bajo presión (Venta forzada), y encima sube el capital de solvencia requerido en el Día 4 (§4). ACC no es un error por sí solo — un peso pequeño y deliberado puede tener sentido — pero concentrarse ahí persiguiendo el rendimiento nominal es, con estos números, un error sistemático.
- **Debería revisar el calendario con cierta frecuencia, no fijarlo una vez y olvidarlo** — un checkpoint queda vigente indefinidamente hasta que el equipo defina uno nuevo (§5.0); dejar el mismo checkpoint corriendo los 60 meses sin revisarlo puede dejar una porción creciente del portafolio atrapada en instrumentos poco líquidos (TES3/TESUVR8 solo devuelven caja en su cupón anual o al vencer, ver más abajo) justo cuando los siniestros están en su punto más alto.

En resumen: el óptimo no es "todo seguro" (deja rentabilidad ajustada por riesgo sin aprovechar) ni "todo rendimiento" (castiga en tres de las cuatro notas y en solvencia) — es un balance deliberado, con suficiente LIQ para nunca depender de una venta forzada, un peso real en TES UVR, y un calendario que el equipo efectivamente revisa a lo largo del horizonte.

#### 5.5 · Errores comunes, y por qué son errores

- **"Todo en LIQ, para no arriesgar nada"** — cumple Caja Mínima y Venta forzada perfectamente, pero sacrifica casi toda la nota de Rendimiento ajustado por riesgo: LIQ **es** la tasa libre de riesgo de la fórmula, así que su propio Sharpe ratio es exactamente 0 — el piso, no un punto medio — y esa nota vale 35%, tanto como Cumplimiento de Caja Mínima.
- **"Todo en ACC, para maximizar el rendimiento"** — el error más costoso posible: aunque el Sharpe crudo de ACC es positivo (su 14% sí compensa parcialmente su 20% de volatilidad), es el más bajo del menú además de LIQ, y encima paga el descuento de concentración completo por estar 100% en un solo instrumento — castiga Rendimiento ajustado por riesgo por partida doble, expone a Venta forzada al peor precio posible si hay que vender ACC bajo presión, y sube el capital de solvencia requerido en el Día 4 por tres vías independientes (`rFin`, `rConc` y `rAcciones`, este último directamente proporcional a la exposición, ver §4.4) — cinco penalizaciones distintas por la misma decisión.
- **"Todo en CDT90, porque es el mejor del menú en Sharpe individual"** — un error más sutil, porque el instrumento en sí es una buena elección: el problema es concentrarse en él por completo. El descuento de concentración de §5.2 hace que repartir ese mismo capital entre varios de los instrumentos con plazo propio dé una nota de Rendimiento más alta que quedarse 100% en CDT90 — la baja correlación de TES1/TES UVR con CDT90 baja la volatilidad de la combinación más de lo que diluye el retorno — y el mismo número (`concRatio`) sube el capital de solvencia requerido en el Día 4 (`rConc`, independiente de `rFin`) sin importar que la volatilidad elegida sea baja.
- **"TES3/TES UVR8 son tan líquidos como cualquier otro bono porque igual algún día vencen"** — no mientras tanto: entre cupones (cada 12 meses) su plata no vuelve a estar disponible salvo venta forzada. Un equipo que cuenta con el cupón anual como si fuera caja disponible todo el año puede quedarse corto justo el mes en que más la necesita.
- **"Copiar el resultado de inversiones del ALM ficticio directo al P&G real, sin ajustarlo a la prima propia"** — ver §5.3: el equipo solo ve el ALM ficticio (asume prima = reserva), así que el número que reporte debe ser su propio razonamiento sobre cómo cambiaría ese resultado con su prima real — no un número que la interfaz le resuelva.

#### 5.6 · Mínima varianza (Día 1)

**Por qué no es un mínima-varianza sin restricción.** La volatilidad de LIQ (1%) sigue muy por debajo de la de cualquier otro instrumento del menú (el siguiente más bajo, CDT90, está en 3.2%) — con una diferencia así de grande, el portafolio de mínima varianza *sin restricción* (long-only, sin piso de retorno) termina casi enteramente en LIQ para casi cualquier estructura de correlaciones razonable, lo que volvería el ejercicio trivial (un equipo podría "resolverlo" escogiendo el instrumento más seguro a simple vista, sin usar la matriz de covarianza para nada). Por eso el problema real es un **Markowitz clásico con piso de retorno**: minimizar la varianza sujeto a `pesos ≥ 0`, `Σpesos = 1`, y `retorno esperado ≥ TARGET_RETURN = 10%` — un objetivo bien por encima del ~5% que da el mínimo-varianza sin restricción (esencialmente LIQ puro, a su propio rendimiento nominal — ver §5), pero bien por debajo del 14% de ACC, para que la restricción realmente ate sin colapsar en ningún extremo.

**La matriz de covarianza (`src/domain/finance/markowitz.ts`)** se construye vía un modelo de 2 factores (`Σ = L·Lᵀ + D`, un factor de tasa/duración y un factor de renta variable) — esto garantiza que Σ sea definida positiva *por construcción* (nunca hay que verificarlo en runtime) y fija `diag(Σ)` exactamente a `volAnual²` de cada instrumento, así que nada calibrado contra `volAnual` en otro lado (`RISK_ADJUSTED_YIELD_MIN`/`MAX` en `alm.ts`, `finBench()`'s `rFin`, `VOL_MENU_AVG`) se descalibra. TES UVR8 carga mucho menos en el factor de tasa que TES3 (mismo nivel de volatilidad) — modela que su indexación UVR la blinda del riesgo de tasa nominal, igual que en §5. Además, ambas cargas están escaladas hacia abajo desde un nivel plano por la razón de duración de Macaulay propia de cada bono (ver `RATE_LOADING`'s doc comment) — ahora que TES3/TESUVR8 pagan cupón anual (§5.0), parte de su valor vuelve como caja bien antes del vencimiento, así que su exposición genuina a tasa es menor que su plazo nominal por sí solo sugeriría. La matriz de correlaciones implícita resultante: TES1/TES3 ≈0.68 (bonos nominales, pero ya no tan alta como antes de escalar por duración — TES3 se aleja un poco al tener menos exposición a tasa relativa), CDT90/TES1 ≈0.68 (sin cambios — ninguno de los dos es cupón) y CDT90/TES3 ≈0.64, LIQ vs. todo ≈0.10-0.26 (débil — LIQ/TESUVR8 es la más baja de esa banda, ya que TESUVR8 es el bono con la mayor reducción de exposición a tasa), ACC vs. bonos ≈-0.015 a -0.043 (débil-negativa). Una carga de factor nunca puede superar la `volAnual` propia del instrumento (la varianza idiosincrática que queda, `volAnual² − carga²`, se volvería negativa) — es el techo que fija qué tan alto puede llegar `RATE_LOADING.CDT90` sin romper la matriz.

**El solver (`solveLongOnlyMinVariance()`)** usa un método de conjunto activo: resuelve el sistema Lagrangiano de 2 restricciones de igualdad (`Σpesos=1`, `retorno=target`) por eliminación gaussiana sobre el conjunto de instrumentos activo, descarta el de peso más negativo si alguno sale negativo, y repite hasta que todos los pesos sobrevivientes sean ≥0 — converge, para `TARGET_RETURN=10%`, a una mezcla genuina de 5 de los 6 instrumentos (excluye solo TES3): `LIQ≈9.6%, CDT90≈41.8%, TES1≈24.5%, TESUVR8≈20.0%, ACC≈4.1%`, con vol resultante ≈2.86% anual — verificado con condiciones KKT y una validación cruzada por grid-search independiente en `markowitz.test.ts`. TES UVR8's mayor peso frente a una calibración sin cupones (antes ≈16.9%) es consecuencia directa de su menor carga de factor de tasa: se vuelve relativamente más atractivo una vez su exposición genuina a tasa refleja que parte de su valor regresa como cupón antes del vencimiento.

**Calificación**: se compara la varianza que el equipo realmente logró (con los pesos que sometió, ya normalizados a que sumen 1) contra esa varianza mínima real, con la misma banda de tolerancia de error relativo que usa `scoreConcepto()` para el resto de entregables numéricos (100 dentro de `tolerancePerfect`, decae linealmente a 0 en `toleranceZero`) — el error es siempre ≥0 por definición de "mínimo", así que la fórmula no necesita valor absoluto. El servidor rechaza (no persiste) cualquier envío cuyo retorno esperado no alcance `TARGET_RETURN`, para que un equipo sepa de inmediato que su combinación de pesos no es una respuesta válida, en vez de guardarla y calificarla con 0 en silencio.

**Conexión con la cuota de mercado del Año 1** (ver §2.1 y §5.0): los pesos que el equipo sometió alimentan `volRatio` para el cálculo de capacidad del Año 1, vía el mismo `volRatioFromWeights()` que usa el calendario real para los años siguientes. Un equipo que concentra su portafolio de mínima varianza en ACC paga esa volatilidad alta también en su cuota de mercado del Año 1, no solo en la nota del ejercicio — la narrativa es que este portafolio es la presentación del equipo al regulador en el "momento 0", antes de que exista ningún dato real del negocio.

#### 5.7 · Riesgo de tasa e inflación (Día 4)

`riesgoTasa`/`riesgoInflacion` (`computeMarketRiskAtAño2End()` en `alm.ts`) son el descalce de NAV (PV activo real − PV pasivo real) al cierre exacto de Año 2, bajo dos choques de curva independientes — genuinamente distintos de `almNAV()` (§5.3 no lo menciona porque es un diagnóstico aparte, ver más abajo): valoran las posiciones **reales** que el ALM real (`almSimRealYear(2, ...)`) todavía tiene abiertas en ese momento, no una asignación inicial reconstruida, y el pasivo que usan es solo lo que queda por pagar **después** de ese punto (la cola del Año 1 más allá del mes 24, sumada a los siniestros propios del Año 2 más allá de ese mismo mes) — nunca el horizonte completo de 60 meses.

**Dos curvas, no dos tasas planas.** A diferencia de `almNAV()` (§5.3), que descuenta todo a una sola tasa fija (`ALM_TASA_BASE`), este mecanismo descuenta cada flujo a la tasa que corresponde a su propio plazo — una curva genuina, no un número. Ninguna de las dos curvas introduce datos nuevos: ambas se construyen directamente del menú de instrumentos que el equipo ya conoce desde Día 1 (`INSTRUMENT_BY_ID`), no de un supuesto calibrado aparte.

**TES3/TESUVR8 (cupón) valoran como una serie genuina de flujos, no un solo pago.** `pvPositionsAtCurve()` (y `pvPortafolio()`, la versión de tasa plana que usa `almNAV()`) discriminan por `isCouponBond()`: CDT90/TES1 siguen siendo un único flujo (`book` proyectado a su valor futuro y descontado una sola vez a su propio plazo remanente, igual que siempre), pero TES3/TESUVR8 se valoran como cada cupón remanente más un pago final de cupón+principal, cada uno descontado en el punto de la curva que le corresponde a su propio plazo (`pvCouponCashflows()` en `alm.ts`) — el mismo principio de "cada flujo a su propio plazo" que ya aplica al pasivo, ahora también dentro de una sola posición.

- **Curva nominal** (`nominalCurveRate()`): interpolación lineal entre los propios yields de CDT90 (3 meses), TES1 (12 meses) y TES3 (36 meses) — los mismos tres números que el equipo ya ve en el menú de instrumentos — extrapolada plana fuera de ese rango [3, 36] meses.
- **Inflación implícita** (`IMPLIED_INFLATION`): el menú solo tiene un instrumento genuinamente indexado a inflación (TESUVR8), así que no puede definir una *forma* de curva real por sí solo — solo un punto de anclaje, a su propio plazo de 96 meses (`displayYield(TESUVR8)`, el mismo "Inflación + X%" que el equipo ya ve en el menú). Despejando Fisher en ese único punto — `(1+nominal(96)) = (1+real(96)) × (1+inflación)` — se obtiene un único número de inflación, que luego se mantiene **constante** en cualquier otro plazo: la misma simplificación de inflación plana que ya usa el resto del motor en cualquier otro lugar donde necesita un solo número de inflación (`GENERAL_INFLATION_ANNUAL` también es una tasa fija, nunca una curva).
- **Curva real** (`realCurveRate()`): no se interpola por separado — es la curva nominal deflactada por la inflación implícita constante, plazo por plazo, vía Fisher: `real(t) = (1+nominal(t))/(1+IMPLIED_INFLATION) - 1`. Genuinamente multiplicativo (no una resta), la misma relación que usa `displayYield()` en `instruments.ts` — una versión anterior de este mecanismo restaba un spread aditivo de la curva nominal en vez de dividir, lo cual **no** es la misma relación (`(1+nominal)/(1+real)-1` no es `nominal-real`) y solo coincidía con Fisher en el punto de calibración.

**Las tres curvas resultantes, con los yields actuales del menú** (`instruments.ts`) — es un ejemplo calculado para ilustrar la forma, no una tabla mantenida aparte: si el menú de instrumentos cambia, estos números cambian con él, siempre a partir de los mismos tres/un punto de anclaje. La inflación implícita es la misma en toda la fila — 5.353% — por construcción.

| Meses | Nominal | Real |
|---|---|---|
| 0-3 (CDT90) | 9.500% | 3.936% |
| 6 | 9.833% | 4.253% |
| 9 | 10.167% | 4.569% |
| 12 (TES1) | 10.500% | 4.886% |
| 18 | 10.750% | 5.123% |
| 24 | 11.000% | 5.360% |
| 30 | 11.250% | 5.598% |
| 36 (TES3) | 11.500% | 5.835% |
| 48-96 (TESUVR8) | 11.500% | 5.835% |

Nótese que la curva nominal sube de 9.5% a 11.5% entre 3 y 36 meses (los tres puntos dados), la curva real la sigue de cerca pero no en un paralelo exacto (la brecha nominal-real se abre un poco más a plazos largos — 5.564pp a 3 meses, 5.665pp a 36 meses — porque Fisher divide, no resta), y ambas quedan planas de 36 meses en adelante — no hay ningún punto dado más allá de TES3 para interpolar.

**Ejemplo de la interpolación nominal, paso a paso (mes 6, entre CDT90 a 3 y TES1 a 12):**

```
tasa_nominal(6) = tasa_A + (plazo − plazo_A)/(plazo_B − plazo_A) × (tasa_B − tasa_A)
                = 9.5% + (6 − 3)/(12 − 3) × (10.5% − 9.5%)
                = 9.5% + (3/9) × 1.0%
                = 9.5% + 0.333%
                = 9.833%
```

La curva real en ese mismo plazo sale de dividir, no de restar:

```
tasa_real(6) = (1 + tasa_nominal(6)) / (1 + IMPLIED_INFLATION) − 1
             = (1 + 9.833%) / (1 + 5.353%) − 1
             = 1.09833 / 1.05353 − 1
             = 4.253%
```

Ambos coinciden exactamente con la tabla de arriba — la interpolación nominal es el único cálculo que un equipo tiene que hacer más de una vez (una vez por cada plazo distinto que necesite); la curva real sale de ahí mecánicamente, siempre por Fisher, nunca por resta.

Los dos choques se aplican a la curva **entera**, no a un solo punto:

- **Riesgo de tasa** choca la curva **real** en todos sus plazos (±20%/-15%, misma convención relativa que `ALM_TASA_ALZA/BAJA` de §5.3) manteniendo `IMPLIED_INFLATION` fija — la curva nominal se mueve como consecuencia mecánica de Fisher en cada plazo, así que este choque afecta tanto a TESUVR8 (vía la curva real directamente) como a todo lo demás (vía la curva nominal re-derivada).
- **Riesgo de inflación** choca `IMPLIED_INFLATION` (misma convención ±20%/-15%) manteniendo la curva real fija — solo la curva nominal re-derivada se mueve, así que TESUVR8 queda intacto mientras todo lo nominal (bonos y pasivo) sí se mueve.
- Cada figura es el peor de los dos movimientos de NAV frente al escenario base, mismo patrón "peor dirección, recortado a ≥0" que ya usa `almNAV()`'s `riesgoTasa`.

**Por qué solo TESUVR8 usa la curva real**: es el único instrumento del menú genuinamente indexado a inflación (UVR) — todo lo demás con plazo propio (CDT90/TES1/TES3) y el pasivo de siniestros son cifras nominales, y se valoran con la curva nominal en ambos escenarios, cada flujo a su propio plazo remanente. LIQ y ACC se valoran a la par en ambos casos (sin duración — mismo tratamiento que ya les da `pvPortafolio()`), no porque no tengan riesgo, sino porque ACC tiene su propio cargo separado (`rAcciones`, §4.4) y LIQ no tiene sensibilidad de tasa que modelar.

**Relación con `almNAV()` (§5.3)**: son mecanismos hermanos, no el mismo. `almNAV()` sigue siendo un diagnóstico informativo del panel de admin, valorado en el momento 0 con una asignación inicial reconstruida y una tasa plana (nunca calificado, nunca visto por el equipo). `computeMarketRiskAtAño2End()` es un entregable calificado del Día 4, valorado al cierre real de Año 2 con las posiciones reales del calendario que el equipo sometió y una curva genuina por plazo — el que sí se le pide reportar.

### 6 · Analítica sectorial (Día 4)

**Por qué esto no es una segmentación univariada.** El motor de riesgo (`calcLambda()`, `src/domain/pricing/frequency.ts`) tiene interacciones reales entre variables, que una segmentación por *una* sola dimensión a la vez (zona, uso, edad o estrato, cada una marginalizando sobre las otras tres) no puede capturar: `zona=urbana × uso=comercial` (×1.35 adicional), `edad≤24 × tipo=deportivo` (×1.40), `hist≥2 × antig≥8` (×1.25), `edad≤24 × edu=básica` (×1.20). Una segmentación univariada no puede detectar ninguna de ellas — "zona:urbana" sola mezcla el urbano-comercial (malo) con el urbano-personal (normal) y el promedio diluye la señal. Un caso concreto: `zona=rural` sola tiene un multiplicador protector (×0.7), pero `rural × comercial` específicamente es peor que el promedio del mercado (interacción ×1.1 adicional sobre una base ya mala de "comercial") — un equipo que solo mira el marginal vería "rural" como sano y recomendaría crecerlo, arrastrando consigo la porción rural-comercial que no lo es.

**Sectores, no segmentos.** `src/domain/grading/sectors.ts` define 8 dimensiones categóricas — zona, uso, edad (bucketed), estrato (bucketed), tipo de vehículo, antigüedad del vehículo (bucketed), historial de siniestros (0/1/2+) y educación — de las cuales el equipo cruza **2 a la vez** (28 combinaciones posibles de dimensión, cada una con varias combinaciones de valores) para nombrar un "sector" (ej. `zona=urbana × uso=comercial`). Dos variables, no una ni cuatro: suficiente para capturar cualquiera de las interacciones reales de arriba, sin que el espacio de búsqueda ni el riesgo de sectores minúsculos armados a mano se disparen.

**"Historial de siniestros" es una trampa deliberada, no un sector.** `hist` sigue en la lista de dimensiones que un equipo puede elegir — no se le quitó la opción — pero está excluida de todo ranking real (`TRUE_RANKING_EXCLUDED_DIMENSIONS` en `sectors.ts`): ningún cruce que involucre `hist` aparece nunca en `trueCrecer`/`trueDisminuir`, así que nombrarla como prioridad siempre da 0 puntos en esa posición. La razón conceptual: el historial de siniestros de un asegurado es un factor de *suscripción individual* (qué tan riesgoso es ese conductor en particular), no un *sector de mercado* que una aseguradora pueda targetear para crecer o encoger su book — "conductores con 2+ siniestros previos" no es un segmento comercial accionable de la misma forma que "urbano-comercial" o "jóvenes con carro deportivo" sí lo son. Un equipo que reconoce esto y descarta `hist` de su recomendación está razonando correctamente sobre la diferencia entre riesgo individual y sector de mercado; uno que la incluye pensando que es "otra variable más para cruzar" pierde puntos por no distinguir ambos conceptos. Esto **no se menciona en ninguna vista de equipo** (formulario, guía, `ModelDocs`) — deben deducirlo ellos mismos, igual que con las variables trampa débiles de `calcLambda()` (género, marca).

**La verdad es global, nunca de la cartera propia de un equipo.** La cartera de cada equipo no es una muestra aleatoria del mercado — como el mercado se reparte por precio (cada asegurado elige la aseguradora más conveniente), un equipo que subvalora un riesgo específico termina ganando desproporcionadamente ese riesgo. Calificar contra la propia cartera de un equipo sería circular. En cambio, `computeSectorStats()` calcula, **una sola vez por cohorte** sobre el universo completo de 1.000.000 de expuestos (nunca por equipo), el multiplicador de cada sector: **pérdida agregada** del sector ÷ **pérdida agregada** de todo el universo — 1.0× siempre significa "igual al promedio del mercado", sin importar qué par de dimensiones se cruce. "Pérdida agregada" (`aggregateLoss`) es la métrica combinada frecuencia×severidad: `(siniestros del sector / expuestos del sector) × mediana de severidad del sector` — no confundir con "severidad" a secas, que en este archivo siempre se refiere solo al monto de un siniestro individual (`medianSeverity`), nunca a la métrica combinada. Solo cuentan sectores con al menos `SECTOR_MIN_COUNT=2000` expuestos en el universo completo (muy por encima de los estándares clásicos de credibilidad actuarial) — el piso aplica al universo, no a la cartera de ningún equipo, porque el ejercicio es justamente lidiar con información incompleta: un equipo nunca ve este ranking directamente, solo su propia cartera (parcial y sesgada) y el CSV público del universo (características de riesgo, sin resultados).

**Por qué mediana, y por qué hay outliers.** La severidad de cada sector se resume con la **mediana**, no el promedio, de las severidades de sus siniestros — y la generación de siniestros (`generateColombia`/`generateYear2Claims`) inyecta una fracción pequeña y determinística de siniestros atípicamente altos (`OUTLIER_CLAIM_PROBABILITY=2%` de los siniestros, multiplicados por `OUTLIER_CLAIM_MULTIPLIER=8×`, vía un stream de RNG independiente del resto de la generación — ver `src/domain/generation/constants.ts`). La combinación de ambas cosas es deliberada: un equipo que resume severidad con un promedio simple sobre datos con cola pesada verá sectores "inflados" por un puñado de siniestros catastróficos que no representan el riesgo típico de ese sector, y llegará a un ranking distinto (y peor calificado) que uno que reconoce la necesidad de una medida robusta a outliers. Esto es exactamente lo que un actuario real enfrenta con severidad de siniestros (distribución de cola pesada, unos pocos siniestros grandes dominan la media pero no la mediana) — **no se menciona en ninguna vista de equipo**, deben inferirlo de los datos mismos.

**Los CSV exportados están sucios a propósito.** Tanto el CSV público del universo (`/api/universe/public-csv`) como el reporte propio de cada equipo (`/api/teams/report`, Día 1 y 2) pasan sus columnas de riesgo (nunca `id_expuesto` ni las columnas de resultado — prima, fechas, montos) por `dirtyRow()` (`src/lib/dirtyCsv.ts`): ~3% de las filas salen con un valor categórico en mayúsculas y espacios extra, un sentinela numérico (`9999`) en vez del valor real, un campo vacío, o (raramente) la fila duplicada. Es puramente cosmético a nivel de exportación — el motor de simulación sigue usando los arrays tipados internos sin tocar, así que ningún resultado financiero de ningún equipo cambia — pero **un equipo que no limpia estos datos antes de tarificar o de calcular sus sectores va a operar sobre números corruptos sin saberlo**: un sentinela de `9999` en `antig` o `km`, o un espacio/mayúscula que rompe un `GROUP BY`/`groupby` de texto, alteran silenciosamente cualquier agregación aguas abajo. La corrupción es una función pura y determinística de `(seed, índice de fila)` — la misma exposición recibe siempre el mismo tratamiento sin importar en qué exportación aparezca (universo público, reporte Día 1, reporte Día 2), así que es reproducible y nunca aleatoria entre corridas. **No se menciona en ninguna vista de equipo** — la necesidad de limpiar los datos es algo que deben descubrir al abrir el CSV, como en un caso real.

**El equipo entrega dos listas rankeadas, no un formulario por segmento**: hasta 3 sectores priorizados para **crecer** y hasta 3 para **disminuir** (todo lo no nombrado queda implícito en "mantener"). Además del sector en sí, cada posición nombrada exige una segunda cosa: una estimación del **multiplicador** real de ese sector (`estimatedMultiplier`, `AnalyticsRecommendation.estimatedMultiplier`, opcional a nivel de esquema — dejarlo en blanco es una respuesta incompleta, no un error).

Cada posición *i* se califica en dos mitades iguales (`scoreSectorPicks()`):

- **Posición**: se compara contra el rango real de ese sector en el ranking verdadero (`rankForCrecer`/`rankForDisminuir`, ordenado por multiplicador ascendente/descendente, **excluyendo siempre los cruces con `hist`**) — acertar la posición exacta da 100 puntos, y decae linealmente hasta 0 una vez la diferencia alcanza `SECTOR_RANK_WINDOW=10` posiciones. Nombrar un sector que ni siquiera aparece en el ranking real (dirección equivocada, cruce con `hist`, o no alcanza el piso de credibilidad) también da 0 aquí.
- **Multiplicador estimado**: `toleranceBandScore()` (`src/domain/grading/concepts.ts` — la misma banda de tolerancia sobre el error relativo que califica cualquier otro entregable numérico de la plataforma, extraída de `scoreConcepto()` para que ambas compartan una sola implementación) contra el `multiplier` real del `SectorStat` encontrado en el ranking verdadero. Da 0 (no se salta) si el sector no está en el ranking real — no hay un multiplicador verdadero contra el cual comparar — o si el equipo dejó la estimación en blanco: nombrar el sector correcto sin estimar su multiplicador es una respuesta a medias, no una versión más pequeña de la respuesta completa.

Cada slot llenado promedia sus dos mitades; la nota del día promedia ambas listas (`scoreSectorRecommendation()`), y las posiciones que un equipo deja completamente en blanco simplemente no cuentan, ni para bien ni para mal.

### 7 · Calificación compuesta

- **Objetivo por día** — mezcla actuarial/financiero (peso configurable): el actuarial incluye la calidad de la tarifa más cualquier entregable numérico de ese perfil; el financiero, los entregables financieros más la nota ALM/analítica cuando aplica. La calidad de la tarifa se mide sobre el mismo RT que usa `finBench()` (`prima − siniestros − gastos de adquisición/comisión`, `RT_EXPENSE_PCT` en `src/domain/finance/constants.ts` — deliberadamente sin gasto administrativo, que es su propia línea, Resultado Industrial, ver §4.1) para que "RT" signifique lo mismo en todo el modelo. A propósito, sobre prima **emitida** cruda, no devengada — esta nota es sobre calidad de tarificación/suscripción, no sobre la contabilidad de reconocimiento de ingreso que sí importa en el P&G completo (§4.1).

  Los **dos años se califican con la misma función** (`notaTarifacionAbsoluta`), anclada al propio modelo y no al cohorte. Antes el Año 2 tenía su propio calificador relativo al cohorte (percentil 10-90 del RT del mercado, o ranking por posición), lo que hacía que las notas de tarifa de los dos días midieran cosas distintas y que la del Año 2 dependiera de quién más se presentó.

  Cada equipo se compara contra el *cost ratio* que su propia siniestralidad habría necesitado para dejarlo exactamente en un margen técnico neto del 20% (`GOOD_PERFORMANCE_MARGIN_PCT`, ya después de los gastos fijos). Con `netPremiumFrac = 1 − RPND(20%) − RT_EXPENSE_PCT(19%) = 0.61`:

    - `availableFrac = netPremiumFrac + rpndLiberada ÷ prima emitida` — la fracción de prima que queda para cubrir siniestros. En Año 1 no hay año previo del cual liberar, así que es 0.61 pelado; en Año 2 la RPND constituida en Año 1 vuelve como ingreso, así que el equipo genuinamente tiene más prima devengada. Es el mismo término que ya carga `computeRt()`, y es lo que permite que una sola función ancle los dos años.
    - `costRatio = (siniestros + honorarios de consultoría) ÷ prima emitida` — los honorarios (8% de la prima emitida, solo si el equipo tercerizó ese año, ver §4.1) van en el numerador junto a los siniestros: son parte del costo que su decisión de tarificación le cargó a la cartera.
    - `goodCostRatio = availableFrac − MARGIN`.

  El ratio se remapea por `1/costRatio` (más alto es mejor, como el RT del que sale) y pasa por una logística `nota = 100 / (1 + e^(−k·x))` con `x = (availableFrac/costRatio − 1) · (goodCostRatio/MARGIN)` y `k` resuelto para que `x = 1` dé exactamente `GOOD_PERFORMANCE_SCORE = 75` (no más cerca de 100: un margen neto del 20% ya es sobresaliente, y dejar cupo por encima evita que la curva castigue como catastrófico cualquier resultado apenas mediocre).

  Por construcción, y para cualquier `rpndLiberada` y cualquier nivel de honorarios: `RT = 0` da nota 50 exacta, todo `RT > 0` da más de 50, todo `RT < 0` da menos de 50, y quien acierte el margen objetivo da exactamente 75 — sin importar quién más se presentó ni cómo tarificó. El tamaño de cartera tampoco entra (los honorarios son proporcionales a la prima, así que la independencia de escala sobrevive), y un resultado apenas por debajo del punto de equilibrio no se desploma: un loss ratio de 0.95 (mediocre, no catastrófico) queda cómodamente por encima de un solo dígito.
- **Subjetivo** — es **por integrante**, no por equipo, y solo existe para **Días 2-4**: el Día 1 no tiene calificación subjetiva, porque todavía no ha habido suficiente contacto con los equipos para evaluar a cada integrante. Para cada integrante y cada día, el evaluador registra un único `MemberDayEvaluation` con cinco campos:
  - **Nota general del día** (1.0-5.0, un decimal) — el único campo que entra en el cálculo: la nota subjetiva del equipo es el **promedio** de la Nota general de sus integrantes, escalado a 0-100 sobre esa escala fija de 5 (`notaSubjetivaEquipo()`, `src/domain/grading/composite.ts`).
  - **¿Aprobó el día?** (sí/no) — independiente de la Nota general por diseño: no entra en ningún cálculo, es un check administrativo aparte (un integrante puede tener una nota baja y aun así estar "aprobado", o viceversa).
  - **Perfil** (actuarial / financiero / generalista) — metadata descriptiva del rol que jugó ese integrante ese día; tampoco alimenta ningún cálculo.
  - **Comentarios del día** — texto libre del evaluador.
  - **Autor de los comentarios** — nombre del evaluador que escribió el comentario (campo de texto libre; hoy no hay cuentas de evaluador separadas, solo la cuenta admin compartida).

  Un equipo sin roster cargado no tiene nota subjetiva — no hay atajo de equipo.
- **Nota final** — promedio de los objetivos de los 4 días (ponderado actuarial/financiero) combinado con el promedio subjetivo de los 3 días que sí lo tienen (Días 2-4), según el peso subjetivo configurado en la rúbrica.

## Los 4 días

```mermaid
flowchart LR
    D1["Día 1\nTarifación Año 1\n+ Mínima varianza"] --> D2["Día 2\nP&G Año 1\n+ Retarifación Año 2\n+ Árbol de portafolio real"]
    D2 --> D3["Día 3\nP&G Año 2\n+ Balance + proy. Año 3"]
    D3 --> D4["Día 4\nSolvencia, dividendos\n+ Analítica sectorial"]
    D4 --> Final["Consolidado final\n(4 días, objetivo + subjetivo)"]
```

Cada día tiene las mismas 5 sub-pestañas: **Tarifas/Simulación** (solo Días 1-2, ya que el Año 2 es el último año simulado), **Entregables** (incluye el portafolio de mínima varianza en Día 1, y el calendario de portafolio real en Día 2 — ver §5/§5.6), **Resultados objetivos**, **Calificación subjetiva** y **Top del día**.

| Día | Actuarial | Financiero |
|---|---|---|
| 1 | Tarificar Año 1 | Portafolio de mínima varianza sujeto a un retorno objetivo (ver §5.6) — también alimenta la cuota de mercado del Año 1 (§2.1) |
| 2 | Retarifar Año 2 (con retención de clientes) | Estado de resultados completo Año 1 (13 líneas, ver §4.1 — sin reservas por separado, esas viven en el Balance de Día 3) + calendario de portafolio real Año 1 (ALM ficticio, calce con reservas — ver §5) |
| 3 | Reservas técnicas Año 1 y Año 2 (como línea del Balance de cada año) | Estado de resultados Año 2 + proyección Año 3, Balance de Año 1/2/3 |
| 4 | Recomendación sectorial (top 3 sectores a crecer/disminuir, rankeados, cada uno con un multiplicador estimado — ver §6) | Solvencia (capital requerido, margen), dividendos, EVA (creación de valor, ver §4.4) y riesgo de tasa/inflación/acciones al cierre de Año 2 (ver §5.7) |

## Roles

```mermaid
flowchart TB
    subgraph Admin["Admin / evaluador"]
        A1["Genera universo Colombia + Chile"]
        A2["Configura rúbrica y crea equipos"]
        A3["Corre la simulación de cada año"]
        A4["Revisa entregables y califica lo subjetivo"]
        A5["Habilita cada día a medida que avanza el reto"]
    end
    subgraph Team["Equipo (practicante)"]
        T1["Sube tarifa y portafolio"]
        T2["Sube reportes financieros/actuariales"]
        T3["Ve los resultados de un día una vez el admin lo habilita"]
        T5["Ve el ranking general (posiciones, no datos crudos de otros equipos)"]
    end
```

Todo acceso a datos de un equipo se filtra por `teamId` en la capa de datos (no solo en la UI). Qué días son visibles se controla con `Cohort.openDay`, que el admin avanza a medida que el reto progresa; la calificación subjetiva nunca se expone a una sesión de equipo, ni siquiera dentro del ranking desglosado.

## Estructura del repo

```
/prisma            Schema y migraciones
/src
  /domain          Motor puro (sin Next.js/Prisma/React) — generación, mercado, reservas, finanzas, calificación
  /lib             Server Actions, helpers de Prisma/CSV/binario, orquestación por equipo
  /app
    /(team)/...    Vistas de equipo (dashboard, día/[n], ranking)
    /admin/...     Vistas de admin (universo, configuración, día/[n], consolidado, modelo técnico)
    /api/...       Route Handlers (universo, simulación, tarifas, reporte)
    proxy.ts       Gating por rol (Next.js 16 renombró middleware.ts a proxy.ts)
```

`src/domain` no importa nada de Next.js/Prisma/React: recibe datos planos (arrays tipados) y devuelve datos planos, así que se prueba en aislamiento (`npm run test`).

## Cómo correrlo localmente

```bash
npm install
npx prisma migrate dev      # aplica migraciones contra tu Neon Postgres
npm run dev                 # servidor de desarrollo
npm run test                # tests unitarios del motor (src/domain)
```

Variables de entorno esperadas (`.env.local`, ver `.env.example`): `DATABASE_URL` (Neon), `AUTH_SECRET`.

## Despliegue

Vercel Hobby (gratis) + Neon Postgres free tier. Sin dominio propio (usa `*.vercel.app`). El cómputo pesado (generación del universo, simulación de mercado) corre de forma síncrona dentro de Route Handlers normales (`maxDuration = 300`, el máximo real del plan Hobby) — no hay cola ni worker separado, por diseño, para no depender de un servicio de pago.
