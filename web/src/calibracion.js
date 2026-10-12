// ============================================================
// Correspondencia OD ↔ UFC/mL y curva de calibración.
// x = OD neta de la suspensión leída, y = UFC/mL de ESA suspensión.
// ============================================================
import { finito, media, desvio, mco, varAjuste, tCuantil, shapiroWilk, resumen, fCdf } from './estadistica.js'
import { calcularFila, esValor, leerFactor } from './ufc.js'
import { claveGrupo, etiquetaGrupo, filaEnUso, tNorm, tNum } from './modelo.js'

// OD de una fila: una lectura por dilución (od.lecturas[k] = OD de la dilución 10⁻ᵏ de la misma serie).
// OD neta = lectura − blanco (el de la fila o el general); con «lecturas ya corregidas por el blanco» el blanco es 0.
export function odDeFila(fila, o) {
  let bl = 0
  if (!o.blancoCorregido) bl = String(fila.od?.blanco ?? '').trim() !== '' ? Number(String(fila.od.blanco).replace(',', '.')) : Number(String(o.blancoOD ?? '').replace(',', '.')) || 0
  if (!finito(bl)) bl = 0
  const porDil = []
  ;(fila.od?.lecturas || []).forEach((v, k) => {
    const t = String(v ?? '').trim()
    if (t === '') return
    const crudo = Number(t.replace(',', '.'))
    if (finito(crudo)) porDil.push({ k, crudo, od: crudo - bl })
  })
  return { porDil, n: porDil.length, blanco: bl }
}

// Control de linealidad del fotómetro: en una serie 1:10 la OD debe bajar 10 veces por dilución.
// Pendiente común de log₁₀(OD) frente a k dentro de cada fila (esperada −1); usa OD > odMin.
export function linealidadOD(filas, o, odMin = 0.02) {
  let sxy = 0, sxx = 0, nFilas = 0, nPuntos = 0
  const cocientes = []
  filas.filter(filaEnUso).forEach((f) => {
    const p = odDeFila(f, o).porDil.filter((d) => d.od > odMin)
    for (let i = 1; i < p.length; i++) if (p[i].k === p[i - 1].k + 1) cocientes.push(p[i - 1].od / p[i].od)
    if (p.length < 2) return
    const km = media(p.map((d) => d.k)), zm = media(p.map((d) => Math.log10(d.od)))
    p.forEach((d) => { sxy += (d.k - km) * (Math.log10(d.od) - zm); sxx += (d.k - km) ** 2 })
    nFilas++; nPuntos += p.length
  })
  const pendiente = sxx > 0 ? sxy / sxx : NaN
  return { pendiente, factor: 10 ** -pendiente, nFilas, nPuntos, cocientes }
}

export const etiquetaK = (k) => (k === null || k === undefined ? '–' : k === 'corr' ? 'Corregida' : k === 0 ? 'Sin diluir' : `−${k}`)

const numero = (v, def) => { const n = Number(String(v ?? '').replace(',', '.')); return String(v ?? '').trim() !== '' && finito(n) ? n : def }
export const ventanaLineal = (o) => [numero(o.odLinMin, 0.1), numero(o.odLinMax, 0.8)]

// OD corregida de la muestra: se toman las lecturas que caen en la ventana lineal del fotómetro,
// cada una se lleva a la suspensión sin diluir (OD × 10ᵏ) y se promedian.
// Si ninguna cae en la ventana se usa la más cercana y se marca «fuera».
export function odCorregida(fila, o) {
  const d = odDeFila(fila, o)
  const [lo, hi] = ventanaLineal(o)
  let usadas = d.porDil.filter((x) => x.od >= lo && x.od <= hi)
  let fuera = false
  if (!usadas.length) {
    const pos = d.porDil.filter((x) => x.od > 0)
    if (pos.length) {
      const dist = (x) => (x.od < lo ? Math.log(lo / x.od) : Math.log(x.od / hi))
      usadas = [pos.reduce((a, b) => (dist(b) < dist(a) ? b : a))]
      fuera = true
    }
  }
  const vals = usadas.map((x) => x.od * 10 ** x.k)
  return { od: vals.length ? media(vals) : NaN, de: vals.length > 1 ? desvio(vals) : NaN, dils: usadas.map((x) => x.k), lecturas: d.porDil, fuera, n: d.porDil.length }
}

// Arma la tabla de correspondencia. Grupo = muestra en un tiempo.
// - o.puntos 'corregida' (por defecto): un punto por réplica, x = OD corregida, y = UFC/mL de la muestra.
// - o.puntos 'dilucion': cada lectura es un punto, x = OD neta de la dilución 10⁻ᵏ, y = UFC/mL de la muestra / 10ᵏ.
export function correspondencia(filasTodas, o) {
  const filas = filasTodas.filter(filaEnUso)
  const u = o.unidadTiempo || 'h'
  const ind = []
  filas.forEach((f) => {
    const r = calcularFila(f, o)
    const d = odDeFila(f, o)
    const base = {
      filaId: f.id, muestra: f.muestra, tiempo: tNorm(f.tiempo), t: tNum(f.tiempo), rep: f.rep,
      grupo: claveGrupo(f.muestra, f.tiempo), etiqueta: etiquetaGrupo(f.muestra, f.tiempo, u), r,
      origen: o.origenOD?.[f.muestra] || 'misma',
    }
    if (!d.porDil.length) { ind.push({ ...base, id: f.id + ':-', k: null, x: NaN, y: NaN, ic: [NaN, NaN], valido: false }); return }
    if (o.puntos !== 'dilucion') {
      // un punto por réplica: OD corregida de la muestra frente a UFC/mL de la muestra
      const oc = odCorregida(f, o)
      ind.push({
        ...base, id: f.id + ':corr', k: 'corr', x: oc.od, y: r.Nmadre, ic: r.icMadre, dilsOD: oc.dils, fueraVentana: oc.fuera,
        valido: esValor(r, o.incluirEstimados) && finito(oc.od) && finito(r.Nmadre),
      })
      return
    }
    d.porDil.forEach(({ k, od, crudo }) => {
      const y = r.Nmadre / 10 ** k
      ind.push({
        ...base, id: f.id + ':' + k, k, x: od, crudo, y, ic: r.icMadre.map((v) => v / 10 ** k),
        valido: esValor(r, o.incluirEstimados) && finito(od) && finito(y),
      })
    })
  })
  const grupos = [...new Set(ind.map((p) => p.grupo))]
  const muestras = [...new Set(ind.map((p) => p.muestra))]
  // promedios por grupo y dilución
  const claves = [...new Set(ind.filter((p) => p.k !== null).map((p) => p.grupo + '\u0001' + p.k))]
  const prom = claves.map((ck) => {
    const [gk, ks] = ck.split('\u0001')
    const k = ks === 'corr' ? 'corr' : Number(ks)
    const g = ind.filter((p) => p.grupo === gk && p.k === k)
    // para la OD se usan todas las réplicas con lectura; para las UFC solo las que dan un valor
    const ok = g.filter((p) => p.valido)
    const rx = resumen(g.map((p) => p.x).filter(finito))
    const ry = resumen(ok.map((p) => Math.log10(p.y)).filter(finito))
    return {
      id: 'g:' + gk + ':' + k, grupo: gk, k, muestra: g[0].muestra, tiempo: g[0].tiempo, t: g[0].t, etiqueta: g[0].etiqueta, rep: null,
      nOD: rx.n, nUFC: ry.n, x: rx.media, xde: rx.de,
      logMedia: ry.media, logDe: ry.de, logIc: ry.ic, y: 10 ** ry.media,
      yAritm: ok.length ? media(ok.map((p) => p.y)) : NaN,
      valido: rx.n > 0 && ry.n > 0, origen: g[0].origen,
    }
  })
  return { ind, prom, grupos, muestras }
}

// Puntos que entran en la curva según el modo. En modo individual, las muestras cuya OD viene
// de un cultivo paralelo (no de la misma suspensión) no se pueden emparejar réplica a réplica:
// aportan el promedio de cada tiempo y dilución.
export function puntosCurva(c, modo) {
  if (modo === 'promedio') return c.prom.filter((p) => p.valido).map((p) => ({ ...p, tipo: 'promedio' }))
  const out = []
  c.prom.forEach((pm) => {
    if (pm.origen === 'paralelo') {
      if (pm.valido) out.push({ ...pm, tipo: 'promedio' })
    } else {
      c.ind.filter((p) => p.grupo === pm.grupo && p.k === pm.k && p.valido).forEach((p) => out.push({ ...p, tipo: 'individual' }))
    }
  })
  return out
}

// ---------- Modelos ----------
export const MODELOS = {
  semilog: {
    nombre: 'Clásico: log₁₀ UFC = m·OD + b', corto: 'Clásico (semilog)', escala: 'semilog', k: 2, inter: true,
    X: (x) => [1, x], params: ['b (ordenada)', 'm (pendiente)'],
    ecuacion: (b) => `log₁₀(UFC/mL) = ${b[1].toFixed(4)} × OD ${b[0] < 0 ? '−' : '+'} ${Math.abs(b[0]).toFixed(4)}`,
  },  lineal: {
    nombre: 'Lineal: UFC = a + b·OD', corto: 'Lineal', escala: 'lin', k: 2, inter: true,
    X: (x) => [1, x], params: ['a (ordenada)', 'b (pendiente)'],
    ecuacion: (b) => `UFC/mL = ${c(b[0])} + ${c(b[1])} × OD`,
  },
  origen: {
    nombre: 'Proporcional: UFC = b·OD (por el origen)', corto: 'Proporcional', escala: 'lin', k: 1, inter: false,
    X: (x) => [x], params: ['b (UFC/mL por unidad de OD)'],
    ecuacion: (b) => `UFC/mL = ${c(b[0])} × OD`,
  },
  cuadratico: {
    nombre: 'Cuadrático por el origen: UFC = b₁·OD + b₂·OD²', corto: 'Cuadrático', escala: 'lin', k: 2, inter: false,
    X: (x) => [x, x * x], params: ['b₁ (lineal)', 'b₂ (curvatura)'],
    ecuacion: (b) => `UFC/mL = ${c(b[0])} × OD ${b[1] < 0 ? '−' : '+'} ${c(Math.abs(b[1]))} × OD²`,
  },
  loglog: {
    nombre: 'Potencia (log–log): log₁₀UFC = a + b·log₁₀OD', corto: 'Log–log', escala: 'loglog', k: 2, inter: true,
    X: (x) => [1, Math.log10(x)], params: ['a', 'b (exponente)'],
    ecuacion: (b) => `log₁₀(UFC/mL) = ${b[0].toFixed(4)} + ${b[1].toFixed(4)} × log₁₀(OD)   ⇔   UFC/mL = ${c(10 ** b[0])} × OD^${b[1].toFixed(3)}`,
    ecuacionCorta: (b) => `UFC/mL = ${c(10 ** b[0])} × OD^${b[1].toFixed(3)}`,
  },

}
function c(x) {
  if (!finito(x)) return 'NA'
  const e = Math.floor(Math.log10(Math.abs(x) || 1))
  return Math.abs(e) < 4 ? x.toPrecision(4) : `${(x / 10 ** e).toFixed(3)}×10^${e}`
}

// Ajusta un modelo. ponderacion: 'relativa' (1/y², error proporcional) | 'ninguna'
export function ajustar(puntos, modelo, ponderacion = 'relativa') {
  const M = MODELOS[modelo]
  const pts = puntos.filter((p) => finito(p.x) && finito(p.y) && p.y > 0 && (M.escala !== 'loglog' || p.x > 0))
  if (pts.length < M.k + 1) return { error: `Hacen falta al menos ${M.k + 1} puntos válidos (hay ${pts.length}).`, pts }
  const enLog = M.escala !== 'lin'
  const X = pts.map((p) => M.X(p.x))
  const y = pts.map((p) => (enLog ? Math.log10(p.y) : p.y))
  const w = !enLog && ponderacion === 'relativa' ? pts.map((p) => 1 / p.y ** 2) : null
  const f = mco(X, y, w, M.inter)
  if (!f) return { error: 'No se pudo ajustar el modelo (puntos colineales o insuficientes).', pts }

  const pred = (x) => {
    if (M.escala === 'loglog' && !(x > 0)) return NaN
    const z = M.X(x).reduce((s, v, j) => s + v * f.beta[j], 0)
    return enLog ? 10 ** z : z
  }
  // bandas al 95 %: confianza (de la curva media) y predicción (de una medición nueva)
  const banda = (x) => {
    if (M.escala === 'loglog' && !(x > 0)) return null
    const x0 = M.X(x)
    const z = x0.reduce((s, v, j) => s + v * f.beta[j], 0)
    const vc = varAjuste(f.cov, x0)
    if (enLog) {
      const sc = f.tcrit * Math.sqrt(vc), sp = f.tcrit * Math.sqrt(vc + f.sigma ** 2)
      return { y: 10 ** z, c: [10 ** (z - sc), 10 ** (z + sc)], p: [10 ** (z - sp), 10 ** (z + sp)] }
    }
    const varNueva = w ? f.sigma ** 2 * z * z : f.sigma ** 2
    const sc = f.tcrit * Math.sqrt(vc), sp = f.tcrit * Math.sqrt(vc + varNueva)
    return { y: z, c: [z - sc, z + sc], p: [z - sp, z + sp] }
  }
  // comparación entre modelos en una escala común: residuos en log₁₀(UFC)
  const resLog = pts.map((p) => { const yh = pred(p.x); return yh > 0 ? Math.log10(p.y) - Math.log10(yh) : NaN })
  const okLog = resLog.filter(finito)
  const n = okLog.length
  const ss = okLog.reduce((s, r) => s + r * r, 0)
  const k = M.k + 1 // + la varianza
  const aicc = n - k - 1 > 0 ? n * Math.log(ss / n) + 2 * k + (2 * k * (k + 1)) / (n - k - 1) : NaN
  const rmseLog = Math.sqrt(ss / Math.max(n, 1))
  const errRel = pts.map((p) => Math.abs(pred(p.x) - p.y) / p.y)
  // residuos que se grafican: en la escala del ajuste (ponderados = relativos)
  const resGraf = pts.map((p, i) => (enLog ? f.res[i] : w ? f.res[i] / p.y : f.res[i]))
  const sw = shapiroWilk(resGraf)
  return {
    modelo, M, f, pts, pred, banda, resLog, rmseLog, aicc, mape: 100 * media(errRel), sw, resGraf,
    escalaRes: enLog ? 'log₁₀(UFC/mL) observado − ajustado' : w ? 'residuo relativo (obs − ajust) / obs' : 'UFC/mL observado − ajustado',
  }
}

// OD que corresponde a un recuento dado (inversa numérica dentro de un rango de OD)
export function odParaUFC(aj, objetivo, maxOD) {
  if (!aj?.pred || !(objetivo > 0)) return NaN
  const hi0 = Math.max(maxOD * 3, 0.01)
  const N = 2000
  let prev = null
  for (let i = 1; i <= N; i++) {
    const x = (hi0 * i) / N
    const y = aj.pred(x)
    if (!finito(y)) { prev = null; continue }
    if (prev && (prev.y - objetivo) * (y - objetivo) <= 0) {
      let lo = prev.x, hi = x
      for (let j = 0; j < 80; j++) {
        const m = (lo + hi) / 2
        if ((aj.pred(lo) - objetivo) * (aj.pred(m) - objetivo) <= 0) hi = m; else lo = m
      }
      return (lo + hi) / 2
    }
    prev = { x, y }
  }
  return NaN
}

// Interpretación automática del ajuste
export function interpretar(ajustes, actual, puntos, lin, o = {}) {
  const out = []
  // ¿el modelo elegido está entre los mejores?
  const validos = Object.values(ajustes).filter((a) => a && !a.error && finito(a.aicc))
  if (actual && !actual.error && validos.length > 1) {
    const mejor = validos.reduce((x, y) => (y.aicc < x.aicc ? y : x))
    const d = actual.aicc - mejor.aicc
    out.push(d > 2
      ? ['aviso', `El modelo ${mejor.M.corto} ajusta claramente mejor que el elegido (ΔAICc = ${d.toFixed(1)}; error típico ${mejor.rmseLog.toFixed(3)} frente a ${actual.rmseLog.toFixed(3)} log₁₀). ${actual.modelo === 'semilog' ? 'La recta clásica supone que log UFC crece en línea recta con la OD, pero en el rango lineal la OD es proporcional al número de células, así que esa relación se curva: un R² alto puede esconderlo.' : ''} Considerá usar «${mejor.M.corto}» para predecir.`]
      : ['ok', `El modelo elegido está entre los que mejor ajustan (ΔAICc = ${d.toFixed(1)} respecto del mejor).`])
  }
  if (actual?.f) {
    const r2 = actual.f.r2
    out.push(r2 >= 0.95
      ? ['ok', `R² = ${r2.toFixed(3)} (≥ 0,95, el criterio habitual). El R² solo no prueba que el modelo sea correcto: revisá también los residuos.`]
      : ['aviso', `R² = ${r2.toFixed(3)}, por debajo de 0,95 (el criterio habitual). Revisá puntos atípicos, el rango de tiempo (¿incluye la fase estacionaria?) y el rango de OD.`])
  }
  const fuera = puntos.filter((p) => p.fueraVentana).length
  if (fuera) out.push(['aviso', `${fuera} ${fuera === 1 ? 'punto usa' : 'puntos usan'} una OD corregida sin ninguna lectura dentro de la ventana lineal (${(o.odLinMin ?? 0.1)}–${(o.odLinMax ?? 0.8)}): se tomó la lectura más cercana. Conviene leer otra dilución.`])
  if (lin && lin.nFilas > 0 && finito(lin.pendiente)) {
    const f = lin.factor
    out.push(f >= 8.5 && f <= 11.5
      ? ['ok', `Linealidad del fotómetro: entre diluciones sucesivas la OD baja ×${f.toFixed(1)} en promedio (esperado ×10; ${lin.nFilas} series). La respuesta es lineal en el rango leído.`]
      : ['aviso', `Linealidad del fotómetro: entre diluciones sucesivas la OD baja ×${f.toFixed(1)} en promedio (esperado ×10; ${lin.nFilas} series). ${f < 8.5 ? 'Baja menos de lo esperado: las lecturas más concentradas están saturadas (fuera del rango lineal) o las más diluidas están cerca del límite de detección.' : 'Baja más de lo esperado: revisá el blanco y las diluciones.'} Conviene limitar la curva al rango de OD en que el cociente es ≈ 10.`])
  }
  const reps = new Set(puntos.filter((p) => p.tipo === 'individual').map((p) => p.filaId))
  if (puntos.filter((p) => p.tipo === 'individual').length > reps.size) {
    out.push(['aviso', 'Varias diluciones de una misma réplica comparten el mismo recuento (sus UFC/mL son el recuento ÷ 10ᵏ), así que sus errores no son independientes. La curva es correcta, pero los intervalos de confianza resultan algo más estrechos de lo real: para una incertidumbre conservadora mirá la banda de predicción o usá el modo promedio.'])
  }
  const L = ajustes.lineal, Q = ajustes.cuadratico, P = ajustes.loglog
  if (L?.f) {
    const [lo, hi] = L.f.ic[0]
    out.push(lo <= 0 && hi >= 0
      ? ['ok', `En el modelo lineal la ordenada (a) no difiere de 0 (IC 95 % ${c(lo)} a ${c(hi)}): la relación es compatible con la proporcionalidad, y el factor de conversión del modelo proporcional es válido.`]
      : ['aviso', `En el modelo lineal la ordenada (a) difiere de 0 (IC 95 % ${c(lo)} a ${c(hi)}). Puede deberse a un blanco mal restado, a turbidez que no corresponde a células viables (células muertas, restos, agregados) o a que el rango incluye la zona no lineal.`])
  }
  if (Q?.f) {
    const p2 = Q.f.p[1]
    out.push(p2 < 0.05
      ? ['aviso', `El término cuadrático es significativo (p = ${p2.toPrecision(2)}): hay curvatura. ${Q.f.beta[1] > 0 ? 'Las UFC crecen más rápido que la OD: típico de la pérdida de linealidad de Beer–Lambert a OD altas (dispersión múltiple).' : 'Las UFC crecen más lento que la OD: puede haber agregados, filamentos, células no viables o placas sobrecargadas a OD alta.'} Conviene usar el modelo cuadrático o limitar la curva al rango lineal.`]
      : ['ok', `El término cuadrático no es significativo (p = ${finito(p2) ? p2.toPrecision(2) : 'NA'}): no hay evidencia de curvatura en este rango de OD.`])
  }
  if (P?.f) {
    const [lo, hi] = P.f.ic[1]
    out.push(lo <= 1 && hi >= 1
      ? ['ok', `El exponente log–log (${P.f.beta[1].toFixed(3)}, IC 95 % ${lo.toFixed(3)} a ${hi.toFixed(3)}) incluye 1: UFC ∝ OD.`]
      : ['aviso', `El exponente log–log (${P.f.beta[1].toFixed(3)}, IC 95 % ${lo.toFixed(3)} a ${hi.toFixed(3)}) no incluye 1: la relación no es proporcional en todo el rango.`])
  }
  const xs = puntos.map((p) => p.x).filter(finito)
  const altos = o.puntos === 'dilucion' ? xs.filter((x) => x > 1).length : 0
  if (altos) out.push(['aviso', `${altos} ${altos === 1 ? 'punto tiene' : 'puntos tienen'} OD > 1. En la mayoría de los espectrofotómetros la respuesta deja de ser lineal entre 0,4 y 1 (depende del equipo): para OD altas lo correcto es diluir y leer de nuevo.`])
  if (actual?.sw && finito(actual.sw.p)) {
    out.push(actual.sw.p < 0.05
      ? ['aviso', `Los residuos del modelo elegido no parecen normales (Shapiro–Wilk p = ${actual.sw.p.toPrecision(2)}): mirá el gráfico de residuos; puede haber un punto atípico o un modelo inadecuado.`]
      : ['ok', `Residuos compatibles con distribución normal (Shapiro–Wilk p = ${actual.sw.p.toPrecision(2)}).`])
  }
  if (xs.length) {
    const r = Math.max(...xs) / Math.max(Math.min(...xs.filter((x) => x > 0)), 1e-9)
    if (r < 5) out.push(['aviso', `El rango de OD es estrecho (máx./mín. = ${r.toFixed(1)}). Para una curva confiable conviene cubrir al menos un orden de magnitud con diluciones de la suspensión.`])
  }
  if (puntos.length < 5) out.push(['aviso', `Solo ${puntos.length} puntos: los intervalos son anchos y las pruebas tienen poca potencia. Lo habitual es 5–8 niveles de OD, cada uno por triplicado.`])
  return out
}

export const tParaN = (n) => tCuantil(0.975, n - 1)

// Puntos de la curva con el motivo por el que alguno queda fuera del ajuste
export function datosCurva(corr, o) {
  const todos = puntosCurva(corr, o.modo).map((p) => {
    const key = p.tipo === 'promedio' ? p.id : 'i:' + p.id
    const odMin = String(o.odMin ?? '').trim() === '' ? -Infinity : Number(o.odMin)
    const odMax = String(o.odMax ?? '').trim() === '' ? Infinity : Number(o.odMax)
    // rango de tiempo propio de la cepa (si se eligió con «Usar en la curva» en Crecimiento) o el general
    const rc = o.curvaPor !== 'comun' ? o.rangosCepa?.[p.muestra] : null
    const tMin = rc ? numero(rc[0], -Infinity) : numero(o.tMin, -Infinity)
    const tMax = rc ? numero(rc[1], Infinity) : numero(o.tMax, Infinity)
    let motivo = ''
    if (o.excluidos.includes(key)) motivo = 'Excluido a mano'
    else if ((tMin > -Infinity || tMax < Infinity) && !finito(p.t)) motivo = 'Sin tiempo numérico'
    else if (p.t < tMin) motivo = `Tiempo < ${tMin}`
    else if (p.t > tMax) motivo = `Tiempo > ${tMax}`
    else if (p.x < odMin) motivo = `OD < ${o.odMin}`
    else if (p.x > odMax) motivo = `OD > ${o.odMax}`
    else if (!(p.x > 0)) motivo = 'OD ≤ 0'
    return { ...p, key, motivo, usado: !motivo }
  })
  return { todos, usados: todos.filter((p) => p.usado) }
}

// Motivo por el que una fila no da un punto (para la tabla)
export function motivoSinPunto(p, o) {
  if (!finito(p.x)) return 'Sin OD'
  const e = p.r.estado
  if (e === 'vacio') return 'Sin recuento'
  if (e === 'bajoLD' || e === 'sobreLC') return 'Recuento fuera de los límites (< o >)'
  if ((e === 'estBajo' || e === 'estAlto') && !o.incluirEstimados) return 'Recuento estimado (fuera del rango contable)'
  if (!finito(p.y)) return 'Dilución no válida'
  return ''
}

// ¿Las cepas necesitan curvas distintas? Prueba F de suma de cuadrados extra (comparación de regresiones):
// modelo reducido = una curva común a todas; modelo completo = una curva por cepa (mismo modelo y ponderación).
// F = [(SSR_común − ΣSSR_cepa) / (gl_común − Σgl_cepa)] / (ΣSSR_cepa / Σgl_cepa)
export function compararCepas(comun, porCepa) {
  const sep = porCepa.filter((c) => c.aj && !c.aj.error)
  if (!comun || comun.error || sep.length < 2) return null
  const ssrS = sep.reduce((a, c) => a + c.aj.f.ssr, 0)
  const glS = sep.reduce((a, c) => a + c.aj.f.gl, 0)
  const ssrC = comun.f.ssr
  const glC = comun.f.gl
  const d1 = glC - glS
  if (d1 <= 0 || glS <= 0) return null
  const F = ((ssrC - ssrS) / d1) / (ssrS / glS)
  const p = 1 - fCdf(Math.max(F, 0), d1, glS)
  return { F, d1, d2: glS, p, cepas: sep.map((c) => c.muestra) }
}

// Ajuste completo (lo usan Curva, Tabla y Crecimiento).
// o.curvaPor 'cepa' (por defecto): una curva por cepa (columna Muestra); el detalle (modelos, residuos, calculadora)
// se muestra para la cepa elegida. o.curvaPor 'comun': una sola curva con todos los puntos.
export function analisisCurva(corr, filas, o) {
  const { todos, usados } = datosCurva(corr, o)
  const cepas = [...new Set(usados.map((p) => p.muestra))]
  const rango = (pts) => { const xs = pts.map((p) => p.x).filter(finito); return xs.length ? [Math.min(...xs), Math.max(...xs)] : [NaN, NaN] }
  const porCepa = cepas.map((m) => {
    const pts = usados.filter((p) => p.muestra === m)
    const a = ajustar(pts, o.modelo, o.ponderacion)
    const [xmin, xmax] = rango(pts)
    return { muestra: m, aj: a.error ? null : a, error: a.error, n: pts.length, xmin, xmax }
  })
  const ajComun = ajustar(usados, o.modelo, o.ponderacion)
  const comparacion = compararCepas(ajComun.error ? null : ajComun, porCepa)
  const separadas = o.curvaPor !== 'comun' && cepas.length > 1
  const detalle = separadas ? (cepas.includes(o.cepaDetalle) ? o.cepaDetalle : cepas[0]) : null
  const usadosDet = separadas ? usados.filter((p) => p.muestra === detalle) : usados
  const ajustes = Object.fromEntries(Object.keys(MODELOS).map((m) => [m, ajustar(usadosDet, m, o.ponderacion)]))
  const aj = ajustes[o.modelo] && !ajustes[o.modelo].error ? ajustes[o.modelo] : null
  const [xmin, xmax] = rango(usadosDet)
  return {
    todos, usados, usadosDet, ajustes, aj, error: ajustes[o.modelo]?.error, lin: linealidadOD(filas, o), xmin, xmax,
    separadas, detalle, cepas, porCepa, comparacion,
  }
}

// UFC/mL estimada con la curva para una fila (uso: filas con OD y sin recuento).
// En modo 'corregida' se usa la OD corregida; en modo 'dilucion', cada lectura dentro de la ventana
// se convierte con la curva y se lleva a la muestra (× 10ᵏ), y se promedia en log.
export function predecirFila(curva, fila, o) {
  // con una curva por cepa se usa la de la cepa de la fila (si no tiene, no se estima)
  const propia = curva?.separadas ? curva.porCepa.find((c) => c.muestra === fila.muestra) : null
  const aj = curva?.separadas ? propia?.aj : curva?.aj
  if (!aj) return null
  const xmin = propia ? propia.xmin : curva.xmin, xmax = propia ? propia.xmax : curva.xmax
  const lista = []
  if (o.puntos !== 'dilucion') {
    const oc = odCorregida(fila, o)
    if (finito(oc.od)) lista.push({ x: oc.od, k: 0 })
  } else {
    const [lo, hi] = ventanaLineal(o)
    const d = odDeFila(fila, o)
    let ls = d.porDil.filter((x) => x.od >= lo && x.od <= hi)
    if (!ls.length) ls = d.porDil.filter((x) => x.od > 0).slice(0, 1)
    ls.forEach((x) => lista.push({ x: x.od, k: x.k }))
  }
  const res = lista.map(({ x, k }) => ({ b: aj.banda(x), k, x })).filter((r) => r.b && r.b.y > 0)
  if (!res.length) return null
  const lg = (v) => Math.log10(Math.max(v, 1e-300))
  const m = (f) => 10 ** media(res.map((r) => lg(f(r)) + r.k))
  const extrapola = res.some((r) => r.x < xmin || r.x > xmax)
  return { y: m((r) => r.b.y), p: [m((r) => Math.max(r.b.p[0], 1e-300)), m((r) => r.b.p[1])], x: res[0].x, extrapola }
}

// Tabla final por muestra y tiempo: OD corregida (media ± DE) y UFC/mL (media geométrica, log₁₀ ± DE).
// Si un grupo no tiene recuentos válidos pero sí OD, se agrega la UFC/mL estimada con la curva.
export function resumenPorTiempo(filasTodas, o, curva) {
  const filas = filasTodas.filter(filaEnUso)
  const u = o.unidadTiempo || 'h'
  const grupos = [...new Set(filas.map((f) => claveGrupo(f.muestra, f.tiempo)))]
  return grupos.map((g) => {
    const fs = filas.filter((f) => claveGrupo(f.muestra, f.tiempo) === g)
    const ods = fs.map((f) => odCorregida(f, o)).filter((x) => finito(x.od))
    const rs = fs.map((f) => calcularFila(f, o)).filter((r) => esValor(r, o.incluirEstimados) && r.Nmadre > 0)
    const rx = resumen(ods.map((x) => x.od))
    const ry = resumen(rs.map((r) => Math.log10(r.Nmadre)))
    let pred = null
    if (!ry.n) {
      const ps = fs.map((f) => predecirFila(curva, f, o)).filter(Boolean)
      if (ps.length) pred = { y: 10 ** media(ps.map((p) => Math.log10(p.y))), n: ps.length, extrapola: ps.some((p) => p.extrapola) }
    }
    return {
      grupo: g, muestra: fs[0].muestra, tiempo: tNorm(fs[0].tiempo), t: tNum(fs[0].tiempo), etiqueta: etiquetaGrupo(fs[0].muestra, fs[0].tiempo, u),
      nOD: rx.n, od: rx.media, odDe: rx.de, fueraVentana: ods.some((x) => x.fuera),
      nUFC: ry.n, logMedia: ry.media, logDe: ry.de, geo: 10 ** ry.media, pred,
    }
  }).sort((a, b) => {
    // por muestra (en el orden en que aparecen) y por tiempo
    const ma = filas.findIndex((f) => f.muestra === a.muestra), mb = filas.findIndex((f) => f.muestra === b.muestra)
    if (ma !== mb) return ma - mb
    return (finito(a.t) ? a.t : Infinity) - (finito(b.t) ? b.t : Infinity)
  })
}

// Filas con OD pero sin un recuento válido: UFC/mL estimada con la curva
export function predicciones(filasTodas, o, curva) {
  return filasTodas.filter(filaEnUso).map((f) => {
    const r = calcularFila(f, o)
    if (esValor(r, o.incluirEstimados)) return null
    const p = predecirFila(curva, f, o)
    if (!p) return null
    return { fila: f, r, p, etiqueta: etiquetaGrupo(f.muestra, f.tiempo, o.unidadTiempo || 'h'), t: tNum(f.tiempo) }
  }).filter(Boolean)
}
