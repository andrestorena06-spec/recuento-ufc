import { useMemo, useRef, useState } from 'react'
import { Campo, Check, Modal, Select } from './ui.jsx'
import { PanelGrafico } from './panelGrafico.jsx'
import { importarArchivo, navegar, pegarBloque } from './importar.js'
import { filaVacia } from '../modelo.js'
import { calcularFila, cient, ESTADOS, INCONTABLE, leerConteo, leerFactor, METODOS_UFC, RANGOS, rangoDe, sup, textoResultado, esValor, nombreRep } from '../ufc.js'
import { resumen, finito } from '../estadistica.js'
import { excelDe, plantilla, separarReplica } from '../excel.js'
import { descargarBlob, paletaMuestras } from '../utils.js'

export const etiquetaDil = (k) => (k === 0 ? 'Sin diluir' : `−${k}`)

// Resumen por muestra con las réplicas que dan un valor (escala log₁₀, como es habitual con UFC)
export function resumenMuestras(filas, o) {
  const muestras = [...new Set(filas.map((f) => f.muestra))]
  return muestras.map((m) => {
    const rs = filas.filter((f) => f.muestra === m).map((f) => calcularFila(f, o))
    const vals = rs.filter((r) => esValor(r, o.incluirEstimados) && r.Nmadre > 0)
    const logs = vals.map((r) => r.logMadre)
    const R = resumen(logs)
    return {
      muestra: m, nRep: rs.length, n: R.n, logMedia: R.media, logDe: R.de, logIc: R.ic,
      geo: 10 ** R.media, icGeo: [10 ** (R.media - R.ic), 10 ** (R.media + R.ic)],
      aritm: vals.length ? vals.reduce((s, r) => s + r.Nmadre, 0) / vals.length : NaN,
      cv: vals.length > 1 ? resumen(vals.map((r) => r.Nmadre)).cv : NaN,
      censurados: rs.filter((r) => ESTADOS[r.estado][1] === 'cens').length,
      estimados: rs.filter((r) => ESTADOS[r.estado][1] === 'est').length,
    }
  })
}

export function DatosTab({ s }) {
  const { filas, K, opts: o } = s
  const [importar, setImportar] = useState(null)
  const [sel, setSel] = useState(null)
  const archivoRef = useRef()
  const [L, U] = rangoDe(o)
  const resultados = useMemo(() => Object.fromEntries(filas.map((f) => [f.id, calcularFila(f, o)])), [filas, o])
  const hayPrevia = filas.some((f) => String(f.dprev ?? '').trim() !== '' && leerFactor(f.dprev) !== 1)
  const resumenM = useMemo(() => resumenMuestras(filas, o), [filas, o])
  const colores = paletaMuestras(resumenM.map((r) => r.muestra))

  const setCelda = (f, c, v) => {
    if (c === 0) return { ...f, muestra: v }
    if (c === 1) return { ...f, rep: v === '' ? '' : Number(v) || f.rep }
    if (c === 2) return { ...f, vol: v }
    if (c === 3) return { ...f, dprev: v }
    const k = c - 4
    const conteos = [...f.conteos]
    while (conteos.length <= k) conteos.push('')
    conteos[k] = v
    return { ...f, conteos }
  }
  const cambiar = (id, c, v) => s.actualizarFila(id, (f) => setCelda(f, c, v))
  const alPegar = (e, r, c) => {
    // al pegar, un nombre con réplica (L100A1₂, L100A1_2, L100A1 (2)) se separa en muestra y réplica
    const setPegado = (f, col, v) => {
      if (col !== 0) return setCelda(f, col, v)
      const [m, rep] = separarReplica(v)
      return rep ? { ...f, muestra: m, rep } : { ...f, muestra: v }
    }
    const nuevas = pegarBloque(e.clipboardData.getData('text'), filas, r, c, setPegado, () => filaVacia('', 1, K, s.M))
    if (!nuevas) return
    e.preventDefault()
    const k = Math.max(K, ...nuevas.map((f) => f.conteos.length))
    s.setK(k)
    s.setFilas(nuevas.map((f) => ({ ...f, conteos: Array.from({ length: k }, (_, i) => f.conteos[i] ?? '') })))
  }

  const agregarFila = () => s.setFilas([...filas, filaVacia('', 1, K, s.M)])
  const agregarReplica = (f) => {
    const reps = filas.filter((x) => x.muestra === f.muestra)
    const nueva = { ...filaVacia(f.muestra, Math.max(...reps.map((x) => Number(x.rep) || 0)) + 1, K, s.M), vol: f.vol, dprev: f.dprev }
    const ultimo = filas.lastIndexOf(reps[reps.length - 1])
    s.setFilas([...filas.slice(0, ultimo + 1), nueva, ...filas.slice(ultimo + 1)])
  }
  const quitar = (f) => {
    const tiene = f.conteos.some((c) => String(c).trim() !== '') || f.od.lecturas.some((c) => String(c).trim() !== '')
    if (tiene && !window.confirm(`¿Quitar ${nombreRep(f.muestra || 'la fila', f.rep)} con sus recuentos y su OD?`)) return
    s.setFilas(filas.filter((x) => x.id !== f.id))
  }
  const quitarColumna = () => {
    if (K <= 1) return
    if (filas.some((f) => String(f.conteos[K - 1] ?? '').trim() !== '') && !window.confirm(`La columna ${etiquetaDil(K - 1)} tiene datos. ¿Quitarla?`)) return
    s.setFilas(filas.map((f) => ({ ...f, conteos: f.conteos.slice(0, K - 1) })))
    s.setK(K - 1)
  }
  const agregarColumna = () => { s.setFilas(filas.map((f) => ({ ...f, conteos: [...f.conteos, ''] }))); s.setK(K + 1) }

  const elegirArchivo = (modo) => { setImportar(null); archivoRef.current.dataset.modo = modo; archivoRef.current.click() }
  const leer = async (file) => {
    try { await importarArchivo(file, s, archivoRef.current.dataset.modo || 'agregar') } catch (e) { s.avisar(e.message, 'error') }
  }

  const exportar = () => {
    const cols = ['Muestra', 'Réplica', 'Volumen (µL)', 'Dilución previa', ...Array.from({ length: K }, (_, k) => etiquetaDil(k).replace('−', '-')),
      'Diluciones usadas', 'UFC/mL', 'IC95 inferior', 'IC95 superior', 'log10 UFC/mL', 'UFC/mL madre', 'log10 UFC/mL madre', 'Estado', 'Avisos']
    const datos = filas.map((f) => {
      const r = resultados[f.id]
      const val = ESTADOS[r.estado][1] !== 'vacio'
      return {
        Muestra: f.muestra, Réplica: f.rep, 'Volumen (µL)': Number(f.vol) || Number(o.volDef), 'Dilución previa': leerFactor(f.dprev),
        ...Object.fromEntries(f.conteos.map((c, k) => { const v = leerConteo(c); return [etiquetaDil(k).replace('−', '-'), v === INCONTABLE ? 'INC' : v] })),
        'Diluciones usadas': r.dils.map((k) => (k === 0 ? '0' : '-' + k)).join(', '),
        'UFC/mL': val ? r.N : null, 'IC95 inferior': val ? r.ic[0] : null, 'IC95 superior': val ? r.ic[1] : null, 'log10 UFC/mL': r.log,
        'UFC/mL madre': val ? r.Nmadre : null, 'log10 UFC/mL madre': r.logMadre, Estado: ESTADOS[r.estado][0], Avisos: r.avisos.join('; '),
      }
    })
    const colsM = ['Muestra', 'Réplicas', 'n con valor', 'Media log10 UFC/mL', 'DE log10', 'Media geométrica UFC/mL', 'IC95 inf', 'IC95 sup', 'Media aritmética UFC/mL', 'CV %']
    const filasM = resumenM.map((m) => ({ Muestra: m.muestra, Réplicas: m.nRep, 'n con valor': m.n, 'Media log10 UFC/mL': m.logMedia, 'DE log10': m.logDe,
      'Media geométrica UFC/mL': m.geo, 'IC95 inf': m.icGeo[0], 'IC95 sup': m.icGeo[1], 'Media aritmética UFC/mL': m.aritm, 'CV %': m.cv }))
    excelDe([{ nombre: 'Recuentos', columnas: cols, filas: datos }, { nombre: 'Por muestra', columnas: colsM, filas: filasM }])
      .then((b) => descargarBlob(b, 'recuento_ufc.xlsx'))
  }

  const filaSel = filas.find((f) => f.id === sel)
  return (
    <div className="pagina" style={{ maxWidth: 'none' }}>
      <section className="tarjeta">
        <div className="titulo-fila">
          <h2>Datos · recuento de colonias</h2>
          <div className="fila-ctrl" style={{ margin: 0 }}>
            <button onClick={() => plantilla().then((b) => descargarBlob(b, 'plantilla_recuento_ufc.xlsx'))}>Plantilla Excel</button>
            <button className="primario" onClick={() => (filas.length ? setImportar(true) : elegirArchivo('agregar'))}>Cargar Excel</button>
            <button onClick={exportar} disabled={!filas.length}>Descargar resultados</button>
            <input ref={archivoRef} type="file" hidden accept=".xlsx,.csv,.txt,.tsv" onChange={(e) => { e.target.files[0] && leer(e.target.files[0]); e.target.value = '' }} />
          </div>
        </div>
        <div className="fila-ctrl">
          <Campo label="Rango contable (colonias por placa)">
            <Select value={o.rango} onChange={(v) => s.setOpt('rango', v)} opciones={RANGOS.map((r) => [r[0], r[1]])} />
          </Campo>
          {o.rango === 'custom' && <>
            <Campo label="Mínimo"><input type="number" style={{ width: 80 }} value={o.min} onChange={(e) => s.setOpt('min', e.target.value)} /></Campo>
            <Campo label="Máximo"><input type="number" style={{ width: 80 }} value={o.max} onChange={(e) => s.setOpt('max', e.target.value)} /></Campo>
          </>}
          <Campo label="Cálculo con varias diluciones en rango">
            <Select value={o.metodo} onChange={(v) => s.setOpt('metodo', v)} opciones={METODOS_UFC} />
          </Campo>
          <Campo label="Volumen sembrado por defecto (µL)">
            <input type="number" style={{ width: 110 }} value={o.volDef} onChange={(e) => s.setOpt('volDef', e.target.value)} />
          </Campo>
          <div style={{ alignSelf: 'center' }}>
            <Check label="Usar recuentos estimados (fuera del rango)" checked={o.incluirEstimados} onChange={(v) => s.setOpt('incluirEstimados', v)}
              ayuda="Entran en promedios y en la curva. Los «<» y «>» nunca entran." />
          </div>
        </div>

        {!filas.length ? (
          <div className="vacio" style={{ margin: '10px 0' }}>
            <p><b>Todavía no hay datos.</b></p>
            <p>Cargá un Excel con el formato de la plantilla, pegá una tabla copiada de Excel en la grilla, o empezá con una fila vacía.</p>
            <div className="fila-ctrl" style={{ justifyContent: 'center' }}>
              <button className="primario" onClick={agregarFila}>Empezar con una fila vacía</button>
            </div>
          </div>
        ) : (
          <div className="grilla-wrap">
            <table className="grilla">
              <thead>
                <tr>
                  <th className="fijo">Muestra</th>
                  <th title="Número de réplica">Rép.</th>
                  <th title={`Volumen sembrado en cada placa. Vacío = ${o.volDef} µL`}>Vol.<small>µL</small></th>
                  <th title="Dilución de la suspensión «sin diluir» respecto de la muestra madre (1, 1:10, 100, 10^-2…)">Dil. previa<small>1:F</small></th>
                  {Array.from({ length: K }, (_, k) => (
                    <th key={k} title={k ? `Dilución 10⁻${k}` : 'Suspensión sin diluir'}>{etiquetaDil(k)}{k > 0 && <small>10{sup(-k)}</small>}</th>
                  ))}
                  <th>
                    <button className="mas" title="Agregar una dilución más" onClick={agregarColumna}>+</button>{' '}
                    <button className="mini" title="Quitar la última dilución" onClick={quitarColumna} disabled={K <= 1}>−</button>
                  </th>
                  <th>UFC/mL</th>
                  <th>IC 95 %</th>
                  {hayPrevia && <th>UFC/mL madre</th>}
                  <th>Estado</th>
                  <th>Avisos</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filas.map((f, r) => {
                  const res = resultados[f.id]
                  const usadas = new Set(res.dils)
                  const nueva = r === 0 || filas[r - 1].muestra !== f.muestra
                  const inp = (c, valor, extra = {}) => (
                    <input data-r={r} data-c={c} value={valor ?? ''} onKeyDown={navegar} onFocus={() => setSel(f.id)}
                      onPaste={(e) => alPegar(e, r, c)} onChange={(e) => cambiar(f.id, c, e.target.value)} {...extra} />
                  )
                  return (
                    <tr key={f.id} className={`${nueva ? 'grupo-ini' : ''} ${sel === f.id ? 'fila-sel' : ''}`}>
                      <td className="fijo">{inp(0, f.muestra, { className: 'izq', placeholder: 'L100A1' })}</td>
                      <td style={{ width: 50 }}>{inp(1, f.rep, { style: { minWidth: 40, textAlign: 'center' } })}</td>
                      <td>{inp(2, f.vol, { placeholder: String(o.volDef), style: { minWidth: 58 } })}</td>
                      <td className={finito(leerFactor(f.dprev)) ? '' : 'mal'}>{inp(3, f.dprev, { placeholder: '1', style: { minWidth: 64 } })}</td>
                      {Array.from({ length: K }, (_, k) => {
                        const v = f.conteos[k] ?? ''
                        const c = leerConteo(v)
                        const cls = usadas.has(k) ? 'usada' : c === INCONTABLE ? 'inc' : String(v).trim() !== '' && c === null ? 'mal' : ''
                        return <td key={k} className={cls}>{inp(4 + k, v)}</td>
                      })}
                      <td />
                      <td className="res"><b>{textoResultado(res)}</b></td>
                      <td className="res">{finito(res.ic[0]) && ESTADOS[res.estado][1] !== 'cens' ? `${cient(res.ic[0], 1)} – ${cient(res.ic[1], 1)}` : ''}</td>
                      {hayPrevia && <td className="res">{ESTADOS[res.estado][1] === 'vacio' ? '–' : cient(res.Nmadre)}</td>}
                      <td className="res" style={{ textAlign: 'center' }}><span className={`estado ${ESTADOS[res.estado][1]}`}>{ESTADOS[res.estado][0]}</span></td>
                      <td className="res avisos-fila">{res.avisos.join(' · ')}</td>
                      <td className="acc">
                        <button className="mini" title="Agregar otra réplica de esta muestra" style={{ color: 'var(--acento-osc)' }} onClick={() => agregarReplica(f)}>+rép</button>
                        <button className="mini" title="Quitar fila" onClick={() => quitar(f)}>×</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {filas.length > 0 && (
          <>
            <div className="fila-ctrl">
              <button className="chico" onClick={agregarFila}>+ Fila</button>
              <button className="chico peligro" onClick={() => window.confirm('¿Borrar todas las filas (recuentos y OD)?') && s.setFilas([])}>Borrar todo</button>
            </div>
            <div className="leyenda-grilla">
              <span><i style={{ background: '#e5f4dc' }} />Placa usada en el cálculo</span>
              <span><i style={{ background: '#fff' }} />Fuera del rango {L}–{U}, no usada</span>
              <span><b style={{ color: '#8e2a1c' }}>INC</b> incontable (también MNPC, TNTC, &gt;300)</span>
              <span>Celda vacía = no sembrada · 0 = sembrada sin crecimiento</span>
              <span>Pegá con Ctrl+V un bloque copiado de Excel · Enter y flechas para moverte</span>
            </div>
          </>
        )}
      </section>

      {resumenM.length > 0 && (
        <div className="rejilla-2">
          <section className="tarjeta">
            <h2>Por muestra <small className="ayuda">(UFC/mL de la muestra madre)</small></h2>
            <div className="tabla-scroll">
              <table className="tabla">
                <thead><tr><th>Muestra</th><th>n</th><th>Media geométrica</th><th>IC 95 % de la media</th><th>log₁₀ ± DE</th><th>CV %</th></tr></thead>
                <tbody>
                  {resumenM.map((m) => (
                    <tr key={m.muestra}>
                      <td><i className="punto-placa" style={{ background: colores[m.muestra] }} /> <b>{m.muestra || '(sin nombre)'}</b></td>
                      <td title={`${m.nRep} réplicas, ${m.n} con valor${m.censurados ? `, ${m.censurados} fuera de los límites` : ''}${m.estimados ? `, ${m.estimados} estimadas` : ''}`}>{m.n}/{m.nRep}</td>
                      <td>{m.n ? cient(m.geo) : '–'}</td>
                      <td>{m.n > 1 ? `${cient(m.icGeo[0], 1)} – ${cient(m.icGeo[1], 1)}` : '–'}</td>
                      <td>{m.n ? `${m.logMedia.toFixed(2)}${m.n > 1 ? ' ± ' + m.logDe.toFixed(2) : ''}` : '–'}</td>
                      <td>{finito(m.cv) ? m.cv.toFixed(0) : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="nota">Las UFC se promedian en escala logarítmica (media geométrica), como es habitual en microbiología: los recuentos tienen distribución aproximadamente log-normal. Una diferencia de 0,3 log₁₀ equivale a un factor 2.</p>
          </section>
          <section className="tarjeta">
            <h2>UFC/mL por muestra</h2>
            <GraficoMuestras s={s} resumenM={resumenM} colores={colores} />
          </section>
        </div>
      )}

      {filaSel && <SerieDiluciones s={s} f={filaSel} r={resultados[filaSel.id]} />}

      {importar && (
        <Modal titulo="Cargar Excel" onClose={() => setImportar(null)}
          pie={<><button onClick={() => setImportar(null)}>Cancelar</button>
            <button onClick={() => elegirArchivo('agregar')}>Agregar a lo que hay</button>
            <button className="primario" onClick={() => elegirArchivo('reemplazar')}>Reemplazar todo</button></>}>
          <p>Ya hay {filas.length} filas cargadas. ¿Querés reemplazarlas por las del archivo o agregar las nuevas debajo?</p>
          <p className="ayuda">Si el archivo trae solo OD (sin columnas de diluciones), las lecturas se asignan a las filas existentes con la misma muestra y réplica.</p>
        </Modal>
      )}
    </div>
  )
}

function GraficoMuestras({ s, resumenM, colores }) {
  const cats = resumenM.map((m) => m.muestra || '(sin nombre)')
  const puntos = []
  s.filas.forEach((f) => {
    const r = calcularFila(f, s.opts)
    if (!(r.Nmadre > 0) || ESTADOS[r.estado][1] === 'vacio') return
    const i = resumenM.findIndex((m) => m.muestra === f.muestra)
    const n = s.filas.filter((x) => x.muestra === f.muestra).length
    const j = s.filas.filter((x) => x.muestra === f.muestra).indexOf(f)
    const val = esValor(r, s.opts.incluirEstimados)
    puntos.push({ key: f.id, x: i - 0.18 + (n > 1 ? (0.36 * j) / (n - 1) : 0.18), y: r.Nmadre, color: colores[f.muestra], hueco: !val, r: 4,
      titulo: `${nombreRep(f.muestra, f.rep)}: ${textoResultado(r)} UFC/mL (${ESTADOS[r.estado][0]})` })
  })
  resumenM.forEach((m, i) => {
    if (!m.n) return
    puntos.push({ key: 'm' + i, x: i + 0.32, y: m.geo, color: '#3a2a1e', forma: 'cuadrado', r: 4.5,
      yErr: m.n > 1 ? [10 ** (m.logMedia - m.logDe), 10 ** (m.logMedia + m.logDe)] : null,
      titulo: `${m.muestra}: media geométrica ${cient(m.geo)} UFC/mL (± 1 DE en log)` })
  })
  return (
    <PanelGrafico estilo={s.estilos.muestras} setEstilo={s.setEstilo('muestras')} nombre="ufc_por_muestra" alto={330}
      puntos={puntos} ejeX={{ titulo: 'Muestra', categorias: cats }} ejeY={{ titulo: 'UFC/mL (muestra madre)', log: true }}
      leyenda={[{ texto: 'Réplica', color: '#8a7765' }, { texto: 'Fuera de rango / límite', color: '#8a7765', hueco: true }]} />
  )
}

// Recuento observado en cada dilución frente al esperado con la estimación (diagnóstico de la serie)
function SerieDiluciones({ s, f, r }) {
  const [L, U] = rangoDe(s.opts)
  const K = s.K
  const cats = Array.from({ length: K }, (_, k) => etiquetaDil(k))
  const puntos = r.placas.filter((p) => p.c === INCONTABLE || p.c > 0).map((p) => ({
    key: p.k, x: p.k, y: p.c === INCONTABLE ? U * 1.6 : p.c, hueco: p.c === INCONTABLE || !r.dils.includes(p.k),
    color: r.dils.includes(p.k) ? '#2f9e44' : '#d9731f', r: 5,
    titulo: p.c === INCONTABLE ? `${etiquetaDil(p.k)}: incontable` : `${etiquetaDil(p.k)}: ${p.c} colonias`,
  }))
  const esperada = r.N > 0 && finito(r.N) ? Array.from({ length: 41 }, (_, i) => { const k = -0.5 + (K * i) / 40; return [k, r.N * r.V * 10 ** -k] }) : []
  const ceros = r.placas.filter((p) => p.c === 0).map((p) => etiquetaDil(p.k))
  return (
    <section className="tarjeta">
      <h2>Serie de diluciones de {nombreRep(f.muestra || '(sin nombre)', f.rep)} <small className="ayuda">(fila seleccionada en la grilla)</small></h2>
      <p className="ayuda" style={{ marginTop: 0 }}>Al diluir 1:10, el recuento debería bajar 10 veces por columna: los puntos deben caer sobre la recta esperada (pendiente −1 en escala log). Un punto que se aparta indica un error de dilución, de pipeteo o colonias superpuestas.</p>
      <PanelGrafico estilo={s.estilos.serie} setEstilo={s.setEstilo('serie')} nombre={`serie_${f.muestra}_${f.rep}`} alto={300}
        puntos={puntos} rangoY={[0.8, U * 2.2, ...puntos.map((p) => p.y)]}
        bandas={[{ sup: [[-0.5, U], [K - 0.5, U]], inf: [[-0.5, L], [K - 0.5, L]], color: '#2f9e44', opacidad: 0.08 }]}
        curvas={esperada.length ? [{ pts: esperada, color: '#3a2a1e', dash: '5 4', ancho: 1.5 }] : []}
        ejeX={{ titulo: 'Dilución', categorias: cats }} ejeY={{ titulo: 'Colonias por placa', log: true }}
        leyenda={[{ texto: 'Usada', color: '#2f9e44' }, { texto: 'No usada / INC', color: '#d9731f', hueco: true },
          { texto: `Rango ${L}–${U}`, color: '#2f9e44', banda: true, opacidad: 0.15 }, { texto: 'Esperado', color: '#3a2a1e', linea: true, dash: '5 4' }]} />
      {ceros.length > 0 && <p className="nota">Placas con 0 colonias (no se ven en escala log): {ceros.join(', ')}. Las incontables se dibujan arriba del rango.</p>}
    </section>
  )
}
