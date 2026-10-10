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

// ¿La matriz tiene una fila de encabezados reconocible (con «Muestra»)?
export const tieneEncabezados = (m) => m.slice(0, 3).some((f) => f.some((c) => RE_MUESTRA.test(norm(c))))
const RE_MUESTRA = /^(muestra|muestras|sample|cepa|nombre)/

// Busca en la matriz la fila de encabezados (la que tiene "Muestra") y arma filas de datos.
// Reconoce columnas de tiempo, réplica, volumen, recuento (Sin diluir, -1 … -n)
// y OD (OD, Lectura…, Blanco, Dilución OD, Origen). Un campo cuya columna no está queda undefined:
// al combinar con filas existentes solo se cambia lo que trae la tabla.
export function interpretarTabla(m) {
  const iCab = m.findIndex((f) => f.some((c) => RE_MUESTRA.test(norm(c))))
  if (iCab < 0) throw new Error('No encontré una fila de encabezados con la columna «Muestra».')
  const cab = m[iCab].map(norm)
  const col = (re) => cab.findIndex((c) => re.test(c))
  const iM = col(RE_MUESTRA)
  const iT = col(/^(tiempo|time|t|t \(.*\)|hora|horas|h|min|minutos|dia|dias)$|^tiempo/)
  const iR = col(/^(replica|rep\b|rep\.|n replica|r$)/)
  const iV = col(/^(vol|volumen)/)
  const iBl = col(/^(blanco|blank)/)
  const iOr = col(/^(origen)/)
  const usadas = new Set([iM, iT, iR, iV, iBl, iOr])
  const dils = cab.map((c, j) => (usadas.has(j) ? null : columnaDilucion(m[iCab][j])))
  // OD por dilución: «OD» u «OD sin diluir» = sin diluir; «OD -1», «OD 10^-2», «OD 10⁻³»… = esa dilución
  const iOD = cab.map((c, j) => {
    if (usadas.has(j)) return null
    const m = c.match(/^(od|do|abs|absorbancia)(\s*\d{3}\s*nm)?[\s_.:]*(.*)$/)
    if (!m) return null
    const resto = String(m[3] ?? '').replace(/^\((.*)\)$/, '$1').trim()
    const k = resto === '' ? 0 : columnaDilucion(resto)
    return k === null ? null : { j, k }
  }).filter(Boolean)
  const K = Math.max(-1, ...dils.filter((d) => d !== null)) + 1
  const nOD = iOD.length ? Math.max(...iOD.map((x) => x.k)) + 1 : 0
  if (!K && !iOD.length) throw new Error('No encontré columnas de recuento («Sin diluir», «-1», «-2», …) ni de OD.')

  const filas = []
  const cont = {}
  for (const f of m.slice(iCab + 1)) {
    const nombre = texto(f[iM])
    if (!nombre) continue
    let [muestra, rep] = separarReplica(nombre)
    if (iR >= 0 && texto(f[iR]) !== '' && finito(Number(f[iR]))) { muestra = nombre; rep = Number(f[iR]) }
    const tiempo = iT >= 0 ? texto(f[iT]) : ''
    const g = muestra + '|' + tiempo.replace(',', '.')
    cont[g] = (cont[g] || 0) + 1
    const repExplicita = !!rep
    if (!rep) rep = cont[g]
    let conteos
    if (K) { conteos = Array(K).fill(undefined); dils.forEach((d, j) => { if (d !== null) conteos[d] = texto(f[j]) }) }
    filas.push({
      muestra, rep, repExplicita, tiempo: iT >= 0 ? tiempo : undefined,
      vol: iV >= 0 ? texto(f[iV]) : undefined,
      conteos,
      od: iOD.length || iBl >= 0 ? {
        lecturas: iOD.length ? (() => { const l = Array(nOD).fill(undefined); iOD.forEach(({ j, k }) => { l[k] = texto(f[j]) }); return l })() : undefined,
        blanco: iBl >= 0 ? texto(f[iBl]) : undefined,
      } : null,
      origen: iOr >= 0 ? (/paral|indep|otr/.test(norm(f[iOr])) ? 'paralelo' : /mism|igual|pare/.test(norm(f[iOr])) ? 'misma' : null) : null,
    })
  }
  if (!filas.length) throw new Error('La tabla no tiene filas con nombre de muestra.')
  return { filas, K, nOD, tieneUFC: K > 0, tieneTiempo: iT >= 0, tieneVol: iV >= 0 }
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
  const cols = ['Muestra', 'Tiempo (h)', 'Réplica', 'Sin diluir', ...dil]
  const ej = (m, t, r, c) => ({ Muestra: m, 'Tiempo (h)': t, Réplica: r, ...Object.fromEntries(c.map((v, i) => [i === 0 ? 'Sin diluir' : `-${i}`, v])) })
  const filas = [
    ej('L100A1', 0, 1, ['', '', '', 'INC', 152, 14, 2]),
    ej('L100A1', 0, 2, ['', '', '', 'INC', 139, 17, 0]),
    ej('L100A1', 0, 3, ['', '', '', 'INC', 160, 11, 1]),
    ej('L100A1', 2, 1, ['', '', '', '', '', 'INC', 182, 21, 3]),
    ej('L100A1', 2, 2, ['', '', '', '', '', 'INC', 167, 15, 1]),
    ej('L100A1', 2, 3, ['', '', '', '', '', 'INC', 201, 19, 2]),
  ]
  const colsOD = ['Muestra', 'Tiempo (h)', 'Réplica', 'OD sin diluir', 'OD -1', 'OD -2', 'Blanco', 'Origen OD']
  const filasOD = [
    ...[[0, 1, 0.061], [0, 2, 0.058], [0, 3, 0.063], [2, 1, 0.512], [2, 2, 0.497], [2, 3, 0.530]].map(([t, r, od]) => ({
      Muestra: 'L100A1', 'Tiempo (h)': t, Réplica: r, 'OD sin diluir': +(od + 0.041).toFixed(3), 'OD -1': +(od / 10 + 0.041).toFixed(3), 'OD -2': null, Blanco: 0.041, 'Origen OD': 'misma',
    })),
  ]
  const ayuda = [
    ['Hoja «Recuentos»: una fila por réplica. Tiempo = momento de la toma (las réplicas se numeran dentro de cada muestra y tiempo). Columnas «Sin diluir», «-1», «-2»… = colonias contadas en la placa de cada dilución 1:10.'],
    ['Celda vacía = esa dilución no se sembró. 0 = se sembró y no creció nada. INC (o MNPC, TNTC, >300) = incontable.'],
    ['Volumen: por defecto es fijo (se elige en el programa). Si cambia entre filas, agregá una columna «Volumen (µL)».'],
    ['La réplica puede ir en su columna o en el nombre: L100A1₁, L100A1_1, L100A1 (1).'],
    ['Hoja «OD»: OD sin diluir, OD -1, OD -2… = OD leída en cada dilución de la misma serie que se sembró (vacío = no se leyó). Blanco = OD del medio estéril; si el equipo ya da la OD corregida, omití la columna.'],
    ['Origen OD: «misma» = la OD se leyó en la misma suspensión que se sembró; «paralelo» = en otro cultivo hecho en las mismas condiciones.'],
  ]
  return excelDe([
    { nombre: 'Recuentos', columnas: cols, filas },
    { nombre: 'OD', columnas: colsOD, filas: filasOD },
    { nombre: 'Instrucciones', columnas: ['Formato'], filas: ayuda },
  ])
}
