// Pruebas de los cálculos: node test/calculos.test.mjs
import assert from 'node:assert/strict'
import { calcularFila, leerConteo, leerFactor } from '../src/ufc.js'
import { icPoisson, qchisq } from '../src/estadistica.js'
import { separarReplica, columnaDilucion, interpretarTabla } from '../src/excel.js'
import { numerarReplicas } from '../src/modelo.js'
import { correspondencia, linealidadOD } from '../src/calibracion.js'

const o = { rango: '30-300', metodo: 'ponderada', volDef: 100 }
const cerca = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), `${a} ≠ ${b}`)

// celda vacía = dilución no sembrada (no es 0)
assert.equal(leerConteo(''), null)
assert.equal(leerConteo('0'), 0)
let r = calcularFila({ conteos: ['', '', '', 245, '', ''] }, o)
assert.equal(r.estado, 'ok'); assert.deepEqual(r.dils, [3]); cerca(r.N, 245e3 / 0.1)
r = calcularFila({ conteos: ['', '', '', 245, 0, 0] }, o) // los ceros sembrados sí cuentan como placas
assert.equal(r.placas.length, 3)
r = calcularFila({ conteos: ['', '', '', '', ''] }, o)
assert.equal(r.estado, 'vacio'); assert.deepEqual(r.dils, [])
r = calcularFila({ vol: 10, conteos: [0, 0, '', ''] }, o)
assert.equal(r.estado, 'bajoLD'); cerca(r.N, 100)

// media ponderada ISO 7218: ΣC / Σ(V·10⁻ᵏ)
r = calcularFila({ conteos: ['INC', 'INC', 'INC', 245, 31, 2] }, o)
cerca(r.N, 276 / (0.1e-3 + 0.1e-4))
// una sola dilución
r = calcularFila({ conteos: ['INC', 'INC', 'INC', 245, 31, 2] }, { ...o, metodo: 'una' })
assert.deepEqual(r.dils, [3])
// sin dilución previa: el resultado de la muestra es el de la placa
r = calcularFila({ conteos: ['', 120] }, o)
cerca(r.Nmadre, 120 * 10 / 0.1)
assert.deepEqual(['1', '10', '1:10', '1/100', '10^-2', '1e-2', '-2'].map(leerFactor), [1, 10, 10, 100, 100, 100, 100])

// IC de Poisson exacto (valores de poisson.test de R)
cerca(icPoisson(5)[0], 1.6234864, 1e-6); cerca(icPoisson(5)[1], 11.668332, 1e-6)
cerca(qchisq(0.975, 10), 20.483177, 1e-6)

// lectura de encabezados y réplicas
assert.equal(columnaDilucion('Sin diluir'), 0)
assert.equal(columnaDilucion('-3'), 3)
assert.equal(columnaDilucion('10⁻⁴'), 4)
assert.deepEqual(separarReplica('L100A1₂'), ['L100A1', 2])
assert.deepEqual(separarReplica('L201'), ['L201', null])
assert.deepEqual(separarReplica('L100A1 (3)'), ['L100A1', 3])
// volumen fijo: se ignora el de la fila
r = calcularFila({ vol: 10, conteos: [100] }, { ...o, volFijo: true, volDef: 100 })
cerca(r.N, 1000)

// réplicas por muestra y tiempo (vuelven a empezar en cada tiempo; las escritas a mano se respetan)
const f = (muestra, tiempo, rep = '', repManual = false) => ({ muestra, tiempo, rep, repManual })
const nr = numerarReplicas([f('L100', 0), f('L100', 0), f('L100', '0,0'), f('L100', 1), f('L100', 1), f('L201', 1), f('L100', 1, 1, true), f('', '')])
assert.deepEqual(nr.map((x) => x.rep), [1, 2, 3, 2, 3, 1, 1, ''])

// tabla pegada con encabezados: tiempo y réplicas por grupo, solo los campos presentes
const t = interpretarTabla([['Muestra', 'Tiempo (h)', 'OD', 'OD -1'], ['L100', '0', '0.1', ''], ['L100', '0', '0.12', ''], ['L100', '2', '0.5', '0.05']])
assert.deepEqual(t.filas.map((x) => [x.tiempo, x.rep, x.od.lecturas[0]]), [['0', 1, '0.1'], ['0', 2, '0.12'], ['2', 1, '0.5']])
assert.equal(t.filas[2].od.lecturas[1], '0.05')
assert.equal(t.nOD, 2)

// OD por dilución: cada lectura es un punto con UFC/mL = muestra / 10ᵏ; linealidad ≈ ×10
const oc = { ...o, blancoCorregido: true, origenOD: {} }
const fila = { id: 'a', muestra: 'A', tiempo: '0', rep: 1, conteos: ['', '', '', '', '', 150], od: { lecturas: ['0.8', '0.081', '0.0079'], blanco: '' } }
const c = correspondencia([fila], oc)
assert.deepEqual(c.ind.map((p) => p.k), [0, 1, 2])
cerca(c.ind[1].y, 150e5 / 0.1 / 10)
assert.equal(c.prom.length, 3)
const L = linealidadOD([fila], oc, 0.005)
assert.ok(L.factor > 9.5 && L.factor < 10.5, 'factor ' + L.factor)
assert.equal(t.filas[0].conteos, undefined)
assert.equal(t.filas[0].od.blanco, undefined)
console.log('Todas las pruebas pasaron.')
