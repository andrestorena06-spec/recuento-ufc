import { useState } from 'react'
import { moverFoco, navegar, pegarBloque, pegarTabla } from './importar.js'
import { claveGrupo, filaVacia } from '../modelo.js'

// Grilla tipo planilla compartida por Datos y OD.
// - Siempre hay una fila vacía al final: al escribir en ella pasa a ser una fila real y aparece otra.
// - Pegar una tabla con encabezados la reparte por muestra + tiempo + réplica; sin encabezados pega desde la celda.
// - Enter en una celda vacía de Muestra o Tiempo copia el valor de la fila de arriba.
// columnas: [{ id, titulo, sub, ayuda, get(f), set(f, v), copiarArriba, lista, clase(f), estilo, placeholder(f), izq, auto(f) }]
export function Grilla({ s, columnas, cabExtra, cabResultados = [], resultados, acciones, sel, onSel, normalizar }) {
  const [fantasma, setFantasma] = useState(() => filaVacia('', '', s.K, s.M))
  // las columnas «ocultas» (al final) solo sirven para recibir un bloque pegado más ancho que la grilla
  const vis = columnas.filter((c) => !c.oculta)
  const filas = [...s.filas, fantasma]
  const nombres = [...new Set([...(s.opts.nombres || []), ...s.filas.map((f) => String(f.muestra).trim())].filter(Boolean))]

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
  const alTeclear = (e, f, r, c, col) => {
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
    <div className="grilla-wrap">
      <datalist id="nombres-muestras">{nombres.map((n) => <option key={n} value={n} />)}</datalist>
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
                      <input data-r={r} data-c={c} value={v ?? ''} list={col.lista ? 'nombres-muestras' : undefined}
                        className={`${col.izq ? 'izq' : ''} ${col.auto?.(f) ? 'auto' : ''}`} style={col.estilo}
                        placeholder={esFantasma && c === 0 ? 'nueva fila…' : col.placeholder?.(f)}
                        onKeyDown={(e) => alTeclear(e, f, r, c, col)} onFocus={() => onSel?.(f.id)}
                        onBlur={col.id === 'muestra' ? (e) => guardarNombre(e.target.value) : undefined}
                        onPaste={(e) => alPegar(e, r, c)} onChange={(e) => cambiar(f, col, e.target.value)} />
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
    </div>
  )
}

// Columnas comunes: muestra, tiempo y réplica
export function columnasBase(s) {
  const u = s.opts.unidadTiempo || 'h'
  return [
    { id: 'muestra', titulo: 'Muestra', izq: true, lista: true, copiarArriba: true, get: (f) => f.muestra, set: (f, v) => ({ ...f, muestra: v }) },
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
