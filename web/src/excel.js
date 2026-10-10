// ============================================================
// Lectura de Excel/CSV con recuentos y OD, plantilla y exportación.
// ============================================================
import { finito } from './estadistica.js'

// ---------- lectura cruda ----------
async function decodificar(file) {
  const buf = await file.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('windows-1252').decode(buf)
  }
}
export function parsearCSV(texto) {
  const limpio = texto.replace(/^﻿/, '')
  const muestra = limpio.split(/\r?\n/).slice(0, 30)
  const cuenta = [';', '\t', ','].map((s) => muestra.reduce((a, l) => a + (l.split(s).length - 1), 0))
  const max = Math.max(...cuenta)
  const sep = max === 0 ? ',' : [';', '\t', ','][cuenta.indexOf(max)]
  const filas = []
  let fila = [], campo = '', comillas = false
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i]
    if (comillas) {
      if (c === '"') { if (limpio[i + 1] === '"') { campo += '"'; i++ } else comillas = false } else campo += c
    } else if (c === '"') comillas = true
    else if (c === sep) { fila.push(campo.trim()); campo = '' }
    else if (c === '\n') { fila.push(campo.trim()); filas.push(fila); fila = []; campo = '' }
    else if (c !== '\r') campo += c
  }
  if (campo !== '' || fila.length) { fila.push(campo.trim()); filas.push(fila) }
  return filas
}
const esCSV = (nombre) => ['csv', 'txt', 'tsv'].includes(nombre.split('.').pop().toLowerCase())

// Devuelve [{hoja, datos: matriz}]
export async function leerArchivo(file) {
  if (esCSV(file.name)) return [{ hoja: 'csv', datos: parsearCSV(await decodificar(file)) }]
  if (file.name.toLowerCase().endsWith('.xls')) throw new Error('Los archivos .xls antiguos no se pueden leer en el navegador: guardalo como .xlsx o .csv.')
  const { default: leer } = await import('read-excel-file/browser')
  const hojas = await leer(file)
  return hojas.map((h) => ({ hoja: h.sheet, datos: h.data.map((f) => f.map((v) => (v === null || v === undefined ? '' : v))) }))
}

// ---------- interpretación ----------
const norm = (s) => String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' }
// número de columna de dilución a partir del encabezado: "Sin diluir" → 0, "-3" / "10^-3" / "10⁻³" / "1e-3" → 3
export function columnaDilucion(h) {
  let s = norm(h).replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]/g, (c) => SUP[c]).replace(/[−‐–]/g, '-').replace(/\s/g, '')
  if (/^(sindiluir|sindil|puro|undiluted|0|10\^?0|10\^-0|-0)$/.test(s)) return 0
  let m = s.match(/^(?:dil(?:ucion)?)?(?:10\^?|1e)?-(\d{1,2})$/)
  if (m) return Number(m[1])
  m = s.match(/^1:10\^?(\d{1,2})$/)
  if (m) return Number(m[1])
  return null
}

// Réplica escrita en el nombre: L100A1₂, L100A1_2, L100A1 (2), L100A1 #2, L100A1 rep 2
const SUBN = '₀₁₂₃₄₅₆₇₈₉'
export function separarReplica(nombre) {
  const s = String(nombre ?? '').trim()
  let m = s.match(/^(.*?)([₀-₉]+)$/)
  if (m) return [m[1].trim(), Number(m[2].split('').map((c) => SUBN.indexOf(c)).join(''))]
  m = s.match(/^(.*?)\s*(?:_|#|\(|\s(?:rep|r|replica|réplica)\.?\s*)(\d{1,3})\)?$/i)
  if (m && m[1]) return [m[1].trim(), Number(m[2])]
  return [s, null]
}

const texto = (v) => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim())

// Busca en la matriz la fila de encabezados (la que tiene "Muestra") y arma filas de datos.
// Reconoce columnas de recuento (Sin diluir, -1 … -n) y de OD (OD, Lectura…, Blanco, Dilución OD, Origen).
export function interpretarTabla(m) {
  const iCab = m.findIndex((f) => f.some((c) => /^(muestra|muestras|sample|cepa|nombre)/.test(norm(c))))
  if (iCab < 0) throw new Error('No encontré una fila de encabezados con la columna «Muestra».')
  const cab = m[iCab].map(norm)
  const col = (re) => cab.findIndex((c) => re.test(c))
  const iM = col(/^(muestra|muestras|sample|cepa|nombre)/)
  const iR = col(/^(replica|rep\b|rep\.|n replica|r$)/)
  const iV = col(/^(vol|volumen)/)
  const iP = col(/(previa|madre|dil.*prev|factor)/)
  const iBl = col(/^(blanco|blank)/)
  const iDod = col(/(dil.*od|od.*dil|dil.*lectura|lectura.*dil)/)
  const iOr = col(/^(origen)/)
  const dils = cab.map((c, j) => (j === iM || j === iR || j === iV || j === iP ? null : columnaDilucion(m[iCab][j])))
  const iOD = cab.map((c, j) => (j !== iDod && /^(od|do|abs|absorbancia|lectura)(\s|\d|$|_|\.)/.test(c) ? j : -1)).filter((j) => j >= 0)
  const K = Math.max(-1, ...dils.filter((d) => d !== null)) + 1
  if (!K && !iOD.length) throw new Error('No encontré columnas de recuento («Sin diluir», «-1», «-2», …) ni de OD.')

  const filas = []
  const cont = {}
  for (const f of m.slice(iCab + 1)) {
    const nombre = texto(f[iM])
    if (!nombre) continue
    let [muestra, rep] = separarReplica(nombre)
    if (iR >= 0 && finito(Number(f[iR])) && texto(f[iR]) !== '') { muestra = nombre; rep = Number(f[iR]) }
    cont[muestra] = (cont[muestra] || 0) + 1
    if (!rep) rep = cont[muestra]
    const conteos = Array(K).fill('')
    dils.forEach((d, j) => { if (d !== null) conteos[d] = texto(f[j]) })
    filas.push({
      muestra, rep,
      vol: iV >= 0 ? texto(f[iV]) : '',
      dprev: iP >= 0 ? texto(f[iP]) : '',
      conteos,
      od: iOD.length ? { lecturas: iOD.map((j) => texto(f[j])), blanco: iBl >= 0 ? texto(f[iBl]) : '', dil: iDod >= 0 ? texto(f[iDod]) : '' } : null,
      origen: iOr >= 0 ? (/paral|indep|otr/.test(norm(f[iOr])) ? 'paralelo' : /mism|igual|pare/.test(norm(f[iOr])) ? 'misma' : null) : null,
    })
  }
  if (!filas.length) throw new Error('La tabla no tiene filas con nombre de muestra.')
  return { filas, K, nOD: iOD.length, tieneUFC: K > 0 }
}

// ---------- escritura ----------
export async function excelDe(hojas) {
  const { default: escribir } = await import('write-excel-file/browser')
  const data = hojas.map((h) => ({
    sheet: String(h.nombre || 'Hoja').replace(/[[\]*?/\\:]/g, '_').slice(0, 31),
    data: [
      h.columnas.map((c) => ({ value: String(c), fontWeight: 'bold' })),
      ...h.filas.map((f) => h.columnas.map((c) => {
        const v = Array.isArray(f) ? f[h.columnas.indexOf(c)] : f[c]
        if (v === null || v === undefined || v === '' || (typeof v === 'number' && !finito(v))) return null
        return { value: v }
      })),
    ],
  }))
  return escribir(data).toBlob()
}

export async function plantilla() {
  const dil = Array.from({ length: 10 }, (_, i) => `-${i + 1}`)
  const cols = ['Muestra', 'Réplica', 'Volumen (µL)', 'Dilución previa', 'Sin diluir', ...dil]
  const ej = (m, r, c) => ({ Muestra: m, Réplica: r, 'Volumen (µL)': 100, 'Dilución previa': '1', ...Object.fromEntries(c.map((v, i) => [i === 0 ? 'Sin diluir' : `-${i}`, v])) })
  const filas = [
    ej('L100A1', 1, ['INC', 'INC', 'INC', 'INC', 'INC', 'INC', 182, 21, 3]),
    ej('L100A1', 2, ['INC', 'INC', 'INC', 'INC', 'INC', 'INC', 167, 15, 1]),
    ej('L100A1', 3, ['INC', 'INC', 'INC', 'INC', 'INC', 'INC', 201, 19, 2]),
    ej('L201', 1, ['', '', '', '', 'INC', 312, 35, 4, 0]),
  ]
  const colsOD = ['Muestra', 'Réplica', 'OD 1', 'OD 2', 'Blanco', 'Dilución lectura OD', 'Origen OD']
  const filasOD = [
    { Muestra: 'L100A1', Réplica: 1, 'OD 1': 0.512, 'OD 2': 0.508, Blanco: 0.041, 'Dilución lectura OD': '1', 'Origen OD': 'misma' },
    { Muestra: 'L100A1', Réplica: 2, 'OD 1': 0.497, 'OD 2': 0.501, Blanco: 0.041, 'Dilución lectura OD': '1', 'Origen OD': 'misma' },
    { Muestra: 'L100A1', Réplica: 3, 'OD 1': 0.530, 'OD 2': 0.526, Blanco: 0.041, 'Dilución lectura OD': '1', 'Origen OD': 'misma' },
    { Muestra: 'L201', Réplica: 1, 'OD 1': 0.083, 'OD 2': 0.081, Blanco: 0.041, 'Dilución lectura OD': '1', 'Origen OD': 'paralelo' },
  ]
  const ayuda = [
    ['Hoja «Recuentos»: una fila por réplica. Columnas «Sin diluir», «-1», «-2»… = colonias contadas en la placa de cada dilución 1:10.'],
    ['Celda vacía = esa dilución no se sembró. 0 = se sembró y no creció nada. INC (o MNPC, TNTC, >300) = incontable.'],
    ['Volumen (µL): volumen sembrado en cada placa (100 µL en superficie, 10 µL por gota, 1000 µL en profundidad).'],
    ['Dilución previa: dilución de la suspensión «sin diluir» respecto de la muestra madre (1 = es la madre; 1:100, 100 o 10^-2 = diluida 100 veces).'],
    ['La réplica puede ir en su columna o en el nombre: L100A1₁, L100A1_1, L100A1 (1).'],
    ['Hoja «OD»: OD 1, OD 2… = lecturas de la misma suspensión (se promedian). Blanco = OD del medio estéril (vacío = 0 o el blanco general).'],
    ['Dilución lectura OD: si la OD se leyó en una dilución de la madre (para quedar en el rango lineal), su factor (1:10 = 10).'],
    ['Origen OD: «misma» = la OD se leyó en la misma suspensión que se sembró; «paralelo» = en otro cultivo hecho en las mismas condiciones.'],
  ]
  return excelDe([
    { nombre: 'Recuentos', columnas: cols, filas },
    { nombre: 'OD', columnas: colsOD, filas: filasOD },
    { nombre: 'Instrucciones', columnas: ['Formato'], filas: ayuda },
  ])
}
