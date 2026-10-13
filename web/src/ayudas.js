// ============================================================
// Glosario de columnas (qué significa cada una y su fórmula general)
// ============================================================
export const GLOSARIO = {
  ufc: {
    titulo: 'UFC/mL',
    texto: 'Unidades formadoras de colonias por mL de la muestra. Se calcula con las placas que quedaron dentro del rango contable.',
    formula: ['UFC/mL = ΣC / Σ(V × 10⁻ᵏ)', 'C = colonias de cada placa usada', 'V = volumen sembrado (mL)', 'k = dilución de esa placa (10⁻ᵏ)'],
    nota: 'Con una sola placa: UFC/mL = C × 10ᵏ / V. Es la media ponderada de ISO 7218 / FDA BAM.',
  },
  ic95: {
    titulo: 'IC 95 % del recuento',
    texto: 'Intervalo de confianza del 95 % por el error de conteo (distribución de Poisson), método exacto de Garwood.',
    formula: ['λ_inf = χ²(0,025; 2·ΣC) / 2', 'λ_sup = χ²(0,975; 2·ΣC + 2) / 2', 'IC = [λ_inf ; λ_sup] / Σ(V × 10⁻ᵏ)'],
    nota: 'Solo incluye el error de conteo, no el de pipeteo; por eso importan las réplicas.',
  },
  estado: {
    titulo: 'Estado del recuento',
    texto: 'En rango: hay placas dentro del rango contable. Estimado: ninguna placa en rango, se usó la más cercana. < límite: ninguna colonia. > límite: todo incontable.',
  },
  n: {
    titulo: 'n',
    texto: 'Cantidad de réplicas con un valor válido que entran en la media (las demás no tienen dato o quedaron fuera de los límites).',
  },
  mediaGeo: {
    titulo: 'Media geométrica de UFC/mL',
    texto: 'Las UFC se promedian en escala logarítmica porque sus errores son multiplicativos (distribución log-normal).',
    formula: ['x̄ = Σ log₁₀(UFCᵢ) / n', 'Media geométrica = 10^x̄'],
  },
  icMedia: {
    titulo: 'IC 95 % de la media',
    texto: 'Intervalo donde está la media verdadera con 95 % de confianza, calculado en log₁₀ y vuelto a UFC/mL.',
    formula: ['x̄ ± t(0,975; n − 1) × DE / √n', 'IC = 10^(x̄ − …) a 10^(x̄ + …)'],
  },
  logDe: {
    titulo: 'log₁₀ ± DE',
    texto: 'Media de log₁₀(UFC/mL) de las réplicas y su desviación estándar. 0,1 log ≈ ±26 %; 0,3 log = factor 2.',
    formula: ['x̄ = Σxᵢ / n', 'DE = √( Σ(xᵢ − x̄)² / (n − 1) )'],
  },
  de: {
    titulo: 'DE (desviación estándar)',
    texto: 'Cuánto se dispersan las réplicas alrededor de su media (desviación muestral, se divide por n − 1).',
    formula: ['DE = √( Σ(xᵢ − x̄)² / (n − 1) )'],
  },
  cv: {
    titulo: 'CV % (coeficiente de variación)',
    texto: 'Dispersión relativa: la DE como porcentaje de la media. Permite comparar la variabilidad de valores de distinta magnitud.',
    formula: ['CV % = 100 × DE / media'],
  },
  odCorr: {
    titulo: 'OD corregida',
    texto: 'OD de la muestra sin diluir, calculada con las lecturas que caen en la ventana lineal del equipo y llevadas a la suspensión original.',
    formula: ['OD neta = lectura − blanco', 'OD corregida = media( OD netaₖ × 10ᵏ )', 'solo lecturas con ventana_mín ≤ OD neta ≤ ventana_máx'],
    nota: 'Ejemplo: −2 leyó 0,24 → 0,24 × 100 = 2,4. Puede ser mayor que 1: es la OD que tendría la muestra si el equipo fuera lineal.',
  },
  odNeta: {
    titulo: 'OD neta',
    texto: 'Lectura del espectrofotómetro menos el blanco (medio estéril). Si el equipo ya resta el blanco, es la lectura tal cual.',
    formula: ['OD neta = lectura − blanco'],
  },
  cociente: {
    titulo: 'OD ÷ OD siguiente',
    texto: 'Cociente entre la OD de una dilución y la de la siguiente. Como cada dilución es 1:10, en el rango lineal vale ≈ 10. Un valor menor indica saturación del equipo (o lecturas cerca del límite de detección).',
    formula: ['cociente = OD neta(10⁻ᵏ) / OD neta(10⁻⁽ᵏ⁺¹⁾) ≈ 10'],
  },
  ufcDil: {
    titulo: 'UFC/mL de la dilución',
    texto: 'Concentración de la suspensión diluida cuya OD se leyó (modo «por dilución»).',
    formula: ['UFC/mL de la dilución = UFC/mL de la muestra / 10ᵏ'],
  },
  ufcPorOD: {
    titulo: 'UFC/mL por unidad de OD',
    texto: 'Factor de conversión directo de cada punto («OD 1 = X UFC/mL»). Solo es constante si la relación es proporcional.',
    formula: ['factor = UFC/mL / OD'],
  },
  mu: {
    titulo: 'µ (tasa específica de crecimiento)',
    texto: 'Velocidad de crecimiento en la fase exponencial, por unidad de tiempo. Se obtiene de la pendiente de log₁₀ frente al tiempo, ajustada con todas las réplicas del tramo.',
    formula: ['ln N = ln N₀ + µ · t', 'µ = pendiente(log₁₀ vs t) × ln 10', 'IC 95 %: (pendiente ± t × EE) × ln 10'],
  },
  g: {
    titulo: 'Tiempo de generación',
    texto: 'Tiempo que tarda la población en duplicarse durante la fase exponencial.',
    formula: ['g = ln 2 / µ ≈ 0,693 / µ'],
  },
  lag: {
    titulo: 'Latencia (λ)',
    texto: 'Duración aproximada de la fase de adaptación antes del crecimiento exponencial (método de la tangente): tiempo en que la recta de la fase exponencial corta el nivel inicial.',
    formula: ['log₁₀ N(t) = a + b · t   (recta de la fase exponencial)', 'λ = (log₁₀ N₀ − a) / b'],
  },
  fase: {
    titulo: 'Fase exponencial',
    texto: 'Tramo de tiempos consecutivos (al menos 3) donde log₁₀ crece en línea recta con la mayor pendiente.',
    formula: ['ventana inicial: 3 tiempos con mayor pendiente y R² ≥ 0,97', 'se extiende mientras siga recta y cada tramo agregado tenga pendiente ≥ 85 % de la máxima'],
  },
  deltaLog: {
    titulo: 'Δ log₁₀',
    texto: 'Cuánto creció la población entre el primer tiempo y el máximo, en órdenes de magnitud. También se expresa en duplicaciones.',
    formula: ['Δ log₁₀ = log₁₀ máximo − log₁₀ inicial', 'duplicaciones = Δ log₁₀ / log₁₀ 2'],
  },
  r2: {
    titulo: 'R² (coeficiente de determinación)',
    texto: 'Proporción de la variación de los datos que explica la recta (0 a 1). El criterio habitual es ≥ 0,95, pero un R² alto no garantiza que el modelo sea el correcto: mirá los residuos.',
    formula: ['R² = 1 − SS_residual / SS_total'],
  },
  ecuacion: {
    titulo: 'Ecuación de la curva',
    texto: 'Recta o curva ajustada por mínimos cuadrados con los puntos de esa cepa. Sirve para estimar UFC/mL a partir de una OD dentro del rango de OD calibrado.',
  },
  rangoOD: {
    titulo: 'Rango de OD calibrado',
    texto: 'OD mínima y máxima de los puntos usados. Usar la curva fuera de ese rango es una extrapolación.',
  },
  estimacion: {
    titulo: 'Estimación del parámetro',
    texto: 'Valor del parámetro ajustado por mínimos cuadrados.',
  },
  ee: {
    titulo: 'Error estándar (EE)',
    texto: 'Incertidumbre del parámetro estimado: cuánto variaría si se repitiera el experimento.',
    formula: ['EE = √(varianza del parámetro)', 'IC 95 % = estimación ± t(0,975; gl) × EE'],
  },
  pvalor: {
    titulo: 'Valor p',
    texto: 'Probabilidad de obtener un parámetro tan alejado de 0 si en realidad fuera 0. p < 0,05: el parámetro es distinto de 0.',
    formula: ['t = estimación / EE', 'p = 2 × P(T > |t|) con gl = n − parámetros'],
  },
  rmse: {
    titulo: 'RMSE log₁₀',
    texto: 'Error típico de la curva en órdenes de magnitud, calculado en la misma escala para todos los modelos. 0,1 ≈ ±26 %.',
    formula: ['RMSE = √( Σ (log₁₀ obs − log₁₀ ajustado)² / n )'],
  },
  aicc: {
    titulo: 'AICc / ΔAICc',
    texto: 'Criterio de información de Akaike corregido: premia el buen ajuste y penaliza los parámetros de más. Menor es mejor; ΔAICc < 2 = modelos equivalentes.',
    formula: ['AICc = n · ln(SS/n) + 2k + 2k(k+1)/(n − k − 1)', 'ΔAICc = AICc − AICc del mejor modelo'],
  },
  errRel: {
    titulo: 'Error relativo medio',
    texto: 'Promedio de cuánto se equivoca la curva en porcentaje respecto de cada punto.',
    formula: ['100 × media( |ajustado − observado| / observado )'],
  },
  prediccion: {
    titulo: 'UFC/mL estimada por la curva',
    texto: 'Para réplicas con OD y sin recuento válido: se reemplaza la OD en la ecuación de la curva de su cepa. El intervalo de predicción indica dónde caería un recuento real con 95 % de probabilidad.',
  },
}

// Clave del glosario para un nombre de columna (tablas generadas)
export function claveColumna(col) {
  const c = String(col)
  if (/^IC95/.test(c)) return 'ic95'
  if (/por unidad de OD/.test(c)) return 'ufcPorOD'
  if (/de la dilución/.test(c)) return 'ufcDil'
  if (/corregida/.test(c)) return 'odCorr'
  if (/neta/.test(c)) return 'odNeta'
  if (/^DE log10/.test(c)) return 'logDe'
  if (/^DE/.test(c)) return 'de'
  if (/^log10/.test(c)) return 'logDe'
  if (/media geométrica/.test(c)) return 'mediaGeo'
  if (/^n /.test(c) || c === 'n') return 'n'
  if (/^UFC\/mL/.test(c)) return 'ufc'
  if (/^Recuento$/.test(c)) return 'estado'
  return null
}
