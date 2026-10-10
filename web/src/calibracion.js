// ============================================================
// Correspondencia OD ↔ UFC/mL y curva de calibración.
// x = OD neta de la suspensión leída, y = UFC/mL de ESA suspensión.
// ============================================================
import { finito, media, desvio, mco, varAjuste, tCuantil, shapiroWilk, resumen } from './estadistica.js'
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

export const etiquetaK = (k) => (k === null || k === undefined ? '–' : k === 0 ? 'Sin diluir' : `−${k}`)

// Arma la tabla de correspondencia. Cada lectura de OD es un punto: x = OD neta de la dilución 10⁻ᵏ,
// y = UFC/mL de esa dilución = UFC/mL de la muestra / 10ᵏ. Grupo = muestra en un tiempo.
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
    const k = Number(ks)
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
  lineal: {
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
  },
  semilog: {
    nombre: 'Semilog: log₁₀UFC = a + b·OD', corto: 'Semilog', escala: 'semilog', k: 2, inter: true,
    X: (x) => [1, x], params: ['a', 'b'],
    ecuacion: (b) => `log₁₀(UFC/mL) = ${b[0].toFixed(4)} + ${b[1].toFixed(4)} × OD`,
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
export function interpretar(ajustes, actual, puntos, lin) {
  const out = []
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
  const altos = xs.filter((x) => x > 1).length
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
    let motivo = ''
    if (o.excluidos.includes(key)) motivo = 'Excluido a mano'
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
