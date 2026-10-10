import { rangoDe, RANGOS } from '../ufc.js'

export function MetodoTab({ s }) {
  const [L, U] = rangoDe(s.opts)
  const nombreRango = RANGOS.find((r) => r[0] === s.opts.rango)?.[1]
  return (
    <div className="pagina">
      <section className="tarjeta metodo">
        <h2>Método</h2>
        <p className="ayuda">Configuración actual: rango contable <b>{L}–{U}</b> ({nombreRango}), volumen por defecto <b>{s.opts.volDef} µL</b>,
          {' '}{s.opts.incluirEstimados ? 'se usan' : 'no se usan'} los recuentos estimados.</p>

        <h3>1. Del recuento a UFC/mL</h3>
        <p>Cada columna es un paso de dilución 1:10. En la columna <code>−k</code> la suspensión está diluida 10<sup>k</sup> veces y en la placa se siembran <code>V</code> mL de ella. Si en esa placa crecen <code>C</code> colonias:</p>
        <p className="ecuacion">UFC/mL = C × 10ᵏ / V          (V en mL: 100 µL = 0,1 mL)</p>
        <p>Si la suspensión «sin diluir» ya era una dilución 1:F de la muestra madre (dilución previa), <code>UFC/mL madre = UFC/mL × F</code>.</p>
        <p><i>Ejemplo:</i> 182 colonias en la placa −6 con 100 µL → 182 × 10⁶ / 0,1 = 1,82 × 10⁹ UFC/mL.</p>

        <h3>2. Rango contable</h3>
        <p>Solo se usan las placas con un número de colonias dentro del rango contable, porque fuera de él el recuento es poco confiable:</p>
        <ul>
          <li><b>Pocas colonias</b>: el error de muestreo (Poisson) es grande. El error relativo es ≈ 1/√C: con 10 colonias ±32 %, con 30 ±18 %, con 100 ±10 %, con 300 ±6 %.</li>
          <li><b>Muchas colonias</b>: se superponen, compiten por nutrientes y se cuentan mal; el recuento queda por debajo del real.</li>
        </ul>
        <p>Rangos habituales: <b>30–300</b> (Breed y Dotterrer, 1916; el más usado en microbiología general), <b>25–250</b> (Tomasiewicz et al., 1980; FDA BAM, cap. 3),
          <b>10–300</b> (ISO 7218 e ISO 4833-1, que además usan todas las placas con ≤ 300 colonias para el cálculo ponderado), y <b>3–30 por gota</b> para la técnica de microgota de Miles y Misra (Herigstad et al., 2001).
          Celda vacía = dilución no sembrada; <code>0</code> = sembrada sin colonias; <code>INC</code> (MNPC, TNTC, &gt;300) = incontable.</p>

        <h3>3. Varias diluciones dentro del rango</h3>
        <p><b>Media ponderada (por defecto, ISO 7218 / FDA BAM)</b>: se suman las colonias de todas las placas retenidas y se divide por el volumen total de suspensión original que recibieron:</p>
        <p className="ecuacion">N = ΣC / Σ(V × 10⁻ᵏ)   ⇔   N = ΣC / [V × (n₁ + 0,1 × n₂) × d]</p>
        <p>donde <code>n₁</code> y <code>n₂</code> son las placas de la primera y la segunda dilución retenidas y <code>d</code> el factor de la primera. Las placas con más colonias pesan más, que es lo correcto: su error relativo es menor.
          Si los recuentos siguen una distribución de Poisson, este es el <b>estimador de máxima verosimilitud</b> de la concentración.</p>
        <p><i>Ejemplo (V = 0,1 mL):</i> 245 colonias en −3 y 26 en −4 → N = (245 + 26) / (0,1 × 10⁻³ + 0,1 × 10⁻⁴) = 271 / 1,1 × 10⁻⁴ = 2,46 × 10⁶ UFC/mL.</p>
        <p>Alternativas: <b>una sola dilución</b> (la placa más cercana al centro geométrico del rango) o la <b>media aritmética</b> de las estimaciones de cada dilución (da el mismo peso a una placa de 30 colonias que a una de 300; menos eficiente).</p>

        <h3>4. Ninguna placa dentro del rango</h3>
        <ul>
          <li><b>Estimado (bajo el rango)</b>: todas las placas con colonias tienen menos de {L}. Se usa la más cercana al rango (en la práctica, la menos diluida). ISO 7218 lo informa como «recuento estimado». Con menos de 4 colonias la imprecisión es muy alta.</li>
          <li><b>Estimado (sobre el rango)</b>: todas las placas contables tienen más de {U}. Se usa la más diluida; el valor real probablemente es mayor (colonias superpuestas).</li>
          <li><b>&lt; límite de detección</b>: ninguna placa tiene colonias. El resultado es <code>&lt; 1 / (V × 10⁻ᵏ)</code> de la placa menos diluida (una colonia en ella).</li>
          <li><b>&gt; límite superior</b>: todas las placas son incontables. El resultado es <code>&gt; {U} / (V × 10⁻ᵏ)</code> de la placa más diluida.</li>
        </ul>
        <p>Los resultados «&lt;» y «&gt;» son límites, no valores: nunca entran en promedios ni en la curva. Los estimados entran solo si activás «Usar recuentos estimados».</p>

        <h3>5. Incertidumbre de cada recuento</h3>
        <p>El intervalo de confianza del 95 % se calcula con el <b>método exacto de Garwood</b> para la Poisson sobre el total de colonias usadas, y se divide por el volumen total:</p>
        <p className="ecuacion">IC = [ χ²(0,025; 2ΣC) / 2 ;  χ²(0,975; 2ΣC + 2) / 2 ] / Σ(V × 10⁻ᵏ)</p>
        <p>(equivale a <code>poisson.test()</code> de R). Este intervalo refleja <b>solo el error de conteo</b>; no incluye el error de pipeteo de cada paso de dilución, que se acumula y suele sumar un 5–10 % adicional (Niemelä, 2002). Por eso las réplicas son imprescindibles.</p>
        <p><b>Coherencia de la serie</b>: cuando se usan dos o más diluciones se aplica una prueba χ² de dispersión de Poisson: <code>χ² = Σ (C − N·V·10⁻ᵏ)² / (N·V·10⁻ᵏ)</code> con (placas − 1) grados de libertad.
          Un p &lt; 0,05 indica que los recuentos no bajan 10 veces por dilución como deberían (error de dilución, pipeta descalibrada, colonias superpuestas o agregados). El gráfico «Serie de diluciones» de la fila seleccionada lo muestra visualmente.
          También se avisa si el recuento aumenta al diluir o si hay una placa incontable después de una contable.</p>

        <h3>6. Réplicas, tiempo y promedios</h3>
        <p>Cada fila es una réplica de una <b>muestra en un tiempo</b>. Las réplicas se numeran dentro de cada muestra y tiempo (en t = 0 h: 1, 2, 3; en t = 2 h vuelven a empezar), y los promedios, la tabla de correspondencia y los puntos promediados de la curva se calculan por muestra y tiempo.</p>
        <p>Los recuentos bacterianos tienen distribución aproximadamente <b>log-normal</b>: los errores son multiplicativos (una réplica el doble de otra es tan probable como una la mitad). Por eso se promedia en escala logarítmica:</p>
        <ul>
          <li><b>Media geométrica</b> = 10^(media de log₁₀ UFC/mL). Es el valor que se informa.</li>
          <li><b>DE en log₁₀</b>: 0,1 log ≈ ±26 %; 0,3 log = factor 2. El CV equivalente es √(exp((DE × ln 10)²) − 1).</li>
          <li><b>IC 95 % de la media</b> = 10^(media ± t(0,975; n − 1) × DE / √n).</li>
        </ul>
        <p>Distinguí réplicas <b>técnicas</b> (la misma suspensión sembrada varias veces: miden el error del método) de réplicas <b>biológicas</b> (cultivos independientes: miden la variación real). Para comparar cepas o condiciones el n son las réplicas biológicas.</p>

        <h3>7. Densidad óptica</h3>
        <p>La OD de una suspensión bacteriana no es absorción sino <b>dispersión de la luz</b> (turbidez). Es proporcional a la concentración de células solo mientras cada fotón se dispersa como máximo una vez: a OD altas ocurre dispersión múltiple y la OD medida crece menos que la concentración (Koch, 1970; Stevenson et al., 2016).</p>
        <ul>
          <li><b>Rango lineal</b>: típicamente hasta OD 0,3–0,5 y en algunos equipos hasta ~1; depende del espectrofotómetro (geometría óptica), la longitud de onda y el tamaño y forma de las células. Leé las suspensiones densas diluidas (columna <i>Dil. lectura</i>) para quedar dentro del rango.</li>
          <li><b>OD muy baja</b> (&lt; 0,05): el error relativo de la lectura es grande.</li>
          <li><b>Blanco</b>: medio de cultivo estéril; la OD neta es lectura − blanco. Si el equipo ya se calibró a cero con el medio, el blanco es 0.</li>
          <li><b>Longitud de onda</b>: 600 nm es la convención para bacterias (poca absorción de los medios y de los pigmentos). Una curva vale solo para la longitud de onda, el equipo y el tipo de cubeta/placa con que se hizo.</li>
          <li><b>Microplacas</b>: el camino óptico depende del volumen del pocillo (no es 1 cm); la OD no es intercambiable con la de cubeta.</li>
          <li><b>OD ≠ UFC</b>: la OD incluye células muertas y restos; una UFC puede venir de un agregado o una cadena de células. Por eso la relación cambia con la fase de crecimiento, el medio y la cepa (las variantes rugosas, SCV o formadoras de agregados pueden tener curvas muy distintas): hacé una curva para cada cepa y condición.</li>
        </ul>

        <h3>8. ¿La OD es de la misma suspensión sembrada?</h3>
        <p><b>Misma suspensión</b>: cada réplica es un par real (OD, UFC/mL) y entra como un punto en modo individual. <b>Cultivo paralelo</b>: la réplica de OD y la de UFC son cultivos distintos, así que emparejarlas réplica a réplica es arbitrario; en modo individual esas muestras entran con un solo punto (OD media, UFC media geométrica). La variación entre cultivos se suma a la dispersión de la curva.</p>

        <h3>9. Correspondencia y curva de calibración</h3>
        <p>Cada punto es: <code>x = OD neta</code> de la suspensión leída, <code>y = UFC/mL de esa misma suspensión</code> = UFC/mL madre ÷ dilución de la lectura.
          Se ajusta UFC en función de OD (y no al revés) porque el uso de la curva es predecir UFC a partir de una OD medida, y la OD tiene mucho menos error relativo que el recuento.</p>
        <h4>Modelos</h4>
        <ul>
          <li><b>Proporcional</b> <code>UFC = b·OD</code>: el clásico «OD 1 = b UFC/mL». Válido en el rango lineal si la recta pasa por el origen.</li>
          <li><b>Lineal</b> <code>UFC = a + b·OD</code>: permite ordenada. Una ordenada distinta de 0 suele indicar blanco mal restado, turbidez no viable o no linealidad.</li>
          <li><b>Cuadrático por el origen</b> <code>UFC = b₁·OD + b₂·OD²</code>: corrige la pérdida de linealidad a OD altas (b₂ &gt; 0). Si b₂ es significativo, hay curvatura.</li>
          <li><b>Potencia (log–log)</b> <code>log UFC = a + b·log OD</code>: con exponente b = 1 es proporcional; b &gt; 1 indica saturación de la OD.</li>
          <li><b>Semilog</b> <code>log UFC = a + b·OD</code>: empírico; se incluye para comparar, rara vez describe bien la turbidez.</li>
        </ul>
        <h4>Ponderación</h4>
        <p>El error de un recuento es <b>proporcional</b> a su valor (un 10–20 % en cualquier nivel). Un ajuste lineal sin ponderar dejaría que los puntos de 10⁹ dominen sobre los de 10⁷. Por eso los modelos lineales usan por defecto pesos <code>1/UFC²</code> (mínimos cuadrados ponderados: minimiza el error relativo), y los modelos log ajustan en log₁₀, que es equivalente. Los cálculos coinciden con <code>lm()</code> de R.</p>
        <h4>Qué se informa</h4>
        <ul>
          <li><b>Parámetros</b> con error estándar, IC 95 % (t de Student con n − p grados de libertad) y valor p.</li>
          <li><b>R²</b>: proporción de la variación explicada, en la escala del ajuste. Un R² alto no garantiza que el modelo sea el correcto: mirá los residuos.</li>
          <li><b>σ residual</b>: dispersión típica de los puntos alrededor de la curva (en % para el ajuste ponderado, en log₁₀ para los modelos log).</li>
          <li><b>Banda de confianza 95 %</b>: dónde está la curva media. <b>Banda de predicción 95 %</b>: dónde caería un recuento nuevo a esa OD; es la que importa para usar la curva con una muestra.</li>
          <li><b>Comparación de modelos</b>: RMSE y AICc calculados con los residuos en log₁₀ para que sean comparables entre modelos ajustados en distintas escalas. ΔAICc &lt; 2 = modelos equivalentes; elegí el más simple.</li>
          <li><b>Normalidad de residuos</b>: prueba de Shapiro–Wilk (algoritmo de Royston, igual a <code>shapiro.test()</code>).</li>
          <li><b>Factor de conversión directo</b> (pestaña Tabla): media geométrica de UFC/OD de los puntos.</li>
        </ul>
        <h4>Diseño recomendado del experimento</h4>
        <ol>
          <li>Partir de un cultivo en la fase de interés (normalmente exponencial) y hacer 5–8 diluciones (por ejemplo 1:2 sucesivas) que cubran el rango de OD que se va a usar, con al menos un orden de magnitud entre la menor y la mayor.</li>
          <li>Leer la OD de cada nivel (por duplicado o triplicado) y sembrar el mismo tubo en diluciones 1:10, cada nivel por triplicado.</li>
          <li>Cargar cada nivel como una muestra (o como réplicas con su <i>Dil. previa</i> respecto del cultivo madre) con origen «misma suspensión».</li>
          <li>Usar la curva solo dentro del rango de OD calibrado y con el mismo equipo, longitud de onda, cepa, medio y fase de crecimiento.</li>
        </ol>

        <h3>Referencias</h3>
        <ul className="ayuda">
          <li>Breed RS, Dotterrer WD (1916). The number of colonies allowable on satisfactory agar plates. <i>J Bacteriol</i> 1:321–331.</li>
          <li>Tomasiewicz DM, Hotchkiss DK, Reinbold GW, Read RB, Hartman PA (1980). The most suitable number of colonies on plates for counting. <i>J Food Prot</i> 43:282–286.</li>
          <li>Maturin L, Peeler JT (2001). <i>Bacteriological Analytical Manual</i>, cap. 3: Aerobic Plate Count. US FDA.</li>
          <li>ISO 7218:2007/Amd 1:2013. Microbiology of food and animal feeding stuffs — General requirements and guidance for microbiological examinations.</li>
          <li>ISO 4833-1:2013. Horizontal method for the enumeration of microorganisms — Colony count at 30 °C by the pour plate technique.</li>
          <li>Miles AA, Misra SS, Irwin JO (1938). The estimation of the bactericidal power of the blood. <i>J Hyg</i> 38:732–749.</li>
          <li>Herigstad B, Hamilton M, Heersink J (2001). How to optimize the drop plate method for enumerating bacteria. <i>J Microbiol Methods</i> 44:121–129.</li>
          <li>Jennison MW, Wadsworth GP (1940). Evaluation of the errors involved in estimating bacterial numbers by the plating method. <i>J Bacteriol</i> 39:389–397.</li>
          <li>Garwood F (1936). Fiducial limits for the Poisson distribution. <i>Biometrika</i> 28:437–442.</li>
          <li>Niemelä SI (2002). <i>Uncertainty of quantitative determinations derived by cultivation of microorganisms</i>. MIKES, Publication J4/2002.</li>
          <li>Koch AL (1970). Turbidity measurements of bacterial cultures in some available commercial instruments. <i>Anal Biochem</i> 38:252–259.</li>
          <li>Stevenson K, McVey AF, Clark IBN, Swain PS, Pilizota T (2016). General calibration of microbial growth in microplate readers. <i>Sci Rep</i> 6:38828.</li>
          <li>Beal J et al. (2020). Robust estimation of bacterial cell count from optical density. <i>Commun Biol</i> 3:512.</li>
          <li>Burnham KP, Anderson DR (2002). <i>Model Selection and Multimodel Inference</i>, 2.ª ed. Springer (AICc).</li>
          <li>Royston P (1995). Remark AS R94: A remark on algorithm AS 181: The W-test for normality. <i>Appl Stat</i> 44:547–551.</li>
        </ul>
      </section>
    </div>
  )
}
