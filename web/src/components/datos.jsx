import { useMemo, useRef, useState } from 'react'
import { Campo, Check, Modal, Select } from './ui.jsx'
import { PanelGrafico } from './panelGrafico.jsx'
import { Grilla, columnasBase } from './grilla.jsx'
import { importarArchivo } from './importar.js'
import { claveGrupo, ejeUFC, etiquetaGrupo, filaEnUso, filaVacia, OPCIONES_EJE_UFC, tNorm, tNum, UNIDADES_T } from '../modelo.js'
import { calcularFila, cient, ESTADOS, INCONTABLE, leerConteo, METODOS_UFC, RANGOS, rangoDe, sup, textoResultado, esValor, nombreRep } from '../ufc.js'
import { resumen, finito } from '../estadistica.js'
import { excelDe, hojaCondiciones, plantilla } from '../excel.js'
import { descargarBlob, paletaMuestras } from '../utils.js'

export const etiquetaDil = (k) => (k === 0 ? 'Sin diluir' : `−${k}`)

// Resumen por muestra y tiempo con las réplicas que dan un valor (escala log₁₀, como es habitual con UFC)
export function resumenGrupos(filas, o) {
  const enUso = filas.filter(filaEnUso)
  const grupos = [...new Set(enUso.map((f) => claveGrupo(f.muestra, f.tiempo)))]
  return grupos.map((g) => {
    const fs = enUso.filter((f) => claveGrupo(f.muestra, f.tiempo) === g)
    const rs = fs.map((f) => calcularFila(f, o))
    const vals = rs.filter((r) => esValor(r, o.incluirEstimados) && r.Nmadre > 0)
    const R = resumen(vals.map((r) => r.logMadre))
    return {
      grupo: g, muestra: fs[0].muestra, tiempo: tNorm(fs[0].tiempo), t: tNum(fs[0].tiempo),
      etiqueta: etiquetaGrupo(fs[0].muestra, fs[0].tiempo, o.unidadTiempo),
      nRep: rs.length, n: R.n, logMedia: R.media, logDe: R.de, logIc: R.ic,
      geo: 10 ** R.media, icGeo: [10 ** (R.media - R.ic), 10 ** (R.media + R.ic)],
      aritm: vals.length ? vals.reduce((s, r) => s + r.Nmadre, 0) / vals.length : NaN,
      cv: vals.length > 1 ? resumen(vals.map((r) => r.Nmadre)).cv : NaN,
      censurados: rs.filter((r) => ESTADOS[r.estado][1] === 'cens').length,
      estimados: rs.filter((r) => ESTADOS[r.estado][1] === 'est').length,
    }
  }).sort((a, b) => {
    const ma = enUso.findIndex((f) => f.muestra === a.muestra), mb = enUso.findIndex((f) => f.muestra === b.muestra)
    return ma !== mb ? ma - mb : (finito(a.t) ? a.t : Infinity) - (finito(b.t) ? b.t : Infinity)
  })
}

export function DatosTab({ s }) {
  const { filas, K, opts: o } = s
  const [importar, setImportar] = useState(null)
  const [sel, setSel] = useState(null)
  const archivoRef = useRef()
  const [L, U] = rangoDe(o)
  const u = o.unidadTiempo || 'h'
  const resultados = useMemo(() => Object.fromEntries(filas.map((f) => [f.id, calcularFila(f, o)])), [filas, o])
  const resumenG = useMemo(() => resumenGrupos(filas, o), [filas, o])
  const muestras = [...new Set(resumenG.map((r) => r.muestra))]
  const colores = paletaMuestras(muestras)
  const enUso = filas.filter(filaEnUso)

  const setConteo = (k) => (f, v) => {
    const conteos = [...f.conteos]
    while (conteos.length <= k) conteos.push('')
    conteos[k] = v
    return { ...f, conteos }
  }
  const columnas = [
    ...columnasBase(s),
    ...(o.volFijo ? [] : [{
      id: 'vol', titulo: 'Vol.', sub: 'µL', ayuda: `Volumen sembrado en cada placa. Vacío = ${o.volDef} µL`, estilo: { minWidth: 58 },
      placeholder: () => String(o.volDef), get: (f) => f.vol, set: (f, v) => ({ ...f, vol: v }),
    }]),
    // columnas de dilución (una más de reserva para que pegar un bloque más ancho agregue columnas)
    ...Array.from({ length: K + 4 }, (_, k) => ({
      id: 'c' + k, titulo: etiquetaDil(k), sub: k ? '10' + sup(-k) : '', oculta: k >= K, ayuda: k ? `Dilución 10⁻${k}` : 'Suspensión sin diluir',
      get: (f) => f.conteos[k] ?? '', set: setConteo(k),
      clase: (f) => {
        const v = f.conteos[k] ?? ''
        const c = leerConteo(v)
        return resultados[f.id]?.dils.includes(k) ? 'usada' : c === INCONTABLE ? 'inc' : String(v).trim() !== '' && c === null ? 'mal' : ''
      },
    })),
  ]
  // al pegar más columnas de las que hay, se agregan diluciones
  const normalizar = (fs) => {
    const k = Math.max(K, ...fs.map((f) => f.conteos.length))
    if (k !== K) s.setK(k)
    return fs.map((f) => ({ ...f, conteos: Array.from({ length: k }, (_, i) => f.conteos[i] ?? '') }))
  }

  const agregarReplica = (f) => {
    const nueva = { ...filaVacia(f.muestra, '', K, s.M), tiempo: f.tiempo, vol: f.vol }
    const ultimo = filas.map((x) => claveGrupo(x.muestra, x.tiempo)).lastIndexOf(claveGrupo(f.muestra, f.tiempo))
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
    const tCol = `Tiempo (${u})`
    const cols = ['Muestra', tCol, 'Réplica', 'Volumen (µL)', ...Array.from({ length: K }, (_, k) => etiquetaDil(k).replace('−', '-')),
      'Diluciones usadas', 'UFC/mL', 'IC95 inferior', 'IC95 superior', 'log10 UFC/mL', 'Estado', 'Avisos']
    const datos = enUso.map((f) => {
      const r = resultados[f.id]
      const val = ESTADOS[r.estado][1] !== 'vacio'
      return {
        Muestra: f.muestra, [tCol]: finito(tNum(f.tiempo)) ? tNum(f.tiempo) : f.tiempo, Réplica: f.rep, 'Volumen (µL)': r.V * 1000,
        ...Object.fromEntries(f.conteos.map((c, k) => { const v = leerConteo(c); return [etiquetaDil(k).replace('−', '-'), v === INCONTABLE ? 'INC' : v] })),
        'Diluciones usadas': r.dils.map((k) => (k === 0 ? '0' : '-' + k)).join(', '),
        'UFC/mL': val ? r.N : null, 'IC95 inferior': val ? r.ic[0] : null, 'IC95 superior': val ? r.ic[1] : null, 'log10 UFC/mL': r.log,
        Estado: ESTADOS[r.estado][0], Avisos: r.avisos.join('; '),
      }
    })
    const colsM = ['Muestra', tCol, 'Réplicas', 'n con valor', 'Media log10 UFC/mL', 'DE log10', 'Media geométrica UFC/mL', 'IC95 inf', 'IC95 sup', 'Media aritmética UFC/mL', 'CV %']
    const filasM = resumenG.map((m) => ({ Muestra: m.muestra, [tCol]: finito(m.t) ? m.t : m.tiempo, Réplicas: m.nRep, 'n con valor': m.n, 'Media log10 UFC/mL': m.logMedia, 'DE log10': m.logDe,
      'Media geométrica UFC/mL': m.geo, 'IC95 inf': m.icGeo[0], 'IC95 sup': m.icGeo[1], 'Media aritmética UFC/mL': m.aritm, 'CV %': m.cv }))
    excelDe([{ nombre: 'Recuentos', columnas: cols, filas: datos }, { nombre: 'Por muestra y tiempo', columnas: colsM, filas: filasM }, hojaCondiciones(o, s.filas)])
      .then((b) => descargarBlob(b, 'recuento_ufc.xlsx'))
  }

  const filaSel = filas.find((f) => f.id === sel && filaEnUso(f))
  return (
    <div className="pagina" style={{ maxWidth: 'none' }}>
      <section className="tarjeta">
        <div className="titulo-fila">
          <h2>Datos · recuento de colonias</h2>
          <div className="fila-ctrl" style={{ margin: 0 }}>
            <button onClick={() => plantilla().then((b) => descargarBlob(b, 'plantilla_recuento_ufc.xlsx'))}>Plantilla Excel</button>
            <button className="primario" onClick={() => (enUso.length ? setImportar(true) : elegirArchivo('agregar'))}>Cargar Excel</button>
            <button onClick={exportar} disabled={!enUso.length}>Descargar resultados</button>
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
          <Campo label="Unidad de tiempo">
            <Select value={u} onChange={(v) => s.setOpt('unidadTiempo', v)} opciones={UNIDADES_T} />
          </Campo>
        </div>
        <div className="fila-ctrl">
          <div style={{ alignSelf: 'center' }}>
            <Check label="Volumen sembrado fijo" checked={o.volFijo} onChange={(v) => s.setOpt('volFijo', v)}
              ayuda={o.volFijo ? 'Todas las placas con el mismo volumen: no hace falta columna' : 'Aparece la columna Vol. para cargarlo por fila'} />
          </div>
          <Campo label={o.volFijo ? 'Volumen por placa (µL)' : 'Volumen por defecto (µL)'}>
            <input type="number" style={{ width: 110 }} value={o.volDef} onChange={(e) => s.setOpt('volDef', e.target.value)} />
          </Campo>
          <div style={{ alignSelf: 'center' }}>
            <Check label="Usar recuentos estimados (fuera del rango)" checked={o.incluirEstimados} onChange={(v) => s.setOpt('incluirEstimados', v)}
              ayuda="Entran en promedios y en la curva. Los «<» y «>» nunca entran." />
          </div>
        </div>

        <Grilla s={s} columnas={columnas} sel={sel} onSel={setSel} normalizar={normalizar}
          cabExtra={<><button className="mas" title="Agregar una dilución más" onClick={agregarColumna}>+</button>{' '}
            <button className="mini" title="Quitar la última dilución" onClick={quitarColumna} disabled={K <= 1}>−</button></>}
          cabResultados={['UFC/mL', 'IC 95 %', 'Estado', 'Avisos']}
          resultados={(f) => {
            const res = resultados[f.id]
            return <>
              <td className="res"><b>{textoResultado(res)}</b></td>
              <td className="res">{finito(res.ic[0]) && ESTADOS[res.estado][1] !== 'cens' ? `${cient(res.ic[0], 1)} – ${cient(res.ic[1], 1)}` : ''}</td>
              <td className="res" style={{ textAlign: 'center' }}><span className={`estado ${ESTADOS[res.estado][1]}`}>{ESTADOS[res.estado][0]}</span></td>
              <td className="res avisos-fila">{res.avisos.join(' · ')}</td>
            </>
          }}
          acciones={(f) => <>
            <button className="mini" title="Agregar otra réplica de esta muestra en este tiempo" style={{ color: 'var(--acento-osc)' }} onClick={() => agregarReplica(f)}>+rép</button>
            <button className="mini" title="Quitar fila" onClick={() => quitar(f)}>×</button>
          </>} />
        <div className="fila-ctrl">
          {enUso.length > 0 && <button className="chico peligro" onClick={() => window.confirm('¿Borrar todas las filas (recuentos y OD)?') && s.setFilas([])}>Borrar todo</button>}
        </div>
        <div className="leyenda-grilla">
          <span><i style={{ background: '#e5f4dc' }} />Placa usada en el cálculo</span>
          <span><i style={{ background: '#fff' }} />Fuera del rango {L}–{U}, no usada</span>
          <span><b style={{ color: '#8e2a1c' }}>INC</b> incontable (también MNPC, TNTC, &gt;300)</span>
          <span><b>Celda vacía = dilución no sembrada</b> · 0 = sembrada sin crecimiento</span>
          <span>Escribí en la última fila para agregar otra · Enter en Muestra o Tiempo vacíos copia el de arriba</span>
          <span>Ctrl+V: una tabla con encabezados (Muestra, Tiempo, Réplica, −1…) se reparte por muestra, tiempo y réplica; sin encabezados se pega desde la celda</span>
        </div>
      </section>

      {resumenG.length > 0 && (
        <div className="rejilla-2">
          <section className="tarjeta">
            <h2>Por muestra y tiempo <small className="ayuda">(UFC/mL)</small></h2>
            <div className="tabla-scroll">
              <table className="tabla">
                <thead><tr><th>Muestra</th><th>Tiempo ({u})</th><th>n</th><th>Media geométrica</th><th>IC 95 % de la media</th><th>log₁₀ ± DE</th><th>CV %</th></tr></thead>
                <tbody>
                  {resumenG.map((m) => (
                    <tr key={m.grupo}>
                      <td><i className="punto-placa" style={{ background: colores[m.muestra] }} /> <b>{m.muestra || '(sin nombre)'}</b></td>
                      <td>{m.tiempo || '–'}</td>
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
            <h2>UFC/mL</h2>
            <GraficoUFC s={s} resumenG={resumenG} colores={colores} />
          </section>
        </div>
      )}

      {filaSel && <SerieDiluciones s={s} f={filaSel} r={resultados[filaSel.id]} />}

      {importar && (
        <Modal titulo="Cargar Excel" onClose={() => setImportar(null)}
          pie={<><button onClick={() => setImportar(null)}>Cancelar</button>
            <button onClick={() => elegirArchivo('agregar')}>Agregar / completar</button>
            <button className="primario" onClick={() => elegirArchivo('reemplazar')}>Reemplazar todo</button></>}>
          <p>Ya hay {enUso.length} filas cargadas. ¿Reemplazarlas por las del archivo, o agregar y completar?</p>
          <p className="ayuda">«Agregar / completar»: las filas del archivo con la misma muestra, tiempo y réplica que una existente la completan (por ejemplo, un archivo que solo trae OD); las demás se agregan.</p>
        </Modal>
      )}
    </div>
  )
}

// Gráfico compartido para UFC/mL u OD: en función del tiempo si hay tiempos numéricos, si no por grupo.
// valores: [{ id, muestra, t, etiqueta, y, valido, titulo }] (réplicas) y medias: [{ muestra, t, etiqueta, y, err }]
export function GraficoTiempo({ s, valores, medias, colores, ejeY, log, eje = null, estilo, nombre }) {
  const u = s.opts.unidadTiempo || 'h'
  const todos = [...medias, ...valores]
  const conTiempo = todos.some((m) => finito(m.t))
  const cats = conTiempo ? null : [...new Set(todos.map((m) => m.etiqueta))]
  const xDe = (p) => (conTiempo ? p.t : cats.indexOf(p.etiqueta) >= 0 ? cats.indexOf(p.etiqueta) : NaN)
  const puntos = [
    ...valores.filter((p) => finito(xDe(p))).map((p) => ({ key: p.id, x: xDe(p), y: p.y, color: colores[p.muestra], hueco: !p.valido, r: 3.5, titulo: p.titulo })),
    ...medias.filter((m) => finito(xDe(m)) && finito(m.y)).map((m, i) => ({ key: 'm' + i, x: xDe(m), y: m.y, color: colores[m.muestra], forma: 'cuadrado', r: 4.5, yErr: m.err,
      titulo: `${m.etiqueta}: media ${log ? cient(m.y) : m.y.toFixed(3)}` })),
  ]
  const curvas = conTiempo ? Object.keys(colores).map((mu) => ({
    pts: medias.filter((m) => m.muestra === mu && finito(m.t) && finito(m.y)).sort((a, b) => a.t - b.t).map((m) => [m.t, m.y]), color: colores[mu], ancho: 1.8,
  })).filter((c) => c.pts.length > 1) : []
  return (
    <PanelGrafico estilo={estilo} setEstilo={s.setEstilo(nombre)} nombre={nombre} alto={330}
      puntos={puntos} curvas={curvas}
      ejeX={conTiempo ? { titulo: `Tiempo (${u})`, cero: true } : { titulo: 'Muestra', categorias: cats }} ejeY={eje || { titulo: ejeY, log, cero: !log }} nota={s.nota}
      leyenda={Object.keys(colores).slice(0, 12).map((m) => ({ texto: m || '(sin nombre)', color: colores[m] }))} />
  )
}

function GraficoUFC({ s, resumenG, colores }) {
  const valores = s.filas.filter(filaEnUso).map((f) => {
    const r = calcularFila(f, s.opts)
    if (!(r.Nmadre > 0) || ESTADOS[r.estado][1] === 'vacio') return null
    return { id: f.id, muestra: f.muestra, t: tNum(f.tiempo), etiqueta: etiquetaGrupo(f.muestra, f.tiempo, s.opts.unidadTiempo), y: r.Nmadre,
      valido: esValor(r, s.opts.incluirEstimados), titulo: `${etiquetaGrupo(f.muestra, f.tiempo, s.opts.unidadTiempo)} réplica ${f.rep}: ${textoResultado(r)} UFC/mL (${ESTADOS[r.estado][0]})` }
  }).filter(Boolean)
  const medias = resumenG.filter((m) => m.n).map((m) => ({ muestra: m.muestra, t: m.t, etiqueta: m.etiqueta, y: m.geo,
    err: m.n > 1 ? [10 ** (m.logMedia - m.logDe), 10 ** (m.logMedia + m.logDe)] : null }))
  const [vista, setVista] = useState('tiempo')
  const tiempos = [...new Set(resumenG.map((m) => m.tiempo))].sort((a, b) => (Number(a) - Number(b)) || String(a).localeCompare(String(b)))
  const [tBar, setTBar] = useState(null)
  const tSel = tiempos.includes(tBar) ? tBar : tiempos[tiempos.length - 1]
  const u = s.opts.unidadTiempo || 'h'
  return (
    <>
      <div className="fila-ctrl" style={{ marginTop: 0 }}>
        <div className="seg">
          <button className={vista === 'tiempo' ? 'on' : ''} onClick={() => setVista('tiempo')}>{resumenG.some((m) => finito(m.t)) ? 'En el tiempo' : 'Puntos'}</button>
          <button className={vista === 'barras' ? 'on' : ''} onClick={() => setVista('barras')}>Barras</button>
        </div>
        {vista === 'barras' && tiempos.length > 1 && (
          <Campo label="Tiempo"><Select value={tSel} onChange={setTBar} opciones={tiempos.map((t) => [t, t === '' ? '(sin tiempo)' : `${t} ${u}`])} /></Campo>
        )}
        <Campo label="Eje Y"><Select value={s.opts.escalaY} onChange={(v) => s.setOpt('escalaY', v)} opciones={OPCIONES_EJE_UFC} /></Campo>
      </div>
      {vista === 'tiempo'
        ? <GraficoTiempo s={s} valores={valores} medias={medias} colores={colores} eje={ejeUFC(s.opts)} estilo={s.estilos.muestras} nombre="muestras" />
        : <BarrasUFC s={s} resumenG={resumenG.filter((m) => m.tiempo === tSel)} valores={valores.filter((v) => tNorm(s.filas.find((f) => f.id === v.id)?.tiempo) === tSel)} colores={colores}
            titulo={tSel === '' ? '' : `${tSel} ${u}`} />}
    </>
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
  const nombre = `${etiquetaGrupo(f.muestra, f.tiempo, s.opts.unidadTiempo)}, réplica ${f.rep}`
  return (
    <section className="tarjeta">
      <h2>Serie de diluciones de {nombre} <small className="ayuda">(fila seleccionada en la grilla)</small></h2>
      <p className="ayuda" style={{ marginTop: 0 }}>Al diluir 1:10, el recuento debería bajar 10 veces por columna: los puntos deben caer sobre la recta esperada (pendiente −1 en escala log). Un punto que se aparta indica un error de dilución, de pipeteo o colonias superpuestas. Las diluciones no sembradas (celdas vacías) no aparecen.</p>
      <PanelGrafico estilo={s.estilos.serie} setEstilo={s.setEstilo('serie')} nombre={`serie_${f.muestra}_${tNorm(f.tiempo)}_${f.rep}`} alto={300}
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

// Barras: media geométrica (log₁₀ ± DE) de cada muestra en un tiempo, con las réplicas encima
function BarrasUFC({ s, resumenG, valores, colores, titulo }) {
  const cats = resumenG.map((m) => m.muestra || '(sin nombre)')
  const puntos = [
    ...resumenG.map((m, i) => (m.n ? { key: 'b' + i, x: i, y: m.geo, barra: true, color: colores[m.muestra],
      yErr: m.n > 1 ? [10 ** (m.logMedia - m.logDe), 10 ** (m.logMedia + m.logDe)] : null,
      titulo: `${m.muestra}: log₁₀ = ${m.logMedia.toFixed(2)}${m.n > 1 ? ' ± ' + m.logDe.toFixed(2) : ''} (n = ${m.n})` } : null)).filter(Boolean),
    ...valores.map((v) => {
      const i = resumenG.findIndex((m) => m.muestra === v.muestra)
      const reps = valores.filter((x) => x.muestra === v.muestra)
      const j = reps.indexOf(v)
      return i < 0 ? null : { key: v.id, x: i - 0.15 + (reps.length > 1 ? (0.3 * j) / (reps.length - 1) : 0.15), y: v.y, color: '#3a2a1e', r: 3, hueco: !v.valido, titulo: v.titulo }
    }).filter(Boolean),
  ]
  return (
    <PanelGrafico estilo={s.estilos.barras} setEstilo={s.setEstilo('barras')} nombre={`barras_${titulo || 'ufc'}`} alto={330} nota={s.nota}
      puntos={puntos} ejeX={{ titulo: titulo ? `Muestra (${titulo})` : 'Muestra', categorias: cats }} ejeY={ejeUFC(s.opts)}
      leyenda={[{ texto: 'Media ± DE (log₁₀)', color: '#d9731f', banda: true, opacidad: 0.5 }, { texto: 'Réplica', color: '#3a2a1e' }]} />
  )
}
