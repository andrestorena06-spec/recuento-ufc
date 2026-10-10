import { useRef, useState } from 'react'
import { Campo, Check, Modal, Select } from './ui.jsx'
import { Grilla, columnasBase } from './grilla.jsx'
import { GraficoTiempo } from './datos.jsx'
import { importarArchivo } from './importar.js'
import { odDeFila } from '../calibracion.js'
import { filaEnUso } from '../modelo.js'
import { calcularFila, leerFactor, textoResultado } from '../ufc.js'
import { finito } from '../estadistica.js'
import { paletaMuestras } from '../utils.js'

export const ONDAS = [['600', '600 nm (OD₆₀₀, bacterias)'], ['595', '595 nm'], ['590', '590 nm'], ['620', '620 nm'], ['630', '630 nm'],
  ['650', '650 nm'], ['540', '540 nm'], ['550', '550 nm'], ['560', '560 nm'], ['660', '660 nm'], ['otra', 'Otra…']]
export const ondaDe = (o) => (o.onda === 'otra' ? o.ondaOtra || '?' : o.onda)

export function ODTab({ s }) {
  const { filas, M, opts: o } = s
  const [info, setInfo] = useState(false)
  const archivoRef = useRef()
  const u = o.unidadTiempo || 'h'

  const setLectura = (i) => (f, v) => {
    const lecturas = [...f.od.lecturas]
    while (lecturas.length <= i) lecturas.push('')
    lecturas[i] = v
    return { ...f, od: { ...f.od, lecturas } }
  }
  const columnas = [
    ...columnasBase(s),
    ...Array.from({ length: M }, (_, i) => ({
      id: 'l' + i, titulo: `OD ${M > 1 ? i + 1 : ''}`, sub: `${ondaDe(o)} nm`, estilo: { minWidth: 70 },
      get: (f) => f.od.lecturas[i] ?? '', set: setLectura(i),
    })),
    ...(o.blancoCorregido ? [] : [{
      id: 'blanco', titulo: 'Blanco', ayuda: 'OD del medio estéril. Vacío = blanco general', estilo: { minWidth: 64 },
      placeholder: () => o.blancoOD || '0', get: (f) => f.od.blanco, set: (f, v) => ({ ...f, od: { ...f.od, blanco: v } }),
    }]),
    {
      id: 'dil', titulo: 'Dil. lectura', sub: '1:F', ayuda: 'Factor de dilución de la suspensión leída respecto de la madre', estilo: { minWidth: 64 },
      placeholder: () => '1', clase: (f) => (finito(leerFactor(f.od.dil)) ? '' : 'mal'), get: (f) => f.od.dil, set: (f, v) => ({ ...f, od: { ...f.od, dil: v } }),
    },
  ]
  const agregarLectura = () => { s.setFilas(filas.map((f) => ({ ...f, od: { ...f.od, lecturas: [...f.od.lecturas, ''] } }))); s.setM(M + 1) }
  const quitarLectura = () => {
    if (M <= 1) return
    if (filas.some((f) => String(f.od.lecturas[M - 1] ?? '').trim() !== '') && !window.confirm(`La lectura ${M} tiene datos. ¿Quitarla?`)) return
    s.setFilas(filas.map((f) => ({ ...f, od: { ...f.od, lecturas: f.od.lecturas.slice(0, M - 1) } })))
    s.setM(M - 1)
  }
  const setOrigen = (m, v) => s.setOpt('origenOD', { ...o.origenOD, [m]: v })
  const leer = async (file) => { try { await importarArchivo(file, s, 'agregar') } catch (e) { s.avisar(e.message, 'error') } }

  const colores = paletaMuestras(s.corr.muestras)
  const valores = s.corr.ind.filter((p) => finito(p.x)).map((p) => ({ id: p.id, muestra: p.muestra, t: p.t, etiqueta: p.etiqueta, y: p.x, valido: true,
    titulo: `${p.etiqueta} réplica ${p.rep}: OD ${p.x.toFixed(3)}` }))
  const medias = s.corr.prom.filter((p) => p.nOD).map((p) => ({ muestra: p.muestra, t: p.t, etiqueta: p.etiqueta, y: p.x, err: p.nOD > 1 ? [p.x - p.xde, p.x + p.xde] : null }))

  return (
    <div className="pagina" style={{ maxWidth: 'none' }}>
      <section className="tarjeta">
        <div className="titulo-fila">
          <h2>OD · densidad óptica</h2>
          <div className="fila-ctrl" style={{ margin: 0 }}>
            <button onClick={() => setInfo(true)}>¿Misma suspensión o cultivo paralelo?</button>
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
          Las filas son las mismas que en Datos (muestra, tiempo y réplica). OD 1, 2… = lecturas repetidas de la misma suspensión (se promedian).
          {o.blancoCorregido ? ' OD neta = media de las lecturas.' : ' OD neta = media de las lecturas − blanco (el de la fila o, si está vacío, el general).'}
          {' '}Dil. lectura = si la OD se leyó en una dilución de la madre para quedar en el rango lineal (1:10 → 10).
          {o.equipo === 'placa' && ' En lector de microplacas el camino óptico depende del volumen del pocillo: usá siempre el mismo volumen y no mezcles la curva con lecturas de cubeta.'}
        </p>

        <Grilla s={s} columnas={columnas}
          cabExtra={<><button className="mas" title="Agregar otra lectura" onClick={agregarLectura}>+</button>{' '}
            <button className="mini" title="Quitar la última lectura" onClick={quitarLectura} disabled={M <= 1}>−</button></>}
          cabResultados={['OD neta', 'DE', 'Origen de la OD (por muestra)', 'UFC/mL madre']}
          resultados={(f) => {
            const d = odDeFila(f, o)
            const rc = calcularFila(f, o)
            return <>
              <td className="res" style={d.od > 1 ? { color: '#8e2a1c', fontWeight: 650 } : d.od < 0.05 && d.n ? { color: '#8a5a00' } : {}}
                title={d.od > 1 ? 'OD > 1: probablemente fuera del rango lineal; conviene diluir y leer de nuevo' : d.od < 0.05 && d.n ? 'OD muy baja: el error relativo de la lectura es grande' : ''}>
                {finito(d.od) ? d.od.toFixed(3) : '–'}</td>
              <td className="res">{finito(d.de) ? d.de.toFixed(3) : ''}</td>
              <td>
                <select value={o.origenOD?.[f.muestra] || 'misma'} onChange={(e) => setOrigen(f.muestra, e.target.value)} style={{ border: 'none', background: 'transparent', padding: '4px 6px' }}>
                  <option value="misma">Misma suspensión sembrada</option>
                  <option value="paralelo">Cultivo paralelo</option>
                </select>
              </td>
              <td className="res">{textoResultado({ ...rc, N: rc.Nmadre })}</td>
            </>
          }}
          acciones={(f) => <button className="mini" title="Quitar fila (también en Datos)" onClick={() => {
            if (filaEnUso(f) && !window.confirm('¿Quitar esta fila? También se quita de Datos con sus recuentos.')) return
            s.setFilas(filas.filter((x) => x.id !== f.id))
          }}>×</button>} />
      </section>

      {s.corr.prom.length > 0 && (
        <div className="rejilla-2">
          <section className="tarjeta">
            <h2>OD por muestra y tiempo</h2>
            <div className="tabla-scroll">
              <table className="tabla">
                <thead><tr><th>Muestra</th><th>Tiempo ({u})</th><th>n</th><th>OD media</th><th>DE</th><th>CV %</th><th>En la curva (modo individual)</th></tr></thead>
                <tbody>
                  {s.corr.prom.map((p) => (
                    <tr key={p.grupo}>
                      <td><i className="punto-placa" style={{ background: colores[p.muestra] }} /> <b>{p.muestra || '(sin nombre)'}</b></td>
                      <td>{p.tiempo || '–'}</td>
                      <td>{p.nOD}</td>
                      <td>{finito(p.x) ? p.x.toFixed(3) : '–'}</td>
                      <td>{finito(p.xde) ? p.xde.toFixed(3) : '–'}</td>
                      <td>{finito(p.xde) && p.x ? (100 * p.xde / p.x).toFixed(1) : '–'}</td>
                      <td className="ayuda">{p.origen === 'paralelo' ? 'Un punto: OD media vs. UFC media' : 'Un punto por réplica'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="tarjeta">
            <h2>OD {medias.some((m) => finito(m.t)) ? 'en el tiempo' : 'por muestra'}</h2>
            <GraficoTiempo s={s} valores={valores} medias={medias} colores={colores} ejeY={`OD a ${ondaDe(o)} nm`} log={false} estilo={s.estilos.odTiempo} nombre="odTiempo" />
          </section>
        </div>
      )}

      {info && (
        <Modal titulo="¿La OD es de la misma suspensión que se sembró?" ancho={680} onClose={() => setInfo(false)}
          pie={<button className="primario" onClick={() => setInfo(false)}>Entendido</button>}>
          <p><b>Sí afecta el procesamiento</b>, por eso se puede indicar para cada muestra.</p>
          <h4>Misma suspensión (emparejada)</h4>
          <p>La OD se leyó en el mismo tubo del que se sacó la alícuota para las diluciones y la siembra. Cada réplica aporta un par (OD, UFC/mL) real:
            la OD y las UFC de esa réplica describen la misma población de células. Se puede usar cada réplica como un punto de la curva
            (modo <i>individual</i>), y la dispersión alrededor de la curva refleja el error de medición de la relación OD↔UFC.</p>
          <h4>Cultivo paralelo (independiente)</h4>
          <p>La OD se leyó en otro tubo preparado en las mismas condiciones. La réplica 1 de OD y la réplica 1 de UFC <b>no son el mismo cultivo</b>:
            emparejarlas sería arbitrario. Lo correcto es comparar el <b>promedio</b> de OD con el <b>promedio</b> de UFC de esa muestra en ese tiempo;
            por eso, en modo individual, estas muestras aportan un único punto por tiempo.</p>
          <p>Además, la diferencia entre cultivos se suma al error: la curva tendrá más dispersión y la predicción será menos precisa.</p>
          <p className="ayuda">En modo <i>promedio</i> no hay diferencia: todos los grupos entran como OD media vs. UFC media (media geométrica).</p>
        </Modal>
      )}
    </div>
  )
}
