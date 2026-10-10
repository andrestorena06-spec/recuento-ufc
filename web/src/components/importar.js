import { leerArchivo, interpretarTabla } from '../excel.js'
import { filaVacia } from '../modelo.js'

// Lee un Excel/CSV y lo incorpora. modo: 'reemplazar' | 'agregar'.
// Las hojas con columnas de recuento crean filas; las hojas que solo tienen OD completan las filas
// existentes (misma muestra y réplica) o crean filas nuevas sin recuentos.
export async function importarArchivo(file, s, modo) {
  const hojas = await leerArchivo(file)
  const leidas = []
  const errores = []
  for (const h of hojas) {
    try { leidas.push({ hoja: h.hoja, ...interpretarTabla(h.datos) }) } catch (e) { errores.push(`${h.hoja}: ${e.message}`) }
  }
  if (!leidas.length) throw new Error(errores[0]?.replace(/^csv: /, '') || 'No encontré datos en el archivo.')

  const K = Math.max(s.K, ...leidas.map((l) => l.K))
  const M = Math.max(s.M, ...leidas.map((l) => l.nOD))
  const ajustar = (f) => ({
    ...f,
    conteos: Array.from({ length: K }, (_, i) => f.conteos[i] ?? ''),
    od: { ...f.od, lecturas: Array.from({ length: M }, (_, i) => f.od.lecturas[i] ?? '') },
  })
  let filas = modo === 'reemplazar' ? [] : s.filas.map(ajustar)
  const origen = { ...(modo === 'reemplazar' ? {} : s.opts.origenOD) }
  let nUFC = 0, nOD = 0
  const conUFC = leidas.filter((l) => l.tieneUFC)
  const soloOD = leidas.filter((l) => !l.tieneUFC)
  conUFC.forEach((l) => l.filas.forEach((x) => {
    const f = ajustar({ ...filaVacia(x.muestra, x.rep, K, M), vol: x.vol, dprev: x.dprev, conteos: x.conteos, ...(x.od ? { od: x.od } : {}) })
    filas.push(f)
    nUFC++
    if (x.od) nOD++
    if (x.origen) origen[x.muestra] = x.origen
  }))
  soloOD.forEach((l) => l.filas.forEach((x) => {
    const i = filas.findIndex((f) => f.muestra === x.muestra && Number(f.rep) === Number(x.rep))
    if (i >= 0) filas[i] = ajustar({ ...filas[i], od: x.od })
    else filas.push(ajustar({ ...filaVacia(x.muestra, x.rep, K, M), od: x.od }))
    nOD++
    if (x.origen) origen[x.muestra] = x.origen
  }))
  s.setK(K)
  s.setM(M)
  s.setFilas(filas)
  s.setOpts((o) => ({ ...o, origenOD: origen, ...(modo === 'reemplazar' ? { excluidos: [] } : {}) }))
  const partes = []
  if (nUFC) partes.push(`${nUFC} filas de recuento`)
  if (nOD) partes.push(`${nOD} lecturas de OD`)
  s.avisar(`${file.name}: ${partes.join(' y ')}.`)
  errores.filter((e) => !/csv/.test(e)).forEach((e) => leidas.length && s.avisar(`Hoja omitida — ${e}`, 'error'))
}

// Pega un bloque copiado de Excel (texto separado por tabulaciones) a partir de una celda.
// setCelda(fila, col, valor) devuelve la fila modificada; filaNueva() crea una fila vacía.
export function pegarBloque(texto, filas, r0, c0, setCelda, filaNueva) {
  const bloque = texto.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t'))
  if (bloque.length === 1 && bloque[0].length === 1) return null // un solo valor: pegado normal
  const out = [...filas]
  bloque.forEach((linea, i) => {
    const r = r0 + i
    if (r >= out.length) out.push(filaNueva())
    let f = out[r]
    linea.forEach((v, j) => { f = setCelda(f, c0 + j, v.trim()) })
    out[r] = f
  })
  return out
}

// Navegación con flechas y Enter dentro de una grilla (inputs con data-r y data-c)
export function navegar(e) {
  const { r, c } = e.currentTarget.dataset
  let dr = 0, dc = 0
  const inp = e.currentTarget
  if (e.key === 'ArrowDown' || e.key === 'Enter') dr = e.shiftKey && e.key === 'Enter' ? -1 : 1
  else if (e.key === 'ArrowUp') dr = -1
  else if (e.key === 'ArrowRight' && inp.selectionStart === inp.value.length) dc = 1
  else if (e.key === 'ArrowLeft' && inp.selectionEnd === 0) dc = -1
  else return
  const tabla = inp.closest('table')
  const sig = tabla?.querySelector(`input[data-r="${Number(r) + dr}"][data-c="${Number(c) + dc}"]`)
  if (sig) { e.preventDefault(); sig.focus(); sig.select() }
}
