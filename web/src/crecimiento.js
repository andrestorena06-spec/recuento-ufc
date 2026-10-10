// ============================================================
// Parámetros de crecimiento a partir de series en el tiempo (UFC/mL u OD corregida).
// En la fase exponencial ln N crece en línea recta con el tiempo: ln N = ln N₀ + µ·t.
// ============================================================
import { finito, media, mco, resumen, tCuantil } from './estadistica.js'
import { calcularFila, esValor } from './ufc.js'
import { odCorregida } from './calibracion.js'
import { filaEnUso, tNum } from './modelo.js'

// Series por muestra: [{ t, z = log₁₀(valor), filaId }]; solo tiempos numéricos
export function seriesCrecimiento(filas, o) {
  const out = {}
  filas.filter(filaEnUso).forEach((f) => {
    const t = tNum(f.tiempo)
    if (!finito(t)) return
    const m = String(f.muestra ?? '').trim()
    const s = (out[m] ||= { ufc: [], od: [] })
    const r = calcularFila(f, o)
    if (esValor(r, o.incluirEstimados) && r.Nmadre > 0) s.ufc.push({ t, z: Math.log10(r.Nmadre), filaId: f.id })
    const oc = odCorregida(f, o)
    if (oc.od > 0) s.od.push({ t, z: Math.log10(oc.od), filaId: f.id })
  })
  return out
}

const regresion = (pts) => mco(pts.map((p) => [1, p.t]), pts.map((p) => p.z), null, true)

// Busca la fase exponencial: la ventana de tiempos consecutivos (≥ 3) con mayor pendiente de log₁₀
// frente al tiempo y buen ajuste lineal de las medias (R² ≥ 0,97); después la extiende mientras se mantenga
// recta (R² ≥ 0,97) y el tramo agregado tenga una pendiente de al menos el 85 % de la máxima.
// µ = pendiente × ln 10 (por unidad de tiempo), g = ln 2 / µ.
// Latencia λ: tiempo en que la recta de la fase exponencial corta el nivel inicial (método de la tangente).
export function parametrosCrecimiento(pts, minPts = 3) {
  const tiempos = [...new Set(pts.map((p) => p.t))].sort((a, b) => a - b)
  if (tiempos.length < minPts) return { error: `Hacen falta al menos ${minPts} tiempos con datos.` }
  const medias = tiempos.map((t) => ({ t, z: media(pts.filter((p) => p.t === t).map((p) => p.z)) }))
  const ajusteMedias = (i, j) => {
    const sub = medias.slice(i, j + 1)
    const f = regresion(sub)
    return f ? { b: f.beta[1], r2: sub.length > 2 ? f.r2 : 1 } : null
  }
  let mejor = null
  for (let i = 0; i + minPts - 1 < medias.length; i++) {
    const a = ajusteMedias(i, i + minPts - 1)
    if (a && a.b > 0 && a.r2 >= 0.97 && (!mejor || a.b > mejor.b)) mejor = { i, j: i + minPts - 1, ...a }
  }
  if (!mejor) {
    // sin tramo recto: se toma la ventana de mayor pendiente igualmente (se avisa)
    for (let i = 0; i + minPts - 1 < medias.length; i++) {
      const a = ajusteMedias(i, i + minPts - 1)
      if (a && a.b > 0 && (!mejor || a.b > mejor.b)) mejor = { i, j: i + minPts - 1, ...a, dudosa: true }
    }
    if (!mejor) return { error: 'No hay un tramo creciente: no se detecta fase exponencial.' }
  }
  const bmax = mejor.b
  let { i, j } = mejor
  let cambio = true
  while (cambio && !mejor.dudosa) {
    cambio = false
    for (const [ni, nj] of [[i - 1, j], [i, j + 1]]) {
      if (ni < 0 || nj >= medias.length) continue
      // el tramo que se agrega (entre el punto nuevo y su vecino) también tiene que ser empinado
      const [p, q] = ni < i ? [medias[ni], medias[i]] : [medias[j], medias[nj]]
      const local = (q.z - p.z) / (q.t - p.t)
      const a = ajusteMedias(ni, nj)
      if (a && a.r2 >= 0.97 && local >= 0.85 * bmax) { i = ni; j = nj; cambio = true; break }
    }
  }
  const t1 = medias[i].t, t2 = medias[j].t
  const enFase = pts.filter((p) => p.t >= t1 && p.t <= t2)
  const f = regresion(enFase.length > 2 ? enFase : medias.slice(i, j + 1))
  if (!f) return { error: 'No se pudo ajustar la fase exponencial.' }
  const b = f.beta[1], a = f.beta[0]
  const seB = f.se[1]
  const tc = finito(seB) && f.gl > 0 ? tCuantil(0.975, f.gl) : NaN
  const mu = b * Math.LN10
  const muIc = [(b - tc * seB) * Math.LN10, (b + tc * seB) * Math.LN10]
  const z0 = medias[0].z
  const lag = Math.max(0, (z0 - a) / b)
  const zmax = Math.max(...medias.map((m) => m.z))
  return {
    t1, t2, i, j, pendiente: b, ordenada: a, mu, muIc, g: Math.LN2 / mu, gIc: [Math.LN2 / muIc[1], Math.LN2 / muIc[0]],
    lag, z0, zmax, r2: f.r2, n: enFase.length, nTiempos: j - i + 1, dudosa: !!mejor.dudosa, medias,
    duplicaciones: (zmax - z0) / Math.log10(2),
  }
}

export const resumenTiempo = (pts) => {
  const tiempos = [...new Set(pts.map((p) => p.t))].sort((a, b) => a - b)
  return tiempos.map((t) => ({ t, ...resumen(pts.filter((p) => p.t === t).map((p) => p.z)) }))
}
