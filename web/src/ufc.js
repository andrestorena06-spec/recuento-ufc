// ============================================================
// Cálculo de UFC/mL a partir de recuentos en diluciones seriadas 1:10.
//
// Columna k (0 = sin diluir, 1 = 10⁻¹, …): cada placa recibe V mL de la suspensión
// diluida 10⁻ᵏ, es decir V·10⁻ᵏ mL de la suspensión de partida. Si la suspensión de
// partida ya era una dilución 1:F de la muestra madre, UFC/mL(madre) = UFC/mL × F.
//
// Estimador (ISO 7218 / FDA BAM cap. 3):  N = ΣC / Σ(V·10⁻ᵏ)  sobre las placas retenidas.
// Con una placa por dilución es la fórmula ΣC / [V·(n₁ + 0,1·n₂)·d]. Es además el estimador
// de máxima verosimilitud si los recuentos siguen una distribución de Poisson.
// ============================================================
import { icPoisson, pchisq, finito } from './estadistica.js'

export const RANGOS = [
  ['30-300', '30–300 (clásico, siembra en superficie)', 30, 300],
  ['25-250', '25–250 (FDA BAM / Standard Methods)', 25, 250],
  ['10-300', '10–300 (ISO 7218 / ISO 4833)', 10, 300],
  ['3-30', '3–30 por gota (microgota, Miles–Misra)', 3, 30],
  ['custom', 'Personalizado', null, null],
]

export const METODOS_UFC = [
  ['ponderada', 'Media ponderada de las diluciones en rango (ISO 7218 / BAM)'],
  ['una', 'Una sola dilución: la más cercana al centro del rango'],
  ['media', 'Media aritmética de las estimaciones de cada dilución en rango'],
]

export const INCONTABLE = 'INC'
// Interpreta lo que se escribe en una celda de recuento
export function leerConteo(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return finito(v) && v >= 0 ? Math.round(v) : null
  const s = String(v).trim().toUpperCase()
  if (s === '' || s === '-' || s === 'NA') return null
  if (['INC', 'MNPC', 'TNTC', 'INCONTABLE', '>300', '>250', 'X', '∞'].includes(s) || s.startsWith('>')) return INCONTABLE
  const n = Number(s.replace(',', '.'))
  return finito(n) && n >= 0 ? Math.round(n) : null
}

// Factor de dilución previa respecto de la muestra madre: "1", "10", "1:10", "1/100", "10^-2", "1e-2", "-2"
export function leerFactor(v) {
  if (v === null || v === undefined || String(v).trim() === '') return 1
  if (typeof v === 'number') return v > 0 ? (v < 1 ? 1 / v : v) : NaN
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.').replace(/×/g, 'x')
  let m = s.match(/^1[:/](\d+(\.\d+)?(e\d+)?)$/i)
  if (m) return Number(m[1])
  m = s.match(/^10\^(-?\d+(\.\d+)?)$/)
  if (m) { const e = Number(m[1]); return 10 ** Math.abs(e) }
  m = s.match(/^-(\d+(\.\d+)?)$/)   // "-2" = 10⁻²
  if (m) return 10 ** Number(m[1])
  const n = Number(s)
  if (!finito(n) || n <= 0) return NaN
  return n < 1 ? 1 / n : n
}

export const rangoDe = (o) => {
  const r = RANGOS.find((x) => x[0] === o.rango)
  if (!r || r[0] === 'custom') return [Number(o.min) || 0, Number(o.max) || Infinity]
  return [r[2], r[3]]
}

// Resultado de una fila (una réplica). conteos[k] = colonias en la columna k.
export function calcularFila(fila, o) {
  const [L, U] = rangoDe(o)
  const V = ((o.volFijo ? NaN : Number(fila.vol)) || Number(o.volDef) || 100) / 1000 // mL
  const F = leerFactor(fila.dprev)
  const placas = (fila.conteos || []).map((c, k) => ({ k, c: leerConteo(c), q: V * 10 ** -k })).filter((p) => p.c !== null)
  const avisos = []
  const out = { V, F, placas, avisos, estado: 'vacio', N: NaN, ic: [NaN, NaN], usadas: [], sumaC: NaN, sumaQ: NaN, pChi: NaN }
  if (!finito(F)) avisos.push('Dilución previa no válida')
  if (!placas.length) return terminar(out)

  // serie coherente: al diluir 10 veces el recuento no puede aumentar
  const num = placas.filter((p) => p.c !== INCONTABLE)
  for (let i = 1; i < num.length; i++) {
    if (num[i].c > num[i - 1].c && num[i - 1].c > 0) avisos.push(`El recuento aumenta de 10⁻${num[i - 1].k} a 10⁻${num[i].k}`)
  }
  placas.forEach((p, i) => {
    if (p.c !== INCONTABLE) return
    const posterior = placas.slice(0, i).find((x) => x.c !== INCONTABLE && x.c <= U)
    if (posterior) avisos.push(`Placa incontable en 10⁻${p.k} después de una contable en 10⁻${posterior.k}`)
  })

  const enRango = num.filter((p) => p.c >= L && p.c <= U)
  let usadas = []
  if (enRango.length) {
    out.estado = 'ok'
    if (o.metodo === 'una') {
      const centro = Math.sqrt(L * U)
      usadas = [enRango.reduce((a, b) => (Math.abs(Math.log(b.c / centro)) < Math.abs(Math.log(a.c / centro)) ? b : a))]
    } else {
      usadas = enRango
    }
  } else if (num.length && num.every((p) => p.c === 0) && !placas.some((p) => p.c === INCONTABLE)) {
    // ninguna colonia: por debajo del límite de detección de la placa menos diluida
    const p = num.reduce((a, b) => (b.q > a.q ? b : a))
    out.estado = 'bajoLD'
    out.N = 1 / p.q
    out.usadas = [p]
    out.sumaC = 0
    out.sumaQ = p.q
    out.ic = [0, icPoisson(0)[1] / p.q]
    avisos.push('Sin colonias: < límite de detección')
    return terminar(out)
  } else {
    const positivas = num.filter((p) => p.c > 0)
    if (!positivas.length) {
      // todo incontable (o incontable + ceros incoherentes)
      const inc = placas.filter((p) => p.c === INCONTABLE)
      const p = inc.reduce((a, b) => (b.q < a.q ? b : a))
      out.estado = 'sobreLC'
      out.N = U / p.q
      out.usadas = [p]
      avisos.push(`Todas las placas incontables: > ${U} colonias en la más diluida`)
      return terminar(out)
    }
    // la placa más cercana al rango (en escala log)
    const dist = (p) => (p.c < L ? Math.log(L / p.c) : Math.log(p.c / U))
    const p = positivas.reduce((a, b) => (dist(b) < dist(a) ? b : a))
    out.estado = p.c < L ? 'estBajo' : 'estAlto'
    usadas = [p]
    if (p.c < 4) avisos.push('Menos de 4 colonias: estimación muy imprecisa')
  }

  const sumaC = usadas.reduce((s, p) => s + p.c, 0)
  const sumaQ = usadas.reduce((s, p) => s + p.q, 0)
  out.usadas = usadas
  out.sumaC = sumaC
  out.sumaQ = sumaQ
  if (o.metodo === 'media' && usadas.length > 1) {
    out.N = usadas.reduce((s, p) => s + p.c / p.q, 0) / usadas.length
  } else {
    out.N = sumaC / sumaQ
  }
  const [a, b] = icPoisson(sumaC, 0.95)
  out.ic = [a / sumaQ, b / sumaQ]

  // consistencia entre diluciones: χ² de Poisson (índice de dispersión) con las placas usadas
  if (usadas.length > 1) {
    const Nml = sumaC / sumaQ
    const chi = usadas.reduce((s, p) => s + (p.c - Nml * p.q) ** 2 / (Nml * p.q), 0)
    out.chi = chi
    out.pChi = 1 - pchisq(chi, usadas.length - 1)
    if (out.pChi < 0.05) avisos.push(`Diluciones poco coherentes entre sí (χ² p ${fmtP(out.pChi)})`)
    for (let i = 1; i < usadas.length; i++) {
      const r = (usadas[i - 1].c / usadas[i].c) / 10 ** (usadas[i].k - usadas[i - 1].k - 1)
      out.razon = r
    }
  }
  return terminar(out)
}

function terminar(out) {
  const F = finito(out.F) ? out.F : NaN
  out.Nmadre = out.N * F
  out.icMadre = out.ic.map((x) => x * F)
  out.log = out.N > 0 ? Math.log10(out.N) : NaN
  out.logMadre = out.Nmadre > 0 ? Math.log10(out.Nmadre) : NaN
  out.dils = out.usadas.map((p) => p.k)
  return out
}

export const ESTADOS = {
  ok: ['En rango', 'ok'],
  estBajo: ['Estimado (bajo el rango)', 'est'],
  estAlto: ['Estimado (sobre el rango)', 'est'],
  bajoLD: ['< límite de detección', 'cens'],
  sobreLC: ['> límite superior', 'cens'],
  vacio: ['Sin datos', 'vacio'],
}
// un resultado entra en promedios y en la curva si es un valor (no un límite)
export const esValor = (r, incluirEstimados) => r.estado === 'ok' || (incluirEstimados && (r.estado === 'estBajo' || r.estado === 'estAlto'))

// ---------- formato ----------
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }
export const sup = (n) => String(n).split('').map((c) => SUP[c] ?? c).join('')
const SUB = '₀₁₂₃₄₅₆₇₈₉'
export const sub = (n) => String(n).replace(/\d/g, (d) => SUB[Number(d)])
export const nombreRep = (m, r) => m + sub(r)

// 2.35 × 10⁸
export function cient(x, d = 2) {
  if (!finito(x)) return '–'
  if (x === 0) return '0'
  const e = Math.floor(Math.log10(Math.abs(x)))
  if (e >= -2 && e < 4) return x.toFixed(Math.max(0, d - e))
  const m = x / 10 ** e
  return `${m.toFixed(d)} × 10${sup(e)}`
}
// misma cifra para Excel: 2.35E+08
export const cientExcel = (x, d = 3) => (finito(x) ? Number(x.toPrecision(d + 1)) : null)

export function textoResultado(r) {
  if (r.estado === 'vacio') return '–'
  if (r.estado === 'bajoLD') return `< ${cient(r.N)}`
  if (r.estado === 'sobreLC') return `> ${cient(r.N)}`
  return (r.estado === 'ok' ? '' : '≈ ') + cient(r.N)
}

// valor p para mostrar: "= 0.032" o "< 0.001"
export const fmtP = (p) => (!finito(p) ? '= NA' : p < 0.001 ? '< 0.001' : `= ${p.toPrecision(2)}`)
