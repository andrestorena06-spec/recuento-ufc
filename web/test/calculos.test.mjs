// Pruebas de los cálculos: node test/calculos.test.mjs
import assert from 'node:assert/strict'
import { calcularFila, leerConteo, leerFactor } from '../src/ufc.js'
import { icPoisson, qchisq } from '../src/estadistica.js'
import { separarReplica, columnaDilucion } from '../src/excel.js'

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
// dilución previa respecto de la madre
r = calcularFila({ dprev: '1:100', conteos: ['', 120] }, o)
cerca(r.Nmadre, 120 * 10 / 0.1 * 100)
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
console.log('Todas las pruebas pasaron.')
