import { leerArchivo, interpretarTabla, parsearCSV, tieneEncabezados } from '../excel.js'
import { claveGrupo, filaEnUso, filaVacia } from '../modelo.js'

// Combina tablas leídas (de un archivo o pegadas) con las filas existentes.
// Cada fila se identifica por muestra + tiempo + réplica: si ya existe se actualizan solo los campos
// que trae la tabla; si no, se agrega. modo 'reemplazar' empieza de cero.
export function fusionar(leidas, s, modo = 'agregar') {
  const K = Math.max(s.K, ...leidas.map((l) => l.K))
  const M = Math.max(s.M, ...leidas.map((l) => l.nOD))
  const ajustar = (f) => ({
    ...f,
    conteos: Array.from({ length: K }, (_, i) => f.conteos[i] ?? ''),
    od: { ...f.od, lecturas: Array.from({ length: M }, (_, i) => f.od.lecturas[i] ?? '') },
  })
  const filas = (modo === 'reemplazar' ? [] : s.filas.filter(filaEnUso)).map(ajustar)
  const origen = { ...(modo === 'reemplazar' ? {} : s.opts.origenOD) }
  let nuevas = 0, actualizadas = 0
  // primero las tablas con recuentos (crean filas), después las que solo traen OD
  const orden = [...leidas.filter((l) => l.tieneUFC), ...leidas.filter((l) => !l.tieneUFC)]
  orden.forEach((l) => l.filas.forEach((x) => {
    const clave = claveGrupo(x.muestra, x.tiempo ?? '')
    let i = filas.findIndex((f) => claveGrupo(f.muestra, f.tiempo) === clave && Number(f.rep) === Number(x.rep))
    if (i < 0) {
      filas.push(ajustar({ ...filaVacia(x.muestra, x.rep, K, M), repManual: x.repExplicita }))
      i = filas.length - 1
      nuevas++
    } else actualizadas++
    const f = { ...filas[i], conteos: [...filas[i].conteos], od: { ...filas[i].od, lecturas: [...filas[i].od.lecturas] } }
    if (x.tiempo !== undefined) f.tiempo = x.tiempo
    if (x.vol !== undefined) f.vol = x.vol
    if (x.dprev !== undefined) f.dprev = x.dprev
    x.conteos?.forEach((v, k) => { if (v !== undefined) f.conteos[k] = v })
    if (x.od) {
      x.od.lecturas?.forEach((v, k) => { f.od.lecturas[k] = v })
      if (x.od.blanco !== undefined) f.od.blanco = x.od.blanco
      if (x.od.dil !== undefined) f.od.dil = x.od.dil
    }
    filas[i] = f
    if (x.origen) origen[x.muestra] = x.origen
  }))
  // las réplicas traídas por la tabla se respetan; si la tabla no las traía se numeran por orden
  s.setK(K)
  s.setM(M)
  s.setFilas(filas)
  const conVol = leidas.some((l) => l.tieneVol)
  s.setOpts((o) => ({
    ...o, origenOD: origen, ...(modo === 'reemplazar' ? { excluidos: [] } : {}), ...(conVol ? { volFijo: false } : {}),
    nombres: [...new Set([...(o.nombres || []), ...filas.map((f) => String(f.muestra).trim()).filter(Boolean)])],
  }))
  return { nuevas, actualizadas, conVol }
}

// Lee un Excel/CSV y lo incorpora
export async function importarArchivo(file, s, modo) {
  const hojas = await leerArchivo(file)
  const leidas = []
  const errores = []
  for (const h of hojas) {
    try { leidas.push(interpretarTabla(h.datos)) } catch (e) { errores.push(`${h.hoja}: ${e.message}`) }
  }
  if (!leidas.length) throw new Error(errores[0]?.replace(/^csv: /, '') || 'No encontré datos en el archivo.')
  const r = fusionar(leidas, s, modo)
  s.avisar(`${file.name}: ${r.nuevas} filas nuevas${r.actualizadas ? `, ${r.actualizadas} actualizadas` : ''}.`)
  if (r.conVol) s.avisar('El archivo trae volumen por fila: se desactivó «volumen fijo».')
}

// Pegado desde otra tabla. Con encabezados (Muestra, Tiempo, Réplica, -1…, OD…) cada dato va a su fila
// por muestra + tiempo + réplica. Sin encabezados se pega a partir de la celda elegida, como en Excel.
// Devuelve true si se encargó del pegado.
export function pegarTabla(texto, s) {
  const m = parsearCSV(texto.replace(/\r/g, ''))
  if (m.length < 2 || !tieneEncabezados(m)) return false
  try {
    const r = fusionar([interpretarTabla(m)], s, 'agregar')
    s.avisar(`Tabla pegada: ${r.nuevas} filas nuevas, ${r.actualizadas} completadas por muestra, tiempo y réplica.`)
    return true
  } catch (e) {
    s.avisar(e.message, 'error')
    return true
  }
}

// Pega un bloque sin encabezados (texto separado por tabulaciones) a partir de una celda.
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
export function moverFoco(tabla, r, c) {
  const sig = tabla?.querySelector(`input[data-r="${r}"][data-c="${c}"]`)
  if (sig) { sig.focus(); sig.select() }
  return !!sig
}
const todo = (inp) => inp.value.length > 0 && inp.selectionStart === 0 && inp.selectionEnd === inp.value.length
export function navegar(e) {
  const { r, c } = e.currentTarget.dataset
  let dr = 0, dc = 0
  const inp = e.currentTarget
  if (e.key === 'ArrowDown' || e.key === 'Enter') dr = e.shiftKey && e.key === 'Enter' ? -1 : 1
  else if (e.key === 'ArrowUp') dr = -1
  // con flechas laterales se cambia de celda si el cursor está en el borde o si toda la celda está seleccionada (como en Excel)
  else if (e.key === 'ArrowRight' && (inp.selectionStart === inp.value.length || todo(inp))) dc = 1
  else if (e.key === 'ArrowLeft' && (inp.selectionEnd === 0 || todo(inp))) dc = -1
  else return
  e.preventDefault()
  const tabla = inp.closest('table')
  // la fila de abajo puede no existir todavía (se crea al escribir): se espera un instante
  if (!moverFoco(tabla, Number(r) + dr, Number(c) + dc)) setTimeout(() => moverFoco(tabla, Number(r) + dr, Number(c) + dc), 30)
}
