import { nuevoId } from './utils.js'

export const K_DEF = 11 // sin diluir + 10⁻¹ … 10⁻¹⁰

export const optsDef = () => ({
  // recuento
  rango: '30-300', min: 30, max: 300, metodo: 'ponderada', volDef: 100, volFijo: true, incluirEstimados: false,
  unidadTiempo: 'h', nombres: [],
  // OD
  onda: '600', ondaOtra: '', equipo: 'cubeta', blancoOD: '', blancoCorregido: false, origenOD: {},
  // curva
  modo: 'individual', modelo: 'lineal', ponderacion: 'relativa', escalaY: 'log', escalaX: 'lin',
  bandaC: true, bandaP: true, odMin: '', odMax: '', excluidos: [], colorPor: 'muestra',
})

export const UNIDADES_T = [['min', 'minutos'], ['h', 'horas'], ['d', 'días']]

export const filaVacia = (muestra = '', rep = '', K = K_DEF, M = 1) => ({
  id: nuevoId(), muestra, tiempo: '', rep, repManual: false, vol: '', dprev: '', conteos: Array(K).fill(''),
  od: { lecturas: Array(M).fill(''), blanco: '', dil: '' },
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
