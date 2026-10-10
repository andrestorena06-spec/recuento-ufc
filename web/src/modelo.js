import { nuevoId } from './utils.js'

export const K_DEF = 11 // sin diluir + 10⁻¹ … 10⁻¹⁰

export const optsDef = () => ({
  // recuento
  rango: '30-300', min: 30, max: 300, metodo: 'ponderada', volDef: 100, incluirEstimados: false,
  // OD
  onda: '600', ondaOtra: '', equipo: 'cubeta', blancoOD: '', origenOD: {},
  // curva
  modo: 'individual', modelo: 'lineal', ponderacion: 'relativa', escalaY: 'log', escalaX: 'lin',
  bandaC: true, bandaP: true, odMin: '', odMax: '', excluidos: [], colorPor: 'muestra',
})

export const filaVacia = (muestra = '', rep = 1, K = K_DEF, M = 1) => ({
  id: nuevoId(), muestra, rep, vol: '', dprev: '', conteos: Array(K).fill(''),
  od: { lecturas: Array(M).fill(''), blanco: '', dil: '' },
})

