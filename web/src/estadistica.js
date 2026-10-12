// ============================================================
// Funciones estadísticas (sin dependencias). Verificadas contra R:
// qt, pt, qchisq, pchisq, poisson.test, lm y lm(weights = ...).
// ============================================================

export const finito = Number.isFinite
export const media = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN)
export const varianza = (v) => {
  if (v.length < 2) return NaN
  const m = media(v)
  return v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)
}
export const desvio = (v) => Math.sqrt(varianza(v))

// ---------- Funciones gamma y beta ----------
// log Γ(z) (Lanczos, g = 7, error < 1e-14)
const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]
export function lgamma(z) {
  if (z < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * z))) - lgamma(1 - z)
  z -= 1
  let x = LANCZOS[0]
  for (let i = 1; i < 9; i++) x += LANCZOS[i] / (z + i)
  const t = z + 7.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}

// Gamma incompleta regularizada inferior P(a, x)
export function gammaP(a, x) {
  if (x <= 0) return 0
  if (!finito(x)) return 1
  const lpre = -x + a * Math.log(x) - lgamma(a)
  if (x < a + 1) {
    let ap = a, sum = 1 / a, del = sum
    for (let n = 0; n < 100000; n++) {
      ap += 1; del *= x / ap; sum += del
      if (Math.abs(del) < Math.abs(sum) * 1e-15) break
    }
    return Math.min(1, sum * Math.exp(lpre))
  }
  // fracción continua (Lentz) para Q(a, x)
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d
  for (let i = 1; i < 100000; i++) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-15) break
  }
  return Math.max(0, 1 - Math.exp(lpre) * h)
}

// Cuantil de la gamma(a, 1) por bisección
function qgamma(p, a) {
  if (p <= 0) return 0
  let lo = 0, hi = a + 50 * Math.sqrt(a) + 100
  while (gammaP(a, hi) < p) hi *= 2
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (gammaP(a, mid) < p) lo = mid; else hi = mid
    if (hi - lo < 1e-12 * Math.max(1, hi)) break
  }
  return (lo + hi) / 2
}
// pchisq y qchisq de R
export const pchisq = (x, df) => gammaP(df / 2, x / 2)
export const qchisq = (p, df) => 2 * qgamma(p, df / 2)

// Beta incompleta regularizada (para la t de Student y la F)
function betacf(a, b, x) {
  const qab = a + b, qap = a + 1, qam = a - 1
  let c = 1, d = 1 - (qab * x) / qap
  if (Math.abs(d) < 1e-300) d = 1e-300
  d = 1 / d
  let h = d
  for (let m = 1; m <= 10000; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300
    c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300
    d = 1 / d; h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300
    c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-15) break
  }
  return h
}
export function betaInc(x, a, b) {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b
}
// pf de R (cola inferior): distribución F con d1 y d2 grados de libertad
export const fCdf = (x, d1, d2) => (x <= 0 ? 0 : betaInc((d1 * x) / (d1 * x + d2), d1 / 2, d2 / 2))
// pt de R (cola inferior)
export const tCdf = (t, df) => {
  const p = 0.5 * betaInc(df / (df + t * t), df / 2, 0.5)
  return t > 0 ? 1 - p : p
}
// qt de R
export function tCuantil(p, df) {
  if (!(df > 0)) return NaN
  if (p === 0.5) return 0
  if (p < 0.5) return -tCuantil(1 - p, df)
  let lo = 0, hi = 10
  while (tCdf(hi, df) < p) hi *= 2
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (tCdf(mid, df) < p) lo = mid; else hi = mid
    if (hi - lo < 1e-12) break
  }
  return (lo + hi) / 2
}
// valor p bilateral de un estadístico t
export const pT2 = (t, df) => (finito(t) && df > 0 ? 2 * (1 - tCdf(Math.abs(t), df)) : NaN)

// ---------- Poisson ----------
// IC exacto de Garwood (1936) para la media de una Poisson con x eventos observados.
// Equivale a poisson.test(x)$conf.int de R.
export function icPoisson(x, conf = 0.95) {
  const a = 1 - conf
  const lo = x === 0 ? 0 : qchisq(a / 2, 2 * x) / 2
  const hi = qchisq(1 - a / 2, 2 * (x + 1)) / 2
  return [lo, hi]
}

// ---------- Resumen de un grupo ----------
export function resumen(v, conf = 0.95) {
  const x = v.filter(finito)
  const n = x.length
  const m = media(x)
  const s = n > 1 ? desvio(x) : NaN
  const sem = n > 1 ? s / Math.sqrt(n) : NaN
  const t = n > 1 ? tCuantil(1 - (1 - conf) / 2, n - 1) : NaN
  return { n, media: m, de: s, sem, ic: t * sem, cv: 100 * s / m, min: n ? Math.min(...x) : NaN, max: n ? Math.max(...x) : NaN }
}

// ---------- Álgebra lineal mínima ----------
function invertir(A) {
  const n = A.length
  const M = A.map((f, i) => [...f, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    if (Math.abs(M[p][c]) < 1e-300) return null
    ;[M[c], M[p]] = [M[p], M[c]]
    const piv = M[c][c]
    for (let j = 0; j < 2 * n; j++) M[c][j] /= piv
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = M[r][c]
      if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]
    }
  }
  return M.map((f) => f.slice(n))
}

// Mínimos cuadrados (ponderados si se dan pesos). X: filas de regresores, y: respuesta.
// Devuelve coeficientes, errores estándar, matriz de covarianza, sigma y R² (como lm de R).
export function mco(X, y, w = null, conIntercepto = true) {
  const n = y.length
  const p = X[0]?.length || 0
  const W = w || y.map(() => 1)
  if (n <= p) return null
  const XtWX = Array.from({ length: p }, () => Array(p).fill(0))
  const XtWy = Array(p).fill(0)
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < p; a++) {
      XtWy[a] += W[i] * X[i][a] * y[i]
      for (let b = 0; b < p; b++) XtWX[a][b] += W[i] * X[i][a] * X[i][b]
    }
  }
  const inv = invertir(XtWX)
  if (!inv) return null
  const beta = inv.map((f) => f.reduce((s, v, j) => s + v * XtWy[j], 0))
  const ajus = X.map((f) => f.reduce((s, v, j) => s + v * beta[j], 0))
  const res = y.map((v, i) => v - ajus[i])
  const gl = n - p
  const ssr = res.reduce((s, r, i) => s + W[i] * r * r, 0)
  const sigma2 = ssr / gl
  const cov = inv.map((f) => f.map((v) => v * sigma2))
  const se = beta.map((_, i) => Math.sqrt(cov[i][i]))
  // R² como lm de R: con intercepto respecto de la media (ponderada); sin intercepto respecto de 0
  const sw = W.reduce((s, v) => s + v, 0)
  const ym = conIntercepto ? W.reduce((s, v, i) => s + v * y[i], 0) / sw : 0
  const sst = y.reduce((s, v, i) => s + W[i] * (v - ym) ** 2, 0)
  const r2 = 1 - ssr / sst
  const dfm = conIntercepto ? p - 1 : p
  const r2aj = 1 - (1 - r2) * (n - (conIntercepto ? 1 : 0)) / gl
  const tcrit = tCuantil(0.975, gl)
  return {
    beta, se, cov, sigma: Math.sqrt(sigma2), gl, n, r2, r2aj, ajus, res, ssr, dfm,
    t: beta.map((b, i) => b / se[i]),
    p: beta.map((b, i) => pT2(b / se[i], gl)),
    ic: beta.map((b, i) => [b - tcrit * se[i], b + tcrit * se[i]]),
    tcrit,
  }
}

// varianza de la recta ajustada en un punto x0 (vector de regresores)
export const varAjuste = (cov, x0) => x0.reduce((s, a, i) => s + x0.reduce((t, b, j) => t + a * cov[i][j] * b, 0), 0)

// Normalidad de los residuos: prueba de Shapiro–Wilk (algoritmo AS R94 de Royston, 1995; n de 3 a 5000)
export function shapiroWilk(x0) {
  const x = x0.filter(finito).sort((a, b) => a - b)
  const n = x.length
  if (n < 3) return { w: NaN, p: NaN }
  const rango = x[n - 1] - x[0]
  if (rango < 1e-300) return { w: NaN, p: NaN }
  const nn2 = Math.floor(n / 2)
  const m = Array.from({ length: nn2 }, (_, i) => qnorm((i + 1 - 0.375) / (n + 0.25)))
  const summ2 = 2 * m.reduce((s, v) => s + v * v, 0)
  const ssumm2 = Math.sqrt(summ2)
  const rsn = 1 / Math.sqrt(n)
  const poly = (c, z) => c.reduce((s, v, i) => s + v * z ** i, 0)
  const a = Array(nn2)
  if (n === 3) {
    a[0] = Math.SQRT1_2
  } else {
    const a1 = poly([0, 0.221157, -0.147981, -2.071190, 4.434685, -2.706056], rsn) - m[0] / ssumm2
    let i1, fac
    if (n > 5) {
      i1 = 2
      const a2 = -m[1] / ssumm2 + poly([0, 0.042981, -0.293762, -1.752461, 5.682633, -3.582633], rsn)
      fac = Math.sqrt((summ2 - 2 * m[0] ** 2 - 2 * m[1] ** 2) / (1 - 2 * a1 ** 2 - 2 * a2 ** 2))
      a[1] = a2
    } else {
      i1 = 1
      fac = Math.sqrt((summ2 - 2 * m[0] ** 2) / (1 - 2 * a1 ** 2))
    }
    a[0] = a1
    for (let i = i1; i < nn2; i++) a[i] = -m[i] / fac
  }
  // W
  let num = 0
  for (let i = 0; i < nn2; i++) num += a[i] * (x[n - 1 - i] - x[i])
  const mx = media(x)
  const den = x.reduce((s, v) => s + (v - mx) ** 2, 0)
  const w = Math.min(1, (num * num) / den)
  if (n === 3) {
    const p = Math.max(0, (6 / Math.PI) * (Math.asin(Math.sqrt(w)) - Math.asin(Math.sqrt(0.75))))
    return { w, p }
  }
  const w1 = Math.log(1 - w)
  let m1, s1, y
  if (n <= 11) {
    const gamma = poly([-2.273, 0.459], n)
    if (w1 >= gamma) return { w, p: 1e-99 }
    y = -Math.log(gamma - w1)
    m1 = poly([0.544, -0.39978, 0.025054, -6.714e-4], n)
    s1 = Math.exp(poly([1.3822, -0.77857, 0.062767, -0.0020322], n))
  } else {
    const xx = Math.log(n)
    y = w1
    m1 = poly([-1.5861, -0.31082, -0.083751, 0.0038915], xx)
    s1 = Math.exp(poly([-0.4803, -0.082676, 0.0030302], xx))
  }
  return { w, p: 1 - pnorm((y - m1) / s1) }
}

// Normal estándar
export function pnorm(z) {
  // Cody (precisión ~1e-15) vía erfc
  const t = Math.abs(z) / Math.SQRT2
  const r = erfc(t) / 2
  return z > 0 ? 1 - r : r
}
function erfc(x) {
  // Numerical Recipes erfcc con corrección (error < 1.2e-7) refinada por serie para x chico
  if (x < 0.5) {
    let s = x, term = x
    for (let n = 1; n < 60; n++) { term *= -x * x / n; s += term / (2 * n + 1) }
    return 1 - (2 / Math.sqrt(Math.PI)) * s
  }
  // fracción continua de Lentz para erfc
  let b = x * x + 0.5, c = 1e300, d = 1 / b, h = d
  for (let i = 1; i < 300; i++) {
    const an = -i * (i - 0.5)
    b += 2
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 1e-16) break
  }
  return (x * Math.exp(-x * x) / Math.sqrt(Math.PI)) * h
}
export function qnorm(p) {
  // Acklam + un paso de Newton
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239]
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572]
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416]
  let q, r, x
  if (p < 0.02425) {
    q = Math.sqrt(-2 * Math.log(p))
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  } else if (p > 1 - 0.02425) {
    q = Math.sqrt(-2 * Math.log(1 - p))
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  } else {
    q = p - 0.5; r = q * q
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  }
  const e = pnorm(x) - p
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2)
  return x - u / (1 + (x * u) / 2)
}
