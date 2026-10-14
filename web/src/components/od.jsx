import { useRef, useState } from 'react'
import { Campo, Check, Modal, Select } from './ui.jsx'
import { Grilla, columnasBase } from './grilla.jsx'
import { Ayuda, Calc } from './tip.jsx'
import { dCociente, dCV, dDE, dODCorr, dUFC } from '../desarrollos.js'
import { GraficoTiempo, etiquetaDil } from './datos.jsx'
import { importarArchivo } from './importar.js'
import { etiquetaK, lineal, linealidadOD, odCorregida, odDeFila, resumenPorTiempo, ventanaLineal } from '../calibracion.js'
import { claveGrupo, etiquetaGrupo, filaEnUso, tNorm, tNum } from '../modelo.js'
import { calcularFila, cient, factorDe, potDil, proporcion, sup, textoResultado } from '../ufc.js'
import { finito } from '../estadistica.js'
import { paletaMuestras } from '../utils.js'

export const ONDAS = [['600', '600 nm (OD₆₀₀, bacterias)'], ['595', '595 nm'], ['590', '590 nm'], ['620', '620 nm'], ['630', '630 nm'],
  ['650', '650 nm'], ['540', '540 nm'], ['550', '550 nm'], ['560', '560 nm'], ['660', '660 nm'], ['otra', 'Otra…']]
export const ondaDe = (o) => (o.onda === 'otra' ? o.ondaOtra || '?' : o.onda)

export function ODTab({ s }) {
  const { filas, M, opts: o } = s
  const archivoRef = useRef()
  const u = o.unidadTiempo || 'h'
  const lin = ventanaLineal(o)
  const Fd = factorDe(o)

  const setLectura = (i) => (f, v) => {
    const lecturas = [...f.od.lecturas]
    while (lecturas.length <= i) lecturas.push('')
    lecturas[i] = v
    return { ...f, od: { ...f.od, lecturas } }
  }
  const columnas = [
    ...columnasBase(s),
    ...Array.from({ length: M }, (_, k) => ({
      id: 'l' + k, titulo: etiquetaDil(k), sub: k ? `OD · ${Fd === 10 ? '10' + sup(-k) : proporcion(k, Fd)}` : 'OD', estilo: { minWidth: 66 },
      ayuda: k ? `OD leída en la dilución ${potDil(k, Fd)} (la misma que se sembró en esa columna de la pestaña C)` : 'OD de la suspensión sin diluir',
      get: (f) => f.od.lecturas[k] ?? '', set: setLectura(k),
      clase: (f) => {
        const t = String(f.od.lecturas[k] ?? '').trim()
        if (t === '') return ''
        const v = Number(t.replace(',', '.'))
        if (!finito(v)) return 'mal'
        const neta = odDeFila(f, o).porDil.find((x) => x.k === k)?.od
        const oc = odCorregida(f, o)
        return oc.dils.includes(k) ? (oc.fuera ? 'od-fuera' : 'usada') : finito(neta) && (neta < lin[0] || neta > lin[1]) ? 'od-fuera-ventana' : ''
      },
    })),
    ...(o.blancoCorregido ? [] : [{
      id: 'blanco', titulo: 'Blanco', ayuda: 'OD del medio estéril. Vacío = blanco general', estilo: { minWidth: 64 },
      placeholder: () => o.blancoOD || '0', get: (f) => f.od.blanco, set: (f, v) => ({ ...f, od: { ...f.od, blanco: v } }),
    }]),
  ]
  const agregarLectura = () => { s.setFilas(filas.map((f) => ({ ...f, od: { ...f.od, lecturas: [...f.od.lecturas, ''] } }))); s.setM(M + 1) }
  const quitarLectura = () => {
    if (M <= 1) return
    if (filas.some((f) => String(f.od.lecturas[M - 1] ?? '').trim() !== '') && !window.confirm(`La columna ${etiquetaDil(M - 1)} tiene lecturas. ¿Quitarla?`)) return
    s.setFilas(filas.map((f) => ({ ...f, od: { ...f.od, lecturas: f.od.lecturas.slice(0, M - 1) } })))
    s.setM(M - 1)
  }
  const leer = async (file) => { try { await importarArchivo(file, s, 'agregar') } catch (e) { s.avisar(e.message, 'error') } }

  const colores = paletaMuestras(s.corr.muestras)
  // en el tiempo se grafica la OD corregida (la de la muestra sin diluir)
  const valores = filas.filter(filaEnUso).map((f) => {
    const oc = odCorregida(f, o)
    if (!finito(oc.od)) return null
    const et = etiquetaGrupo(f.muestra, f.tiempo, u)
    return { id: f.id, muestra: f.muestra, t: tNum(f.tiempo), etiqueta: et, y: oc.od, valido: !oc.fuera, titulo: `${et} réplica ${f.rep}: OD corregida ${oc.od.toFixed(3)}` }
  }).filter(Boolean)
  const medias = resumenPorTiempo(filas, o, s.curva).filter((p) => p.nOD).map((p) => ({ muestra: p.muestra, t: p.t, etiqueta: p.etiqueta, y: p.od, err: p.nOD > 1 ? [p.od - p.odDe, p.od + p.odDe] : null }))
  const linOD = linealidadOD(filas, o)
  // resumen por cepa y tiempo: OD neta media de cada dilución y OD corregida (media ± DE)
  const resumenOD = (() => {
    const en = filas.filter(filaEnUso)
    const grupos = [...new Set(en.map((f) => claveGrupo(f.muestra, f.tiempo)))]
    return grupos.map((gk) => {
      const fs = en.filter((f) => claveGrupo(f.muestra, f.tiempo) === gk)
      const ocs = fs.map((f) => odCorregida(f, o))
      const corrs = ocs.map((x) => x.od).filter(finito)
      const porDil = Array.from({ length: M }, (_, k) => {
        const vals = fs.map((f) => odDeFila(f, o).porDil.find((x) => x.k === k)?.od).filter(finito)
        return { vals, media: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN, usada: ocs.some((x) => x.dils.includes(k) && !x.fuera) }
      })
      const od = corrs.length ? corrs.reduce((a, b) => a + b, 0) / corrs.length : NaN
      const de = corrs.length > 1 ? Math.sqrt(corrs.reduce((a, b) => a + (b - od) ** 2, 0) / (corrs.length - 1)) : NaN
      return { grupo: gk, muestra: fs[0].muestra, tiempo: tNorm(fs[0].tiempo), t: tNum(fs[0].tiempo), n: corrs.length, porDil, od, de, corrs, fuera: ocs.some((x) => x.fuera) }
    }).filter((g) => g.porDil.some((d) => d.vals.length)).sort((a, b) => {
      const ma = en.findIndex((f) => f.muestra === a.muestra), mb = en.findIndex((f) => f.muestra === b.muestra)
      return ma !== mb ? ma - mb : (finito(a.t) ? a.t : Infinity) - (finito(b.t) ? b.t : Infinity)
    })
  })()

  return (
    <div className="pagina" style={{ maxWidth: 'none' }}>
      <section className="tarjeta">
        <div className="titulo-fila">
          <h2>OD · densidad óptica</h2>
          <div className="fila-ctrl" style={{ margin: 0 }}>
            <button className="primario" onClick={() => archivoRef.current.click()}>Cargar OD desde Excel</button>
            <input ref={archivoRef} type="file" hidden accept=".xlsx,.csv,.txt,.tsv" onChange={(e) => { e.target.files[0] && leer(e.target.files[0]); e.target.value = '' }} />
          </div>
        </div>
        <div className="fila-ctrl">
          <Campo label="Longitud de onda">
            <Select value={o.onda} onChange={(v) => s.setOpt('onda', v)} opciones={ONDAS} />
          </Campo>
          {o.onda === 'otra' && <Campo label="nm"><input type="number" style={{ width: 90 }} value={o.ondaOtra} onChange={(e) => s.setOpt('ondaOtra', e.target.value)} /></Campo>}
          <Campo label="Equipo">
            <Select value={o.equipo} onChange={(v) => s.setOpt('equipo', v)}
              opciones={[['cubeta', 'Espectrofotómetro, cubeta de 1 cm'], ['placa', 'Lector de microplacas'], ['otro', 'Otro']]} />
          </Campo>
          <Campo label="Ventana lineal del equipo (OD)">
            <div className="fila-ctrl" style={{ margin: 0, flexWrap: 'nowrap' }}>
              <input style={{ width: 70 }} value={o.odLinMin} onChange={(e) => s.setOpt('odLinMin', e.target.value)} />
              <span>a</span>
              <input style={{ width: 70 }} value={o.odLinMax} onChange={(e) => s.setOpt('odLinMax', e.target.value)} />
            </div>
          </Campo>
          <div style={{ alignSelf: 'center' }}>
            <Check label="Lecturas ya corregidas por el blanco (blanco = 0)" checked={o.blancoCorregido} onChange={(v) => s.setOpt('blancoCorregido', v)}
              ayuda="El equipo ya da la OD con el blanco restado: se ocultan las columnas de blanco" />
          </div>
          {!o.blancoCorregido && (
            <Campo label="Blanco general (OD del medio)">
              <input style={{ width: 130 }} placeholder="0" value={o.blancoOD} onChange={(e) => s.setOpt('blancoOD', e.target.value)} />
            </Campo>
          )}
        </div>
        <p className="ayuda" style={{ marginTop: 0 }}>
          Las filas son las mismas que en la pestaña C (muestra, tiempo y réplica) y las columnas son las mismas diluciones: en cada una va la OD leída en esa dilución de la serie
          (vacío = no se leyó). Cada lectura es un punto de la curva: su UFC/mL es la de la muestra ÷ {Fd}ᵏ.
          {o.blancoCorregido ? '' : ' OD neta = lectura − blanco (el de la fila o, si está vacío, el general).'}
          {' '}<b>OD corregida</b> = las lecturas que caen en la ventana lineal ({lin[0]}–{lin[1]}), multiplicadas por su dilución (OD × {Fd}ᵏ) y promediadas: es la OD de la muestra sin diluir
          (en verde las lecturas usadas; en amarillo las que quedan fuera de la ventana). Como cada dilución es 1:{Fd}, la OD debería bajar {Fd} veces por columna: el cociente de la derecha muestra hasta qué OD el equipo es lineal y sirve para ajustar la ventana.
          {o.equipo === 'placa' && ' En lector de microplacas el camino óptico depende del volumen del pocillo: usá siempre el mismo volumen y no mezcles la curva con lecturas de cubeta.'}
        </p>

        <Grilla s={s} columnas={columnas}
          cabExtra={<><button className="mas" title="Agregar otra lectura" onClick={agregarLectura}>+</button>{' '}
            <button className="mini" title="Quitar la última lectura" onClick={quitarLectura} disabled={M <= 1}>−</button></>}
          cabResultados={[<Ayuda key="a" clave="odCorr">OD corregida</Ayuda>, <Ayuda key="b" clave="cociente">OD ÷ OD siguiente</Ayuda>, <Ayuda key="c" clave="ufc">UFC/mL</Ayuda>]}
          resultados={(f) => {
            const d = odDeFila(f, o)
            const rc = calcularFila(f, o)
            const coc = []
            for (let i = 1; i < d.porDil.length; i++) {
              const a = d.porDil[i - 1], b = d.porDil[i]
              if (b.k === a.k + 1 && a.od > 0 && b.od > 0) coc.push([a, b])
            }
            const altos = d.porDil.filter((x) => x.od > 1).length
            const oc = odCorregida(f, o)
            return <>
              <td className="res">
                {finito(oc.od) ? <Calc d={dODCorr(oc, o, lin)}><b style={oc.fuera ? { color: '#8a5a00' } : {}}>{oc.od < 10 ? oc.od.toFixed(3) : oc.od.toFixed(1)}{oc.fuera ? ' ⚠' : ''}</b></Calc> : '–'}
              </td>
              <td className="res">
                {coc.length ? coc.map(([a, b], i) => {
                  const x = a.od / b.od
                  const malo = x < 0.8 * Fd || x > 1.25 * Fd
                  return <span key={i} style={{ color: malo ? '#8e2a1c' : undefined, fontWeight: malo ? 650 : undefined }}>{i ? ' · ' : ''}<Calc d={dCociente(a, b, Fd)}>×{x.toFixed(1)}</Calc></span>
                }) : '–'}
                {altos > 0 && <span style={{ color: '#8e2a1c' }} title="OD > 1: probablemente fuera del rango lineal"> ⚠</span>}
              </td>
              <td className="res"><Calc d={dUFC(rc)}>{textoResultado({ ...rc, N: rc.Nmadre })}</Calc></td>
            </>
          }}
          acciones={(f) => <button className="mini" title="Quitar fila (también en la pestaña C)" onClick={() => {
            if (filaEnUso(f) && !window.confirm('¿Quitar esta fila? También se quita de la pestaña C con sus recuentos.')) return
            s.setFilas(filas.filter((x) => x.id !== f.id))
          }}>×</button>} />
      </section>

      {resumenOD.length > 0 && (
        <div className="rejilla-2">
          <section className="tarjeta">
            <h2>OD por cepa y tiempo</h2>
            {linOD.nFilas > 0 && (
              <p className={lineal(linOD.factor, Fd) ? 'nota' : 'aviso-sel'} style={{ marginTop: 0 }}>
                Linealidad: la OD baja en promedio <b>×{linOD.factor.toFixed(1)}</b> por dilución (esperado ×{Fd}; {linOD.nFilas} {linOD.nFilas === 1 ? 'serie' : 'series'} con 2 o más lecturas &gt; 0,02).
              </p>
            )}
            <div className="tabla-scroll">
              <table className="tabla">
                <thead><tr>
                  <th>Cepa</th><th>Tiempo ({u})</th><th><Ayuda clave="n">n</Ayuda></th>
                  {Array.from({ length: M }, (_, k) => <th key={k}><Ayuda clave="odNeta">{k === 0 ? 'Sin diluir' : `−${k}`}</Ayuda></th>)}
                  <th><Ayuda clave="odCorr">OD corregida</Ayuda></th><th><Ayuda clave="cv">CV %</Ayuda></th>
                </tr></thead>
                <tbody>
                  {resumenOD.map((g) => (
                    <tr key={g.grupo}>
                      <td><i className="punto-placa" style={{ background: colores[g.muestra] }} /> <b>{g.muestra || '(sin nombre)'}</b></td>
                      <td>{g.tiempo || '–'}</td>
                      <td>{g.n}</td>
                      {g.porDil.map((d, k) => (
                        <td key={k} className={d.usada ? 'celda-usada' : ''}>{finito(d.media) ? <Calc d={dDE(d.vals, `OD neta media (${k === 0 ? 'sin diluir' : '−' + k})`, 3)}>{d.media.toFixed(3)}</Calc> : '–'}</td>
                      ))}
                      <td>{finito(g.od) ? <Calc d={g.corrs.length > 1 ? dDE(g.corrs, 'OD corregida: media ± DE de las réplicas', 3) : null}><b>{g.od.toFixed(3)}</b>{finito(g.de) ? ` ± ${g.de.toFixed(3)}` : ''}</Calc> : '–'}{g.fuera ? ' ⚠' : ''}</td>
                      <td>{g.corrs.length > 1 ? <Calc d={dCV(g.corrs)}>{(100 * g.de / g.od).toFixed(1)}</Calc> : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="nota">Media de la OD neta de las réplicas en cada dilución; en verde las diluciones que entran en la OD corregida (dentro de la ventana {lin[0]}–{lin[1]}). OD corregida: media ± DE entre réplicas. Pasá el mouse sobre un número para ver el cálculo.</p>
          </section>
          <section className="tarjeta">
            <h2>OD corregida {medias.some((m) => finito(m.t)) ? 'en el tiempo' : 'por muestra'}</h2>
            <GraficoTiempo s={s} valores={valores} medias={medias} colores={colores} ejeY={`OD corregida (${ondaDe(o)} nm)`} log={false} estilo={s.estilos.odTiempo} nombre="odTiempo" />
          </section>
        </div>
      )}

    </div>
  )
}
