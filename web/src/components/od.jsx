import { useRef, useState } from 'react'
import { Campo, Modal, Select } from './ui.jsx'
import { importarArchivo, navegar, pegarBloque } from './importar.js'
import { filaVacia } from '../modelo.js'
import { odDeFila } from '../calibracion.js'
import { calcularFila, cient, leerFactor, nombreRep, textoResultado } from '../ufc.js'
import { finito } from '../estadistica.js'

export const ONDAS = [['600', '600 nm (OD₆₀₀, bacterias)'], ['595', '595 nm'], ['590', '590 nm'], ['620', '620 nm'], ['630', '630 nm'],
  ['650', '650 nm'], ['540', '540 nm'], ['550', '550 nm'], ['560', '560 nm'], ['660', '660 nm'], ['otra', 'Otra…']]
export const ondaDe = (o) => (o.onda === 'otra' ? o.ondaOtra || '?' : o.onda)

export function ODTab({ s }) {
  const { filas, M, opts: o } = s
  const [info, setInfo] = useState(false)
  const archivoRef = useRef()

  const setCelda = (f, c, v) => {
    if (c === 0) return { ...f, muestra: v }
    if (c === 1) return { ...f, rep: v === '' ? '' : Number(v) || f.rep }
    const od = { ...f.od, lecturas: [...f.od.lecturas] }
    if (c - 2 < M) od.lecturas[c - 2] = v
    else if (c - 2 === M) od.blanco = v
    else if (c - 2 === M + 1) od.dil = v
    return { ...f, od }
  }
  const cambiar = (id, c, v) => s.actualizarFila(id, (f) => setCelda(f, c, v))
  const alPegar = (e, r, c) => {
    const nuevas = pegarBloque(e.clipboardData.getData('text'), filas, r, c, setCelda, () => filaVacia('', 1, s.K, M))
    if (!nuevas) return
    e.preventDefault()
    s.setFilas(nuevas)
  }
  const agregarLectura = () => { s.setFilas(filas.map((f) => ({ ...f, od: { ...f.od, lecturas: [...f.od.lecturas, ''] } }))); s.setM(M + 1) }
  const quitarLectura = () => {
    if (M <= 1) return
    if (filas.some((f) => String(f.od.lecturas[M - 1] ?? '').trim() !== '') && !window.confirm(`La lectura ${M} tiene datos. ¿Quitarla?`)) return
    s.setFilas(filas.map((f) => ({ ...f, od: { ...f.od, lecturas: f.od.lecturas.slice(0, M - 1) } })))
    s.setM(M - 1)
  }
  const setOrigen = (m, v) => s.setOpt('origenOD', { ...o.origenOD, [m]: v })
  const leer = async (file) => { try { await importarArchivo(file, s, 'agregar') } catch (e) { s.avisar(e.message, 'error') } }

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
          <Campo label="Blanco general (OD del medio)">
            <input style={{ width: 130 }} placeholder="0 (ya restado)" value={o.blancoOD} onChange={(e) => s.setOpt('blancoOD', e.target.value)} />
          </Campo>
        </div>
        <p className="ayuda" style={{ marginTop: 0 }}>
          Lecturas 1, 2… = lecturas repetidas de la misma suspensión (se promedian). OD neta = media de las lecturas − blanco (el de la fila o, si está vacío, el general).
          Dil. lectura = si la OD se leyó en una dilución de la madre para quedar en el rango lineal (1:10 → 10); la UFC/mL de esa suspensión se calcula dividiendo la de la madre por ese factor.
          {o.equipo === 'placa' && ' En lector de microplacas el camino óptico depende del volumen del pocillo: usá siempre el mismo volumen y no mezcles la curva con lecturas de cubeta.'}
        </p>

        {!filas.length ? (
          <div className="vacio">Primero cargá las muestras en <button className="enlace" onClick={() => s.irA('datos')}>Datos</button> (o cargá acá un Excel con OD: se crean las filas).</div>
        ) : (
          <div className="grilla-wrap">
            <table className="grilla">
              <thead>
                <tr>
                  <th className="fijo">Muestra</th><th>Rép.</th>
                  {Array.from({ length: M }, (_, i) => <th key={i}>OD {M > 1 ? i + 1 : ''}<small>{ondaDe(o)} nm</small></th>)}
                  <th><button className="mas" title="Agregar otra lectura" onClick={agregarLectura}>+</button>{' '}
                    <button className="mini" title="Quitar la última lectura" onClick={quitarLectura} disabled={M <= 1}>−</button></th>
                  <th title="Vacío = blanco general">Blanco</th>
                  <th title="Factor de dilución de la suspensión leída respecto de la madre">Dil. lectura<small>1:F</small></th>
                  <th>OD neta</th><th>DE</th>
                  <th>Origen de la OD</th>
                  <th>UFC/mL madre</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, r) => {
                  const d = odDeFila(f, o)
                  const nueva = r === 0 || filas[r - 1].muestra !== f.muestra
                  const idx = filas.map((x, i) => (x.muestra === f.muestra ? i : -1)).filter((i) => i >= 0)
                  const contiguas = idx[idx.length - 1] - idx[0] === idx.length - 1
                  const inp = (c, valor, extra = {}) => (
                    <input data-r={r} data-c={c} value={valor ?? ''} onKeyDown={navegar}
                      onPaste={(e) => alPegar(e, r, c)} onChange={(e) => cambiar(f.id, c, e.target.value)} {...extra} />
                  )
                  const rc = calcularFila(f, o)
                  const origen = o.origenOD?.[f.muestra] || 'misma'
                  const selOrigen = (
                    <select value={origen} onChange={(e) => setOrigen(f.muestra, e.target.value)} style={{ border: 'none', background: 'transparent', padding: '4px 6px' }}>
                      <option value="misma">Misma suspensión sembrada</option>
                      <option value="paralelo">Cultivo paralelo</option>
                    </select>
                  )
                  return (
                    <tr key={f.id} className={nueva ? 'grupo-ini' : ''}>
                      <td className="fijo">{inp(0, f.muestra, { className: 'izq' })}</td>
                      <td style={{ width: 50 }}>{inp(1, f.rep, { style: { minWidth: 40, textAlign: 'center' } })}</td>
                      {Array.from({ length: M }, (_, i) => <td key={i}>{inp(2 + i, f.od.lecturas[i], { style: { minWidth: 70 } })}</td>)}
                      <td />
                      <td>{inp(2 + M, f.od.blanco, { placeholder: o.blancoOD || '0', style: { minWidth: 64 } })}</td>
                      <td className={finito(leerFactor(f.od.dil)) ? '' : 'mal'}>{inp(3 + M, f.od.dil, { placeholder: '1', style: { minWidth: 64 } })}</td>
                      <td className="res" style={d.od > 1 ? { color: '#8e2a1c', fontWeight: 650 } : d.od < 0.05 && d.n ? { color: '#8a5a00' } : {}}
                        title={d.od > 1 ? 'OD > 1: probablemente fuera del rango lineal; conviene diluir y leer de nuevo' : d.od < 0.05 && d.n ? 'OD muy baja: el error relativo de la lectura es grande' : ''}>
                        {finito(d.od) ? d.od.toFixed(3) : '–'}</td>
                      <td className="res">{finito(d.de) ? d.de.toFixed(3) : ''}</td>
                      {!contiguas ? <td>{selOrigen}</td>
                        : r === idx[0] ? <td rowSpan={idx.length} style={{ verticalAlign: 'top', background: '#fffcf7' }}>{selOrigen}</td> : null}
                      <td className="res">{textoResultado({ ...rc, N: rc.Nmadre })}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {filas.length > 0 && (
          <div className="fila-ctrl">
            <button className="chico" onClick={() => s.setFilas([...filas, filaVacia('', 1, s.K, M)])}>+ Fila</button>
            <span className="nota">Las filas son las mismas que en Datos: agregar o quitar una fila acá también lo hace allá.</span>
          </div>
        )}
      </section>

      <section className="tarjeta">
        <h2>Resumen de la OD por muestra</h2>
        <div className="tabla-scroll">
          <table className="tabla">
            <thead><tr><th>Muestra</th><th>Réplicas con OD</th><th>OD media</th><th>DE</th><th>CV %</th><th>Origen</th><th>Cómo entra en la curva (modo individual)</th></tr></thead>
            <tbody>
              {s.corr.prom.map((p) => (
                <tr key={p.muestra}>
                  <td><b>{p.muestra || '(sin nombre)'}</b></td>
                  <td>{p.nOD}</td>
                  <td>{finito(p.x) ? p.x.toFixed(3) : '–'}</td>
                  <td>{finito(p.xde) ? p.xde.toFixed(3) : '–'}</td>
                  <td>{finito(p.xde) && p.x ? (100 * p.xde / p.x).toFixed(1) : '–'}</td>
                  <td>{p.origen === 'paralelo' ? 'Cultivo paralelo' : 'Misma suspensión'}</td>
                  <td className="ayuda">{p.origen === 'paralelo' ? 'Un punto: OD media vs. UFC media' : 'Un punto por réplica (OD y UFC emparejadas)'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

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
            emparejarlas sería arbitrario (podrías emparejar la 1 con la 3 y obtener otra curva). Lo correcto es comparar el <b>promedio</b> de OD con el
            <b> promedio</b> de UFC de esa condición; por eso, en modo individual, estas muestras aportan un único punto (sus medias).</p>
          <p>Además, la diferencia entre cultivos se suma al error: la curva tendrá más dispersión y la predicción será menos precisa. Si podés, para
            construir la curva de calibración leé la OD en la misma suspensión que sembrás.</p>
          <p className="ayuda">En modo <i>promedio</i> no hay diferencia: todas las muestras entran como OD media vs. UFC media (media geométrica).</p>
        </Modal>
      )}
    </div>
  )
}
