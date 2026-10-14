// ============================================================
// Desarrollo paso a paso de cada cálculo, con los números reales.
// Cada función devuelve { titulo, pasos: [[izquierda, derecha]], nota }.
// Un paso con derecha undefined es un renglón de texto.
// ============================================================
import { cient, factorDe, sup } from './ufc.js'
import { finito, icPoisson, media, desvio, tCuantil } from './estadistica.js'

const n3 = (x, d = 3) => (finito(x) ? Number(x.toFixed(d)).toString() : '–')
const pot = (k, F = 10) => (k === 0 ? 'sin diluir' : `${F}${sup(-k)}`)
const mul = (k, F = 10) => `${F}${sup(k)}`
const V = (v) => `${n3(v, 4)} mL`

export function dUFC(r) {
  if (!r || r.estado === 'vacio') return null
  const F = r.Fd || 10
  if (r.estado === 'bajoLD') {
    const p = r.usadas[0]
    return {
      titulo: 'UFC/mL: menor que el límite de detección',
      pasos: [['Ninguna placa tiene colonias.'], ['Límite', `1 colonia / (V × ${F}⁻ᵏ) de la placa menos diluida`],
        ['', `= 1 / (${V(r.V)} × ${pot(p.k, F)})`], ['', `= ${cient(r.N)} UFC/mL`], ['Resultado', `< ${cient(r.N)} UFC/mL`]],
    }
  }
  if (r.estado === 'sobreLC') {
    const p = r.usadas[0]
    return {
      titulo: 'UFC/mL: mayor que el límite superior',
      pasos: [['Todas las placas son incontables.'], ['Límite', `máximo contable / (V × ${F}⁻ᵏ) de la placa más diluida`],
        ['', `= ${n3(r.N * r.V * F ** -p.k, 0)} / (${V(r.V)} × ${pot(p.k, F)})`], ['Resultado', `> ${cient(r.N)} UFC/mL`]],
    }
  }
  const us = r.usadas
  const pasos = [['Placas usadas', us.map((p) => `${pot(p.k, F)}: ${p.c} col.`).join(' · ')]]
  if (F !== 10) pasos.push(['Diluciones', `seriadas 1:${F} (la columna −k es ${F}⁻ᵏ)`])
  if (us.length === 1) {
    const p = us[0]
    pasos.push(['UFC/mL', `C × ${F}ᵏ / V`], ['', `= ${p.c} × ${mul(p.k, F)} / ${V(r.V)}`], ['', `= ${cient(r.N)} UFC/mL`])
  } else if (r.N !== r.sumaC / r.sumaQ) {
    // media aritmética de las estimaciones de cada placa
    pasos.push(['UFC/mL', `media( Cᵢ × ${F}ᵏ / V )`])
    us.forEach((p) => pasos.push([pot(p.k, F), `${p.c} × ${mul(p.k, F)} / ${V(r.V)} = ${cient(p.c / p.q)}`]))
    pasos.push(['Media', `= ${cient(r.N)} UFC/mL`])
  } else {
    pasos.push(['UFC/mL', `ΣC / Σ(V × ${F}⁻ᵏ)`],
      ['', `= (${us.map((p) => p.c).join(' + ')}) / (${us.map((p) => `${n3(r.V, 4)} × ${pot(p.k, F)}`).join(' + ')})`],
      ['', `= ${r.sumaC} / ${cient(r.sumaQ, 3)} mL`], ['', `= ${cient(r.N)} UFC/mL`])
  }
  if (r.estado === 'estBajo' || r.estado === 'estAlto') pasos.push([`Estimado: ninguna placa en el rango contable (${r.estado === 'estBajo' ? 'por debajo' : 'por encima'}).`])
  if (finito(r.pChi)) pasos.push(['Coherencia χ²', `p ${r.pChi < 0.001 ? '< 0.001' : '= ' + r.pChi.toPrecision(2)} (p < 0,05: las diluciones no bajan ×${F})`])
  return { titulo: 'Cálculo de UFC/mL', pasos }
}

export function dIC(r) {
  if (!r || !finito(r.sumaC) || !finito(r.ic?.[0]) || r.estado === 'bajoLD' || r.estado === 'sobreLC') return null
  const [lo, hi] = icPoisson(r.sumaC)
  return {
    titulo: 'IC 95 % del recuento (Poisson exacto, Garwood)',
    pasos: [['ΣC (colonias usadas)', `${r.sumaC}`],
      ['λ inferior', `χ²(0,025; ${2 * r.sumaC}) / 2 = ${n3(lo, 2)}`],
      ['λ superior', `χ²(0,975; ${2 * r.sumaC + 2}) / 2 = ${n3(hi, 2)}`],
      [`Σ(V × ${r.Fd || 10}⁻ᵏ)`, `${cient(r.sumaQ, 3)} mL`],
      ['IC 95 %', `[${n3(lo, 2)} ; ${n3(hi, 2)}] / ${cient(r.sumaQ, 3)}`],
      ['', `= ${cient(r.ic[0])} a ${cient(r.ic[1])} UFC/mL`]],
    nota: 'Refleja solo el error de conteo (Poisson); el de pipeteo se ve en la variación entre réplicas.',
  }
}

export function dODCorr(oc, o, ventana) {
  if (!oc || !finito(oc.od)) return null
  const usadas = oc.lecturas.filter((x) => oc.dils.includes(x.k))
  const F = factorDe(o)
  const pasos = [['Ventana lineal', `${ventana[0]} a ${ventana[1]}`]]
  oc.lecturas.forEach((x) => pasos.push([x.k === 0 ? 'Sin diluir' : `−${x.k}`, `${o.blancoCorregido || x.crudo === x.od ? '' : `${n3(x.crudo, 4)} − ${n3(x.crudo - x.od, 4)} (blanco) = `}${n3(x.od, 4)}${oc.dils.includes(x.k) ? '  ✓ usada' : '  · fuera'}`]))
  pasos.push(['OD corregida', `media( OD netaₖ × ${F}ᵏ )`],
    ['', `= ${usadas.length > 1 ? '(' : ''}${usadas.map((x) => `${n3(x.od, 4)} × ${mul(x.k, F)}`).join(' + ')}${usadas.length > 1 ? `) / ${usadas.length}` : ''}`],
    ['', `= ${n3(oc.od, 4)}`])
  if (oc.fuera) pasos.push(['Ninguna lectura cayó en la ventana: se usó la más cercana.'])
  return { titulo: 'Cálculo de la OD corregida', pasos }
}

export function dCociente(a, b, F = 10) {
  return { titulo: 'Linealidad entre diluciones', pasos: [['Cociente', `OD(−${a.k}) / OD(−${b.k})`], ['', `= ${n3(a.od, 4)} / ${n3(b.od, 4)}`], ['', `= ${n3(a.od / b.od, 2)}  (esperado ≈ ${F})`]] }
}

// media geométrica a partir de los log₁₀ de las réplicas
export function dMediaGeo(logs) {
  const x = logs.filter(finito)
  if (!x.length) return null
  const m = media(x)
  return {
    titulo: 'Media geométrica de UFC/mL',
    pasos: [['log₁₀ de cada réplica', x.map((v) => n3(v)).join(' · ')],
      ['x̄', `(${x.map((v) => n3(v)).join(' + ')}) / ${x.length}`], ['', `= ${n3(m, 4)}`],
      ['Media geométrica', `10^${n3(m, 4)} = ${cient(10 ** m)} UFC/mL`]],
  }
}

export function dDE(valores, titulo = 'Desviación estándar', d = 3) {
  const x = valores.filter(finito)
  if (x.length < 2) return null
  const m = media(x)
  const ss = x.reduce((a, v) => a + (v - m) ** 2, 0)
  return {
    titulo,
    pasos: [['Valores', x.map((v) => n3(v, d + 1)).join(' · ')], ['Media x̄', n3(m, d + 1)],
      ['Σ(xᵢ − x̄)²', `${x.map((v) => `(${n3(v - m, d + 1)})²`).join(' + ')} = ${ss.toPrecision(4)}`],
      ['DE', `√( ${ss.toPrecision(4)} / (${x.length} − 1) ) = ${n3(desvio(x), d + 1)}`]],
  }
}

export function dCV(valores, enLog = false) {
  const x = valores.filter(finito)
  if (x.length < 2) return null
  const v = enLog ? x.map((z) => 10 ** z) : x
  const m = media(v), s = desvio(v)
  return {
    titulo: 'Coeficiente de variación',
    pasos: [['Media', enLog ? cient(m) : n3(m, 4)], ['DE', enLog ? cient(s) : n3(s, 4)], ['CV %', `100 × ${enLog ? cient(s) : n3(s, 4)} / ${enLog ? cient(m) : n3(m, 4)} = ${n3(100 * s / m, 1)} %`]],
    nota: enLog ? 'Sobre los valores de UFC/mL (no sobre los log).' : undefined,
  }
}

export function dICMedia(logs) {
  const x = logs.filter(finito)
  if (x.length < 2) return null
  const m = media(x), s = desvio(x), n = x.length, t = tCuantil(0.975, n - 1), h = t * s / Math.sqrt(n)
  return {
    titulo: 'IC 95 % de la media',
    pasos: [['x̄ (log₁₀)', n3(m, 4)], ['DE (log₁₀)', n3(s, 4)], ['t(0,975; ' + (n - 1) + ')', n3(t, 3)],
      ['Semiamplitud', `${n3(t, 3)} × ${n3(s, 4)} / √${n} = ${n3(h, 4)}`],
      ['IC (log₁₀)', `${n3(m - h, 4)} a ${n3(m + h, 4)}`], ['IC (UFC/mL)', `${cient(10 ** (m - h))} a ${cient(10 ** (m + h))}`]],
  }
}

export function dMu(p, u) {
  if (!p || p.error) return null
  return {
    titulo: 'Tasa específica de crecimiento µ',
    pasos: [['Fase exponencial', `${p.t1} a ${p.t2} ${u} (${p.n} puntos)`],
      ['Recta ajustada', `log₁₀ = ${n3(p.ordenada, 4)} + ${n3(p.pendiente, 4)} × t`],
      ['µ', `pendiente × ln 10 = ${n3(p.pendiente, 4)} × 2.3026`], ['', `= ${n3(p.mu, 4)} /${u}`],
      ['IC 95 %', finito(p.muIc[0]) ? `${n3(p.muIc[0], 3)} a ${n3(p.muIc[1], 3)} /${u}` : '–']],
  }
}

export function dG(p, u) {
  if (!p || p.error) return null
  return { titulo: 'Tiempo de generación', pasos: [['g', 'ln 2 / µ'], ['', `= 0.6931 / ${n3(p.mu, 4)}`], ['', `= ${n3(p.g, 3)} ${u}${u === 'h' ? ` = ${n3(p.g * 60, 1)} min` : ''}`]] }
}

export function dLag(p, u) {
  if (!p || p.error) return null
  return {
    titulo: 'Latencia (método de la tangente)',
    pasos: [['Nivel inicial log₁₀ N₀', `${n3(p.z0, 3)} (media del primer tiempo)`], ['Recta exponencial', `${n3(p.ordenada, 4)} + ${n3(p.pendiente, 4)} × t`],
      ['λ', '(log₁₀ N₀ − a) / b'], ['', `= (${n3(p.z0, 3)} − ${n3(p.ordenada, 4)}) / ${n3(p.pendiente, 4)}`], ['', `= ${n3(p.lag, 3)} ${u}`]],
    nota: 'Si da negativo se informa 0 (no hay latencia apreciable).',
  }
}

export function dDelta(p) {
  if (!p || p.error) return null
  return {
    titulo: 'Crecimiento total',
    pasos: [['Δ log₁₀', `${n3(p.zmax, 3)} − ${n3(p.z0, 3)} = ${n3(p.zmax - p.z0, 3)}`], ['Duplicaciones', `${n3(p.zmax - p.z0, 3)} / log₁₀ 2 = ${n3(p.zmax - p.z0, 3)} / 0.3010 = ${n3(p.duplicaciones, 2)}`]],
  }
}

// Sustitución de una OD en la ecuación del modelo
export function dPrediccion(aj, x, F = 1, corregida = true, xLeida = x) {
  if (!aj?.f || !finito(x)) return null
  const b = aj.f.beta, m = aj.modelo
  const pasos = []
  if (corregida && F !== 1) pasos.push(['OD corregida', `${n3(xLeida, 4)} × ${F} = ${n3(x, 4)}`])
  const y = aj.pred(x)
  if (m === 'semilog') pasos.push(['log₁₀ UFC', `m × OD + b = ${n3(b[1], 4)} × ${n3(x, 4)} + ${n3(b[0], 4)}`], ['', `= ${n3(Math.log10(y), 4)}`], ['UFC/mL', `10^${n3(Math.log10(y), 4)} = ${cient(y)}`])
  else if (m === 'loglog') pasos.push(['log₁₀ UFC', `a + b × log₁₀ OD = ${n3(b[0], 4)} + ${n3(b[1], 4)} × ${n3(Math.log10(x), 4)}`], ['', `= ${n3(Math.log10(y), 4)}`], ['UFC/mL', `10^${n3(Math.log10(y), 4)} = ${cient(y)}`])
  else if (m === 'lineal') pasos.push(['UFC/mL', `a + b × OD = ${cient(b[0])} + ${cient(b[1])} × ${n3(x, 4)}`], ['', `= ${cient(y)}`])
  else if (m === 'origen') pasos.push(['UFC/mL', `b × OD = ${cient(b[0])} × ${n3(x, 4)}`], ['', `= ${cient(y)}`])
  else if (m === 'cuadratico') pasos.push(['UFC/mL', `b₁ × OD + b₂ × OD² = ${cient(b[0])} × ${n3(x, 4)} + ${cient(b[1])} × ${n3(x, 4)}²`], ['', `= ${cient(y)}`])
  if (!corregida && F !== 1) pasos.push(['× dilución leída', `${cient(y)} × ${F} = ${cient(y * F)} UFC/mL`])
  return { titulo: 'Estimación con la curva', pasos }
}
