import { useState } from 'react'
import { moverFoco, navegar, pegarBloque, pegarTabla } from './importar.js'
import { claveGrupo, filaVacia } from '../modelo.js'

// Grilla tipo planilla compartida por Datos y OD.
// - Siempre hay una fila vacía al final: al escribir en ella pasa a ser una fila real y aparece otra.
// - Pegar una tabla con encabezados la reparte por muestra + tiempo + réplica; sin encabezados pega desde la celda.
// - Enter en una celda vacía de Tiempo copia el valor de la fila de arriba.
// - Al pararse en Muestra se abre la lista de muestras con la de la fila de arriba marcada: Enter la pone,
//   un clic elige otra, escribir filtra; flechas ↑↓ recorren la lista y Esc la cierra.
// columnas: [{ id, titulo, sub, ayuda, get(f), set(f, v), copiarArriba, lista, clase(f), estilo, placeholder(f), izq, auto(f) }]
export function Grilla({ s, columnas, cabExtra, cabResultados = [], resultados, acciones, sel, onSel, normalizar }) {
  const [fantasma, setFantasma] = useState(() => filaVacia('', '', s.K, s.M))
  // las columnas «ocultas» (al final) solo sirven para recibir un bloque pegado más ancho que la grilla
  const vis = columnas.filter((c) => !c.oculta)
  const filas = [...s.filas, fantasma]
  const nombres = [...new Set([...(s.opts.nombres || []), ...s.filas.map((f) => String(f.muestra).trim())].filter(Boolean))]
  const [lista, setLista] = useState(null) // { r, c, x, y, w, idx, escrito }

  const ajustada = (f) => ({
    ...f,
    conteos: Array.from({ length: s.K }, (_, i) => f.conteos[i] ?? ''),
    od: { ...f.od, lecturas: Array.from({ length: s.M }, (_, i) => f.od.lecturas[i] ?? '') },
  })
  const cambiar = (f, col, v) => {
    if (f.id === fantasma.id) {
      s.setFilas((fs) => [...fs, col.set(ajustada(fantasma), v)])
      setFantasma(filaVacia('', '', s.K, s.M))
    } else {
      s.actualizarFila(f.id, (g) => col.set(g, v))
    }
  }
  const guardarNombre = (v) => {
    const n = String(v ?? '').trim()
    if (n && !(s.opts.nombres || []).includes(n)) s.setOpts((o) => ({ ...o, nombres: [...(o.nombres || []), n] }))
  }
  const alPegar = (e, r, c) => {
    const texto = e.clipboardData.getData('text')
    if (pegarTabla(texto, s)) { e.preventDefault(); return }
    const nuevas = pegarBloque(texto, s.filas, r, c, (f, ci, v) => (columnas[ci] ? columnas[ci].set(f, v) : f), () => filaVacia('', '', s.K, s.M))
    if (!nuevas) return
    e.preventDefault()
    s.setFilas(normalizar ? normalizar(nuevas) : nuevas)
    nuevas.forEach((f) => guardarNombre(f.muestra))
  }
  // opciones de la lista de muestras para la fila r
  const opcionesDe = (r, valor) => {
    const q = String(valor ?? '').trim().toLowerCase()
    const arriba = r > 0 ? String(filas[r - 1].muestra ?? '').trim() : ''
    if (!q) return [...(arriba ? [arriba] : []), ...nombres.filter((n) => n !== arriba)]
    const empieza = nombres.filter((n) => n.toLowerCase().startsWith(q))
    return [...empieza, ...nombres.filter((n) => !empieza.includes(n) && n.toLowerCase().includes(q))].filter((n) => n.toLowerCase() !== q)
  }
  const abrirLista = (e, r, c, valor) => {
    const b = e.currentTarget.getBoundingClientRect()
    const vacio = String(valor ?? '').trim() === ''
    setLista({ r, c, x: b.left, y: b.bottom, w: Math.max(b.width, 200), idx: vacio ? 0 : -1 })
  }
  const elegir = (f, r, c, col, nombre, tabla) => {
    cambiar(f, col, nombre)
    guardarNombre(nombre)
    setLista(null)
    setTimeout(() => moverFoco(tabla, r, c + 1), 30)
  }
  const alTeclear = (e, f, r, c, col) => {
    if (col.id === 'muestra' && lista && lista.r === r) {
      const ops = opcionesDe(r, col.get(f))
      if (e.key === 'Escape') { setLista(null); return }
      if (ops.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault()
        const d = e.key === 'ArrowDown' ? 1 : -1
        setLista({ ...lista, idx: Math.max(-1, Math.min(ops.length - 1, lista.idx + d)) })
        return
      }
      if (e.key === 'Enter' && !e.shiftKey && lista.idx >= 0 && ops[lista.idx]) {
        e.preventDefault()
        elegir(f, r, c, col, ops[lista.idx], e.currentTarget.closest('table'))
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && col.copiarArriba && String(col.get(f) ?? '') === '' && r > 0) {
      const arriba = col.get(filas[r - 1])
      if (String(arriba ?? '') !== '') {
        e.preventDefault()
        cambiar(f, col, arriba)
        if (col.id === 'muestra') guardarNombre(arriba)
        const tabla = e.currentTarget.closest('table')
        setTimeout(() => moverFoco(tabla, r, c + 1), 30)
        return
      }
    }
    navegar(e)
  }

  return (
    <div className="grilla-wrap" onScroll={() => lista && setLista(null)}>
      <table className="grilla">
        <thead>
          <tr>
            {vis.map((col, i) => (
              <th key={col.id} className={i === 0 ? 'fijo' : ''} title={col.ayuda}>{col.titulo}{col.sub && <small>{col.sub}</small>}</th>
            ))}
            {cabExtra && <th>{cabExtra}</th>}
            {cabResultados.map((t, i) => <th key={i}>{t}</th>)}
            <th />
          </tr>
        </thead>
        <tbody>
          {filas.map((f, r) => {
            const esFantasma = f.id === fantasma.id
            const nuevaG = r > 0 && !esFantasma && claveGrupo(filas[r - 1].muestra, filas[r - 1].tiempo) !== claveGrupo(f.muestra, f.tiempo)
            return (
              <tr key={f.id} className={`${nuevaG ? 'grupo-ini' : ''} ${sel === f.id ? 'fila-sel' : ''} ${esFantasma ? 'fantasma' : ''}`}>
                {vis.map((col, c) => {
                  const v = col.get(f)
                  return (
                    <td key={col.id} className={`${c === 0 ? 'fijo' : ''} ${esFantasma ? '' : col.clase?.(f) || ''}`} style={col.estiloTd}>
                      <input data-r={r} data-c={c} value={v ?? ''} autoComplete="off"
                        className={`${col.izq ? 'izq' : ''} ${col.auto?.(f) ? 'auto' : ''}`} style={col.estilo}
                        placeholder={esFantasma && c === 0 ? 'nueva fila…' : col.placeholder?.(f)}
                        onKeyDown={(e) => alTeclear(e, f, r, c, col)}
                        onFocus={(e) => { onSel?.(f.id); if (col.lista) abrirLista(e, r, c, v) }}
                        onBlur={col.id === 'muestra' ? (e) => { guardarNombre(e.target.value); setLista((l) => (l && l.r === r ? null : l)) } : undefined}
                        onPaste={(e) => alPegar(e, r, c)}
                        onChange={(e) => {
                          cambiar(f, col, e.target.value)
                          if (col.lista) setLista((l) => (l && l.r === r ? { ...l, idx: e.target.value.trim() === '' ? 0 : -1 } : l))
                        }} />
                    </td>
                  )
                })}
                {cabExtra && <td />}
                {esFantasma ? cabResultados.map((_, i) => <td key={i} />) : resultados(f)}
                <td className="acc">{!esFantasma && acciones?.(f)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {lista && (() => {
        const f = filas[lista.r]
        const col = vis[lista.c]
        if (!f || !col) return null
        const ops = opcionesDe(lista.r, col.get(f))
        if (!ops.length) return null
        const arriba = lista.r > 0 ? String(filas[lista.r - 1].muestra ?? '').trim() : ''
        const vacio = String(col.get(f) ?? '').trim() === ''
        return (
          <div className="lista-muestras-pop" style={{ left: lista.x, top: lista.y + 2, minWidth: lista.w }}>
            {ops.map((n, i) => (
              <button key={n} className={i === lista.idx ? 'on' : ''} onMouseDown={(e) => {
                e.preventDefault()
                elegir(f, lista.r, lista.c, col, n, document.querySelector(`input[data-r="${lista.r}"][data-c="${lista.c}"]`)?.closest('table'))
              }}>
                <span>{n}</span>{vacio && n === arriba && i === 0 && <small>igual que arriba · Enter</small>}
              </button>
            ))}
          </div>
        )
      })()}
    </div>
  )
}

// Columnas comunes: muestra, tiempo y réplica
export function columnasBase(s) {
  const u = s.opts.unidadTiempo || 'h'
  return [
    { id: 'muestra', titulo: 'Muestra', izq: true, lista: true, copiarArriba: true, ayuda: 'Al pararte se abre la lista de muestras: Enter pone la de arriba, clic para elegir otra, o escribí un nombre nuevo.', get: (f) => f.muestra, set: (f, v) => ({ ...f, muestra: v }) },
    {
      id: 'tiempo', titulo: 'Tiempo', sub: u, copiarArriba: true, estilo: { minWidth: 58 }, ayuda: 'Momento de la toma. Enter en una celda vacía copia el de arriba.',
      get: (f) => f.tiempo, set: (f, v) => ({ ...f, tiempo: v }),
    },
    {
      id: 'rep', titulo: 'Rép.', estilo: { minWidth: 42, textAlign: 'center' }, ayuda: 'Se numera sola dentro de cada muestra y tiempo. Si escribís un número queda fijo.',
      get: (f) => f.rep, auto: (f) => !f.repManual,
      set: (f, v) => (String(v).trim() === '' ? { ...f, rep: '', repManual: false } : { ...f, rep: Number(v) || f.rep, repManual: true }),
    },
  ]
}
