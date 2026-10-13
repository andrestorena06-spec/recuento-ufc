import { useMemo, useState } from 'react'
import { Campo, Check, Select } from './ui.jsx'
import { PanelGrafico } from './panelGrafico.jsx'
import { Ayuda, Calc, FichaAyuda, Tip } from './tip.jsx'
import { dDelta, dG, dLag, dMu } from '../desarrollos.js'
import { ondaDe } from './od.jsx'
import { predicciones, resumenPorTiempo } from '../calibracion.js'
import { parametrosCrecimiento, seriesCrecimiento } from '../crecimiento.js'
import { ejeUFC, OPCIONES_EJE_UFC } from '../modelo.js'
import { cient } from '../ufc.js'
import { finito, media } from '../estadistica.js'
import { excelDe, hojaCondiciones } from '../excel.js'
import { descargarBlob, paletaMuestras } from '../utils.js'

const NOMBRE_VAR = { ufc: 'UFC/mL (recuento)', od: 'OD corregida' }

export function CrecimientoTab({ s }) {
  const o = s.opts
  const u = o.unidadTiempo || 'h'
  const onda = ondaDe(o)
  const resumenT = useMemo(() => resumenPorTiempo(s.filas, o, s.curva), [s.filas, o, s.curva])
  const series = useMemo(() => seriesCrecimiento(s.filas, o), [s.filas, o])
  const preds = useMemo(() => predicciones(s.filas, o, s.curva), [s.filas, o, s.curva])
  const muestras = [...new Set(resumenT.filter((r) => finito(r.t)).map((r) => r.muestra))]
  const colores = paletaMuestras(muestras)
  const [ocultas, setOcultas] = useState([])
  const [verOD, setVerOD] = useState(true)
  const [verUFC, setVerUFC] = useState(true)
  const [verReps, setVerReps] = useState(false)
  const [verPred, setVerPred] = useState(true)
  const [verFase, setVerFase] = useState(true)
  const sel = muestras.filter((m) => !ocultas.includes(m))

  const params = useMemo(() => muestras.flatMap((m) => ['ufc', 'od'].map((v) => {
    const pts = series[m]?.[v] || []
    return { muestra: m, variable: v, ...parametrosCrecimiento(pts) }
  })), [muestras.join('|'), series])

  if (!muestras.length) {
    return <div className="vacio">Para ver el crecimiento hacen falta muestras con <b>tiempos numéricos</b> (columna Tiempo en la pestaña C) y recuentos u OD.</div>
  }

  // qué eje usa cada variable: con las dos, OD a la izquierda (lineal) y UFC a la derecha
  const ambos = verOD && verUFC
  const ejeDeUFC = ambos ? 2 : 1
  const puntos = []
  const curvas = []
  sel.forEach((m) => {
    const col = colores[m]
    const rs = resumenT.filter((r) => r.muestra === m && finito(r.t)).sort((a, b) => a.t - b.t)
    if (verOD) {
      rs.filter((r) => r.nOD).forEach((r) => puntos.push({ key: 'od' + r.grupo, x: r.t, y: r.od, eje: 1, color: col, forma: 'cuadrado', r: 4.5,
        yErr: r.nOD > 1 ? [r.od - r.odDe, r.od + r.odDe] : null, titulo: `${r.etiqueta}: OD corregida ${r.od.toFixed(3)}${r.nOD > 1 ? ' ± ' + r.odDe.toFixed(3) : ''}` }))
      curvas.push({ pts: rs.filter((r) => r.nOD).map((r) => [r.t, r.od]), color: col, dash: '6 4', ancho: 1.8, eje: 1 })
      if (verReps) (series[m]?.od || []).forEach((p, i) => puntos.push({ key: `odr${m}${i}`, x: p.t, y: 10 ** p.z, eje: 1, color: col, r: 2.5, hueco: true, forma: 'cuadrado' }))
    }
    if (verUFC) {
      const medidos = rs.filter((r) => r.nUFC)
      medidos.forEach((r) => puntos.push({ key: 'u' + r.grupo, x: r.t, y: r.geo, eje: ejeDeUFC, color: col, r: 5,
        yErr: r.nUFC > 1 ? [10 ** (r.logMedia - r.logDe), 10 ** (r.logMedia + r.logDe)] : null,
        titulo: `${r.etiqueta}: ${cient(r.geo)} UFC/mL (log₁₀ ${r.logMedia.toFixed(2)}${r.nUFC > 1 ? ' ± ' + r.logDe.toFixed(2) : ''})` }))
      const estimados = verPred ? rs.filter((r) => !r.nUFC && r.pred) : []
      estimados.forEach((r) => puntos.push({ key: 'p' + r.grupo, x: r.t, y: r.pred.y, eje: ejeDeUFC, color: col, r: 5, hueco: true,
        titulo: `${r.etiqueta}: ≈ ${cient(r.pred.y)} UFC/mL estimada con la curva${r.pred.extrapola ? ' (fuera del rango calibrado)' : ''}` }))
      // la línea une solo los recuentos medidos; las estimadas por la curva quedan como puntos huecos
      curvas.push({ pts: medidos.map((r) => [r.t, r.geo]), color: col, ancho: 2.2, eje: ejeDeUFC })
      if (verReps) (series[m]?.ufc || []).forEach((p, i) => puntos.push({ key: `ur${m}${i}`, x: p.t, y: 10 ** p.z, eje: ejeDeUFC, color: col, r: 2.5, hueco: true }))
    }
  })
  const zonas = verFase ? params.filter((p) => sel.includes(p.muestra) && !p.error && p.variable === (verUFC ? 'ufc' : 'od'))
    .map((p) => ({ x1: p.t1, x2: p.t2, color: colores[p.muestra], opacidad: sel.length > 1 ? 0.07 : 0.12 })) : []

  const ejeOD = { titulo: `OD corregida (${onda} nm)`, cero: true }
  const ejeU = ejeUFC(o)
  const leyenda = [
    ...sel.slice(0, 10).map((m) => ({ texto: m || '(sin nombre)', color: colores[m] })),
    ...(verUFC ? [{ texto: 'UFC/mL', color: '#3a2a1e', linea: true }] : []),
    ...(verOD ? [{ texto: 'OD corregida', color: '#3a2a1e', linea: true, dash: '6 4' }] : []),
    ...(verUFC && verPred && resumenT.some((r) => !r.nUFC && r.pred) ? [{ texto: 'UFC estimada', color: '#3a2a1e', hueco: true }] : []),
    ...(zonas.length ? [{ texto: 'Fase exponencial', color: '#d9731f', banda: true, opacidad: 0.25 }] : []),
  ]

  // con una curva por cepa, el rango es solo de esa cepa; con una curva común, es el rango general
  const porCepa = o.curvaPor !== 'comun' && muestras.length > 1
  const usarFase = (p) => {
    if (porCepa) {
      s.setOpts((x) => ({ ...x, rangosCepa: { ...(x.rangosCepa || {}), [p.muestra]: [String(p.t1), String(p.t2)] } }))
      s.avisar(`Curva de ${p.muestra} limitada a ${p.t1}–${p.t2} ${u} (su fase exponencial).`)
    } else {
      s.setOpts((x) => ({ ...x, tMin: String(p.t1), tMax: String(p.t2) }))
      s.avisar(`Curva limitada a ${p.t1}–${p.t2} ${u} (fase exponencial de ${p.muestra}).`)
    }
  }
  const rangos = Object.entries(o.rangosCepa || {}).filter(([m]) => muestras.includes(m))
  const fmtT = (v) => (finito(v) ? (Math.abs(v) < 10 ? v.toFixed(2) : v.toFixed(1)) : '–')
  const exportar = () => {
    const cols = ['Muestra', 'Variable', `Fase exponencial desde (${u})`, `hasta (${u})`, `µ (1/${u})`, 'µ IC95 inf', 'µ IC95 sup', `Tiempo de generación (${u})`, `Latencia (${u})`, 'log10 inicial', 'log10 máximo', 'R²', 'n', 'Aviso']
    const filas = params.map((p) => (p.error ? { Muestra: p.muestra, Variable: NOMBRE_VAR[p.variable], Aviso: p.error } : {
      Muestra: p.muestra, Variable: NOMBRE_VAR[p.variable], [`Fase exponencial desde (${u})`]: p.t1, [`hasta (${u})`]: p.t2, [`µ (1/${u})`]: p.mu, 'µ IC95 inf': p.muIc[0], 'µ IC95 sup': p.muIc[1],
      [`Tiempo de generación (${u})`]: p.g, [`Latencia (${u})`]: p.lag, 'log10 inicial': p.z0, 'log10 máximo': p.zmax, 'R²': p.r2, n: p.n, Aviso: p.dudosa ? 'Sin tramo recto claro' : '',
    }))
    const colsR = ['Muestra', `Tiempo (${u})`, 'OD corregida', 'DE OD', 'UFC/mL (media geométrica)', 'log10 UFC/mL', 'DE log10', 'UFC/mL estimada por curva']
    const filasR = resumenT.map((r) => ({ Muestra: r.muestra, [`Tiempo (${u})`]: finito(r.t) ? r.t : r.tiempo, 'OD corregida': r.od, 'DE OD': r.odDe,
      'UFC/mL (media geométrica)': r.nUFC ? r.geo : null, 'log10 UFC/mL': r.nUFC ? r.logMedia : null, 'DE log10': r.logDe, 'UFC/mL estimada por curva': r.pred ? r.pred.y : null }))
    excelDe([{ nombre: 'Parámetros de crecimiento', columnas: cols, filas }, { nombre: 'Resumen por tiempo', columnas: colsR, filas: filasR }, hojaCondiciones(o, s.filas)])
      .then((b) => descargarBlob(b, 'crecimiento.xlsx'))
  }

  return (
    <div className="con-lateral">
      <aside className="lateral">
        <h2>Curva de crecimiento</h2>
        <h3>Muestras</h3>
        <div className="lista-check">
          {muestras.map((m) => (
            <Check key={m} label={<><i className="punto-placa" style={{ background: colores[m] }} /> {m || '(sin nombre)'}</>} checked={!ocultas.includes(m)}
              onChange={(v) => setOcultas(v ? ocultas.filter((x) => x !== m) : [...ocultas, m])} />
          ))}
        </div>
        <h3>Mostrar</h3>
        <Check label="OD corregida (eje izquierdo, lineal)" checked={verOD} onChange={setVerOD} />
        <Check label="UFC/mL (eje derecho)" checked={verUFC} onChange={setVerUFC} />
        <Campo label="Eje de UFC"><Select value={o.escalaY} onChange={(v) => s.setOpt('escalaY', v)} opciones={OPCIONES_EJE_UFC} /></Campo>
        <Check label="Réplicas individuales" checked={verReps} onChange={setVerReps} />
        <Check label="UFC estimadas con la curva" checked={verPred} onChange={setVerPred} ayuda="Tiempos con OD y sin recuento (círculo hueco)" />
        <Check label="Sombrear la fase exponencial" checked={verFase} onChange={setVerFase} />
        <button className="ancho" onClick={exportar}>Descargar resultados (Excel)</button>
        <p className="nota">Media de cada tiempo ± 1 DE entre réplicas. UFC/mL: media geométrica (± DE en log₁₀). OD corregida: lecturas en la ventana lineal × 10ᵏ.</p>
      </aside>
      <div className="principal">
        <PanelGrafico estilo={s.estilos.crecimiento} setEstilo={s.setEstilo('crecimiento')} nombre="curva_crecimiento" alto={440} nota={s.nota}
          puntos={puntos} curvas={curvas} zonasX={zonas} leyenda={leyenda}
          ejeX={{ titulo: `Tiempo (${u})`, cero: true }}
          ejeY={verOD ? ejeOD : ejeU} ejeY2={ambos ? ejeU : null} />

        <section style={{ marginTop: 20 }}>
          <h3 className="normal">Parámetros de crecimiento <small className="ayuda">(pasá el mouse sobre un valor para ver el cálculo)</small></h3>
          <div className="tabla-scroll chica">
            <table className="tabla">
              <thead><tr><th>Cepa</th><th>Variable</th><th><Ayuda clave="fase">Fase exponencial</Ayuda></th><th><Ayuda clave="mu">µ (1/{u}) · IC 95 %</Ayuda></th><th><Ayuda clave="g">Tiempo de generación</Ayuda></th><th><Ayuda clave="lag">Latencia</Ayuda></th><th><Ayuda clave="deltaLog">Δ log₁₀</Ayuda></th><th><Ayuda clave="r2">R²</Ayuda></th><th /></tr></thead>
              <tbody>
                {params.filter((p) => sel.includes(p.muestra)).map((p) => (
                  <tr key={p.muestra + p.variable}>
                    <td><i className="punto-placa" style={{ background: colores[p.muestra] }} /> <b>{p.muestra || '(sin nombre)'}</b></td>
                    <td>{NOMBRE_VAR[p.variable]}</td>
                    {p.error ? <td colSpan={6} className="ayuda">{p.error}</td> : <>
                      <td>{p.t1}–{p.t2} {u} <small className="ayuda">({p.nTiempos} tiempos){p.dudosa ? ' ⚠' : ''}</small></td>
                      <td><Calc d={dMu(p, u)}><b>{fmtT(p.mu)}</b> <small className="ayuda">{finito(p.muIc[0]) ? `${fmtT(p.muIc[0])} a ${fmtT(p.muIc[1])}` : ''}</small></Calc></td>
                      <td><Calc d={dG(p, u)}>{fmtT(p.g)} {u}{u === 'h' && finito(p.g) ? <small className="ayuda"> ({(p.g * 60).toFixed(0)} min)</small> : ''}</Calc></td>
                      <td><Calc d={dLag(p, u)}>{fmtT(p.lag)} {u}</Calc></td>
                      <td><Calc d={dDelta(p)}>{(p.zmax - p.z0).toFixed(2)} <small className="ayuda">({p.duplicaciones.toFixed(1)} duplic.)</small></Calc></td>
                      <td>{p.r2.toFixed(3)}</td>
                    </>}
                    <td>{!p.error && <Tip contenido={<FichaAyuda titulo="Usar en la curva" texto={`Limita la ecuación de calibración ${porCepa ? `de ${p.muestra} ` : ''}a los tiempos ${p.t1}–${p.t2} ${u}, es decir, a su fase exponencial (lo recomendado).`} />} ancho={300}>
                      <button className="chico" onClick={() => usarFase(p)}>Usar en la curva</button></Tip>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="nota">
            <b>Fase exponencial</b>: tramo de tiempos consecutivos (al menos 3) donde log₁₀ crece en línea recta con la mayor pendiente; se busca primero la ventana de 3 tiempos más empinada con R² ≥ 0,97 y se extiende mientras siga recta y cada tramo agregado sea casi tan empinado.
            <b> µ</b> (tasa específica de crecimiento) = pendiente de log₁₀ × ln 10, ajustada con todas las réplicas del tramo; <b>tiempo de generación</b> = ln 2 / µ;
            <b> latencia</b> = tiempo en que la recta de la fase exponencial corta el nivel inicial. ⚠ = no hay un tramo recto claro (pocos tiempos o crecimiento irregular).
            «Usar en la curva» limita la ecuación de calibración a ese rango de tiempo, como se recomienda (con una curva por cepa, solo la de esa cepa).
          </p>
          {porCepa && rangos.length > 0 && (
            <p className="aviso-sel">Rango de tiempo de la curva de calibración: {rangos.map(([m, r]) => `${m} ${r[0]}–${r[1]} ${u}`).join(' · ')}.{' '}
              <button className="enlace" onClick={() => s.setOpt('rangosCepa', {})}>Usar todos los tiempos</button></p>
          )}
          {!porCepa && (o.tMin !== '' || o.tMax !== '') && (
            <p className="aviso-sel">La curva de calibración está limitada a {o.tMin || '…'}–{o.tMax || '…'} {u}.{' '}
              <button className="enlace" onClick={() => s.setOpts((x) => ({ ...x, tMin: '', tMax: '' }))}>Usar todos los tiempos</button></p>
          )}
        </section>

        {preds.length > 0 && (
          <section style={{ marginTop: 20 }}>
            <h3 className="normal">UFC/mL estimadas con la curva</h3>
            <p className="nota" style={{ marginTop: 0 }}>{preds.length} {preds.length === 1 ? 'réplica tiene' : 'réplicas tienen'} OD pero no un recuento válido: su UFC/mL se estima con la ecuación de la pestaña Curva ({s.curva.aj?.M.corto}).
              Media geométrica de las estimadas: {cient(10 ** media(preds.map((x) => Math.log10(x.p.y))))} UFC/mL. El detalle con intervalos de predicción está en la pestaña Tabla.</p>
          </section>
        )}
      </div>
    </div>
  )
}
