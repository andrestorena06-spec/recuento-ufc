import { nuevoId } from './utils.js'

export const K_DEF = 11 // sin diluir + 10⁻¹ … 10⁻¹⁰
export const M_DEF = 3 // columnas de OD: sin diluir, 10⁻¹, 10⁻²

export const optsDef = () => ({
  // recuento
  factorDil: 10, rango: '30-300', min: 30, max: 300, metodo: 'ponderada', volDef: 100, volFijo: true, incluirEstimados: false,
  unidadTiempo: 'h', nombres: [],
  // OD: ventana lineal del fotómetro para elegir las lecturas que forman la OD corregida
  onda: '600', ondaOtra: '', equipo: 'cubeta', blancoOD: '', blancoCorregido: false, origenGlobal: 'misma',
  odLinMin: 0.1, odLinMax: 0.8,
  // curva: puntos 'corregida' (OD corregida de cada réplica) o 'dilucion' (cada lectura con su dilución)
  puntos: 'corregida', modo: 'individual', modelo: 'semilog', ponderacion: 'relativa', escalaY: 'log10', escalaX: 'lin',
  curvaPor: 'cepa', cepaDetalle: '', rangosCepa: {}, bandaC: true, bandaP: true, odMin: '', odMax: '', tMin: '', tMax: '', excluidos: [], colorPor: 'muestra', mostrarEcuacion: true,
  // condiciones del experimento (aparecen en las exportaciones y, si se elige, al pie de los gráficos)
  condiciones: { medio: '', temperatura: '', fecha: '', notas: '' }, notaCondiciones: false,
})

// Eje de UFC/mL según la opción elegida: log₁₀ numérico (2…9, como en los papers), log con 10ⁿ o lineal
export const ejeUFC = (o, titulo = 'UFC/mL') => (o.escalaY === 'lin' ? { titulo, cero: true }
  : o.escalaY === 'log' ? { titulo, log: true } : { titulo: `log₁₀ ${titulo}`, exp: true })
export const OPCIONES_EJE_UFC = [['log10', 'log₁₀ UFC/mL (2…9)'], ['log', 'Logarítmico (10ⁿ)'], ['lin', 'Lineal']]

// Cepas del experimento: los nombres de la columna Muestra
export const cepasDe = (filas) => [...new Set(filas.filter(filaEnUso).map((f) => String(f.muestra ?? '').trim()).filter(Boolean))]

// Texto de condiciones para el pie de los gráficos
export function textoCondiciones(o, filas = []) {
  const c = o.condiciones || {}
  const onda = o.onda === 'otra' ? o.ondaOtra : o.onda
  const cepas = cepasDe(filas)
  return [cepas.length ? `${cepas.length === 1 ? 'Cepa' : 'Cepas'}: ${cepas.join(', ')}` : '', c.medio, c.temperatura && `${c.temperatura} °C`, onda && `OD${onda}`, c.fecha].filter((x) => String(x ?? '').trim()).join(' · ')
}

export const UNIDADES_T = [['min', 'minutos'], ['h', 'horas'], ['d', 'días']]

export const filaVacia = (muestra = '', rep = '', K = K_DEF, M = M_DEF) => ({
  id: nuevoId(), muestra, tiempo: '', rep, repManual: false, vol: '', conteos: Array(K).fill(''),
  od: { lecturas: Array(M).fill(''), blanco: '' },
})

const vacio = (v) => v === null || v === undefined || String(v).trim() === ''
// La fila tiene algo cargado (las filas en blanco no entran en ningún cálculo)
export const filaEnUso = (f) => !vacio(f.muestra) || !vacio(f.tiempo) || f.conteos.some((c) => !vacio(c)) || f.od.lecturas.some((c) => !vacio(c))

// Tiempo normalizado para comparar ("2", "2,0" y "2.0" son el mismo tiempo)
export function tNorm(t) {
  if (vacio(t)) return ''
  const n = Number(String(t).trim().replace(',', '.'))
  return Number.isFinite(n) ? String(n) : String(t).trim()
}
export const tNum = (t) => { const n = Number(tNorm(t)); return vacio(t) || !Number.isFinite(n) ? NaN : n }
// Grupo = muestra en un tiempo: las réplicas se cuentan dentro de cada grupo
export const claveGrupo = (muestra, tiempo) => `${String(muestra ?? '').trim()}|${tNorm(tiempo)}`
export const etiquetaGrupo = (muestra, tiempo, u = 'h') => (tNorm(tiempo) === '' ? muestra || '(sin nombre)' : `${muestra || '(sin nombre)'} · ${tNorm(tiempo)} ${u}`)

// Numera las réplicas automáticas por muestra y tiempo (1, 2, 3… en cada tiempo), respetando las escritas a mano
export function numerarReplicas(filas) {
  const usadas = {}
  filas.forEach((f) => {
    if (f.repManual && !vacio(f.muestra)) {
      const k = claveGrupo(f.muestra, f.tiempo)
      ;(usadas[k] ||= new Set()).add(Number(f.rep))
    }
  })
  const sig = {}
  let cambio = false
  const out = filas.map((f) => {
    if (f.repManual) return f
    let rep = ''
    if (!vacio(f.muestra)) {
      const k = claveGrupo(f.muestra, f.tiempo)
      let n = (sig[k] || 0) + 1
      while (usadas[k]?.has(n)) n++
      sig[k] = n
      rep = n
    }
    if (rep === f.rep) return f
    cambio = true
    return { ...f, rep }
  })
  return cambio ? out : filas
}
