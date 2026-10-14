// Pruebas de los cálculos: node test/calculos.test.mjs
import assert from 'node:assert/strict'
import { calcularFila, leerConteo, leerFactor } from '../src/ufc.js'
import { icPoisson, qchisq } from '../src/estadistica.js'
import { separarReplica, columnaDilucion, interpretarTabla } from '../src/excel.js'
import { numerarReplicas } from '../src/modelo.js'
import { ajustar, compararCepas, correspondencia, linealidadOD, odCorregida } from '../src/calibracion.js'
import { parametrosCrecimiento } from '../src/crecimiento.js'

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
const oc = { ...o, blancoCorregido: true, origenOD: {}, puntos: 'dilucion' }
const fila = { id: 'a', muestra: 'A', tiempo: '0', rep: 1, conteos: ['', '', '', '', '', 150], od: { lecturas: ['0.8', '0.081', '0.0079'], blanco: '' } }
const c = correspondencia([fila], oc)
assert.deepEqual(c.ind.map((p) => p.k), [0, 1, 2])
cerca(c.ind[1].y, 150e5 / 0.1 / 10)
assert.equal(c.prom.length, 3)
const L = linealidadOD([fila], oc, 0.005)
assert.ok(L.factor > 9.5 && L.factor < 10.5, 'factor ' + L.factor)
assert.equal(t.filas[0].conteos, undefined)
assert.equal(t.filas[0].od.blanco, undefined)
// OD corregida: lecturas dentro de la ventana 0,1–0,8 × 10ᵏ, promediadas; un punto por réplica
const fila2 = { id: 'b', muestra: 'B', tiempo: '1', rep: 1, conteos: ['', '', '', '', '', 150], od: { lecturas: ['1.9', '0.62', '0.061'], blanco: '' } }
const occ = { ...oc, puntos: 'corregida', odLinMin: 0.1, odLinMax: 0.8 }
const oco = odCorregida(fila2, occ)
assert.deepEqual(oco.dils, [1]); cerca(oco.od, 6.2)
const c2 = correspondencia([fila2], occ)
assert.equal(c2.ind.length, 1); cerca(c2.ind[0].x, 6.2); cerca(c2.ind[0].y, 150e5 / 0.1)
// ninguna lectura en la ventana: se usa la más cercana y se marca
const fila3 = { ...fila2, od: { lecturas: ['1.5', '', ''], blanco: '' } }
assert.equal(odCorregida(fila3, occ).fuera, true)

// crecimiento exponencial simulado: µ = 0,8 /h (g = 0,866 h), latencia 1 h, estacionaria desde 6 h
const pts = []
for (const t of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
  const lnN = Math.log(1e6) + 0.8 * Math.min(Math.max(t - 1, 0), 5)
  ;[-0.02, 0, 0.02].forEach((e) => pts.push({ t, z: lnN / Math.LN10 + e }))
}
const g = parametrosCrecimiento(pts)
assert.equal(g.t1, 1); assert.equal(g.t2, 6)
cerca(g.mu, 0.8, 1e-6); cerca(g.lag, 1, 1e-6)
// comparación de cepas (prueba F, igual a anova_lm(común, por cepa) de statsmodels / anova() de R)
const cA = [[0.1, 7.1], [0.2, 7.45], [0.3, 7.6], [0.45, 7.9], [0.6, 8.05], [0.8, 8.3]].map(([x, z]) => ({ x, y: 10 ** z, muestra: 'A' }))
const cB = [[0.1, 7.3], [0.25, 7.8], [0.35, 8.0], [0.5, 8.3], [0.7, 8.6], [0.9, 8.85]].map(([x, z]) => ({ x, y: 10 ** z, muestra: 'B' }))
const fc = compararCepas(ajustar([...cA, ...cB], 'semilog'), [{ muestra: 'A', aj: ajustar(cA, 'semilog') }, { muestra: 'B', aj: ajustar(cB, 'semilog') }])
cerca(fc.F, 12.557883, 1e-6); cerca(fc.p, 3.405812e-3, 1e-5)
// diluciones seriadas 1:2: la columna k es 2⁻ᵏ
const o2 = { ...o, factorDil: 2 }
cerca(calcularFila({ conteos: ['', '', '', 200] }, o2).N, 200 * 2 ** 3 / 0.1)
cerca(calcularFila({ conteos: ['', '', '', 200, 100] }, o2).N, 300 / (0.1 * (1 / 8 + 1 / 16)))
const f2 = { id: 'c', muestra: 'C', tiempo: '0', rep: 1, conteos: ['', '', '', 100], od: { lecturas: ['1.6', '0.8', '0.4', '0.2'], blanco: '' } }
cerca(odCorregida(f2, { ...o2, blancoCorregido: true, odLinMin: 0.1, odLinMax: 0.8 }).od, 1.6)
cerca(linealidadOD([f2], { ...o2, blancoCorregido: true }).factor, 2, 1e-9)
console.log('Todas las pruebas pasaron.')
