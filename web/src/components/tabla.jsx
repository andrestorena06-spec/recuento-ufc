import { useMemo, useState } from 'react'
import { etiquetaK, motivoSinPunto, predicciones, resumenPorTiempo } from '../calibracion.js'
import { cient, ESTADOS } from '../ufc.js'
import { finito } from '../estadistica.js'
import { excelDe, hojaCondiciones } from '../excel.js'
import { descargarBlob } from '../utils.js'
import { ondaDe } from './od.jsx'

const r4 = (x, d = 4) => (finito(x) ? Number(x.toFixed(d)) : null)
const r3s = (x) => (finito(x) ? Number(x.toPrecision(4)) : null)

export function ModoSel({ s }) {
  return (
    <div className="seg">
      <button className={s.opts.modo === 'individual' ? 'on' : ''} onClick={() => s.setOpt('modo', 'individual')}>Réplicas individuales</button>
      <button className={s.opts.modo === 'promedio' ? 'on' : ''} onClick={() => s.setOpt('modo', 'promedio')}>Promedio por muestra</button>
    </div>
  )
}

export function PuntosSel({ s }) {
  return (
    <div className="seg">
      <button className={s.opts.puntos !== 'dilucion' ? 'on' : ''} title="Un punto por réplica: OD corregida (lecturas dentro de la ventana lineal × 10ᵏ) frente a UFC/mL de la muestra"
        onClick={() => s.setOpt('puntos', 'corregida')}>OD corregida</button>
      <button className={s.opts.puntos === 'dilucion' ? 'on' : ''} title="Cada lectura es un punto: OD de la dilución frente a UFC/mL de esa dilución"
        onClick={() => s.setOpt('puntos', 'dilucion')}>Por dilución</button>
    </div>
  )
}

export function TablaTab({ s }) {
  const o = s.opts
  const c = s.corr
  const onda = ondaDe(o)
  const u = o.unidadTiempo || 'h'
  const tv = (p) => (Number.isFinite(p.t) ? p.t : p.tiempo || null)
  const curva = s.curva
  const corregida = o.puntos !== 'dilucion'
  const resumenT = useMemo(() => resumenPorTiempo(s.filas, o, curva), [s.filas, o, curva])
  const preds = useMemo(() => predicciones(s.filas, o, curva), [s.filas, o, curva])
  const enCurva = new Map(curva.todos.map((p) => [p.key, p]))
  const [orden, setOrden] = useState(null)

  const filas = useMemo(() => {
    if (o.modo === 'promedio') {
      return c.prom.map((p) => {
        const k = enCurva.get(p.id)
        return {
          Muestra: p.muestra, [`Tiempo (${u})`]: tv(p), 'Dilución OD': etiquetaK(p.k), 'n OD': p.nOD, [corregida ? `OD${onda} corregida media` : `OD${onda} media`]: r4(p.x), 'DE OD': r4(p.xde),
          'n UFC': p.nUFC, [corregida ? 'UFC/mL (media geométrica)' : 'UFC/mL de la dilución (media geométrica)']: r3s(p.y), 'log10 UFC/mL': r4(p.logMedia, 3), 'DE log10': r4(p.logDe, 3),
          'IC95 inf': r3s(10 ** (p.logMedia - p.logIc)), 'IC95 sup': r3s(10 ** (p.logMedia + p.logIc)),
          'UFC/mL (media aritmética)': r3s(p.yAritm), 'UFC/mL por unidad de OD': r3s(p.y / p.x),
          'Origen OD': p.origen === 'paralelo' ? 'Cultivo paralelo' : 'Misma suspensión',
          'En la curva': k ? (k.usado ? 'Sí' : 'No: ' + k.motivo) : 'No: ' + (!p.nOD ? 'sin OD' : 'sin recuento válido'),
        }
      })
    }
    return c.ind.map((p) => {
      const k = enCurva.get('i:' + p.id) || (p.origen === 'paralelo' ? enCurva.get('g:' + p.grupo + ':' + p.k) : null)
      const sin = motivoSinPunto(p, o)
      const enC = p.origen === 'paralelo'
        ? (k ? (k.usado ? 'Sí, como promedio de la muestra' : 'No: ' + k.motivo) : 'No: ' + (sin || 'sin promedio'))
        : sin ? 'No: ' + sin : k ? (k.usado ? 'Sí' : 'No: ' + k.motivo) : 'No'
      return {
        Muestra: p.muestra, [`Tiempo (${u})`]: tv(p), Réplica: p.rep,
        ...(corregida ? { 'OD usada': p.dilsOD?.length ? p.dilsOD.map(etiquetaK).join(', ') + (p.fueraVentana ? ' (fuera de ventana)' : '') : '–', [`OD${onda} corregida`]: r4(p.x) }
          : { 'Dilución OD': etiquetaK(p.k), [`OD${onda} neta`]: r4(p.x) }),
        [corregida ? 'UFC/mL' : 'UFC/mL de la dilución']: r3s(p.y), 'IC95 inf': r3s(p.ic[0]), 'IC95 sup': r3s(p.ic[1]), 'log10 UFC/mL': r4(Math.log10(p.y), 3),
        ...(corregida ? {} : { 'UFC/mL de la muestra': r3s(p.r.Nmadre) }), 'UFC/mL por unidad de OD': r3s(p.y / p.x), 'Recuento': ESTADOS[p.r.estado][0],
        'Diluciones usadas': p.r.dils.map((k) => (k ? '-' + k : '0')).join(', '),
        'Origen OD': p.origen === 'paralelo' ? 'Cultivo paralelo' : 'Misma suspensión', 'En la curva': enC,
      }
    })
  }, [c, o, onda, u, curva])
  const columnas = Object.keys(filas[0] || {})
  const vista = useMemo(() => {
    if (!orden) return filas
    const { col, dir } = orden
    return [...filas].sort((a, b) => {
      const x = a[col], y = b[col]
      const r = typeof x === 'number' || typeof y === 'number' ? (x ?? -Infinity) - (y ?? -Infinity) : String(x ?? '').localeCompare(String(y ?? ''))
      return dir === 'asc' ? r : -r
    })
  }, [filas, orden])
  const mostrar = (col, v) => {
    if (v === null || v === undefined) return '–'
    if (typeof v === 'number' && /UFC|IC95/.test(col) && !/log10/.test(col)) return cient(v)
    return String(v)
  }

  // Factor de conversión simple: media de UFC/mL por unidad de OD de los puntos usados
  const usados = curva.usados
  const ratios = usados.map((p) => p.y / p.x).filter(finito)
  const logR = ratios.map(Math.log10)
  const mR = logR.reduce((a, b) => a + b, 0) / (logR.length || 1)
  const deR = logR.length > 1 ? Math.sqrt(logR.reduce((a, b) => a + (b - mR) ** 2, 0) / (logR.length - 1)) : NaN

  return (
    <div className="pagina" style={{ maxWidth: 'none' }}>
      <section className="tarjeta">
        <div className="titulo-fila">
          <h2>Correspondencia UFC/mL ↔ OD<sub>{onda}</sub></h2>
          <div className="fila-ctrl" style={{ margin: 0 }}>
            <PuntosSel s={s} />
            <ModoSel s={s} />
            <button className="primario" disabled={!filas.length}
              onClick={() => excelDe([{ nombre: o.modo === 'promedio' ? 'Promedios' : 'Individual', columnas, filas: vista }]).then((b) => descargarBlob(b, `correspondencia_${o.modo}.xlsx`))}>
              Descargar Excel</button>
          </div>
        </div>
        <p className="ayuda" style={{ marginTop: 0 }}>
          {corregida
            ? <>Cada réplica es un punto: su <b>OD corregida</b> (las lecturas que caen en la ventana lineal {o.odLinMin}–{o.odLinMax}, multiplicadas por su dilución 10ᵏ y promediadas) frente a la UFC/mL de la muestra. </>
            : <>Cada lectura de OD se compara con la UFC/mL <b>de esa misma dilución</b>: UFC/mL de la muestra ÷ 10ᵏ. </>}
          {o.modo === 'promedio'
            ? 'En modo promedio, para cada muestra y tiempo, la OD es la media aritmética y la UFC/mL la media geométrica de las réplicas válidas.'
            : 'En modo individual cada réplica es un punto; las muestras con OD de cultivo paralelo entran con sus promedios.'}
        </p>
        {!filas.length ? <div className="vacio">Sin datos: cargá recuentos en Datos y lecturas en OD.</div> : (
          <div className="tabla-scroll" style={{ maxHeight: 560 }}>
            <table className="tabla">
              <thead><tr>{columnas.map((col) => (
                <th key={col} style={{ cursor: 'pointer' }} onClick={() => setOrden(orden?.col === col ? (orden.dir === 'asc' ? { col, dir: 'desc' } : null) : { col, dir: 'asc' })}>
                  {col}{orden?.col === col ? (orden.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
              ))}</tr></thead>
              <tbody>
                {vista.map((f, i) => (
                  <tr key={i} style={String(f['En la curva']).startsWith('No') ? { color: 'var(--suave)' } : {}}>
                    {columnas.map((col) => <td key={col}>{mostrar(col, f[col])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <ResumenTiempo s={s} filas={resumenT} onda={onda} u={u} />
      {preds.length > 0 && <Predicciones s={s} preds={preds} onda={onda} u={u} />}
      {ratios.length > 0 && (
        <section className="tarjeta">
          <h2>Factor de conversión directo</h2>
          <p>Media geométrica de UFC/mL ÷ OD de los {ratios.length} puntos que entran en la curva:
            {' '}<b>1 unidad de OD<sub>{onda}</sub> ≈ {cient(10 ** mR)} UFC/mL</b>
            {finito(deR) && <> (rango ± 1 DE: {cient(10 ** (mR - deR))} – {cient(10 ** (mR + deR))}; CV ≈ {(100 * Math.sqrt(10 ** (deR * deR * Math.LN10) - 1)).toFixed(0)} %)</>}.</p>
          <p className="ayuda">Es la forma rápida y clásica («OD 1 = X células/mL») y solo vale si la relación es proporcional (recta que pasa por el origen) en el rango de OD usado.
            Si el cociente cambia sistemáticamente con la OD, la relación no es lineal: usá la pestaña <button className="enlace" onClick={() => s.irA('curva')}>Curva</button> para elegir el modelo.</p>
        </section>
      )}
    </div>
  )
}

// Tabla final por tiempo (la que se reporta): Tiempo | OD corregida | UFC/mL | log₁₀ UFC/mL
function ResumenTiempo({ s, filas, onda, u }) {
  if (!filas.length) return null
  const cols = ['Muestra', `Tiempo (${u})`, 'n OD', `OD${onda} corregida (media)`, 'DE OD', 'n UFC', 'UFC/mL (media geométrica)', 'log10 UFC/mL', 'DE log10', 'UFC/mL estimada por curva']
  const datos = filas.map((f) => ({
    Muestra: f.muestra, [`Tiempo (${u})`]: Number.isFinite(f.t) ? f.t : f.tiempo || null, 'n OD': f.nOD, [`OD${onda} corregida (media)`]: r4(f.od), 'DE OD': r4(f.odDe),
    'n UFC': f.nUFC, 'UFC/mL (media geométrica)': f.nUFC ? r3s(f.geo) : null, 'log10 UFC/mL': f.nUFC ? r4(f.logMedia, 3) : null, 'DE log10': r4(f.logDe, 3),
    'UFC/mL estimada por curva': f.pred ? r3s(f.pred.y) : null,
  }))
  return (
    <section className="tarjeta">
      <div className="titulo-fila">
        <h2>Resumen por tiempo <small className="ayuda">(la tabla que se reporta)</small></h2>
        <button className="primario chico" onClick={() => excelDe([{ nombre: 'Resumen por tiempo', columnas: cols, filas: datos }, hojaCondiciones(s.opts)]).then((b) => descargarBlob(b, 'resumen_por_tiempo.xlsx'))}>Descargar Excel</button>
      </div>
      <div className="tabla-scroll">
        <table className="tabla">
          <thead><tr><th>Muestra</th><th>Tiempo ({u})</th><th>OD corregida</th><th>UFC/mL</th><th>log₁₀ UFC/mL</th><th>Estimada por curva</th></tr></thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.grupo}>
                <td><b>{f.muestra || '(sin nombre)'}</b></td>
                <td>{f.tiempo || '–'}</td>
                <td>{finito(f.od) ? `${f.od.toFixed(3)}${finito(f.odDe) ? ' ± ' + f.odDe.toFixed(3) : ''}` : '–'}{f.fueraVentana ? ' ⚠' : ''} <small className="ayuda">{f.nOD ? `n = ${f.nOD}` : ''}</small></td>
                <td>{f.nUFC ? cient(f.geo) : '–'} <small className="ayuda">{f.nUFC ? `n = ${f.nUFC}` : ''}</small></td>
                <td>{f.nUFC ? `${f.logMedia.toFixed(2)}${finito(f.logDe) ? ' ± ' + f.logDe.toFixed(2) : ''}` : '–'}</td>
                <td>{f.pred ? <>≈ {cient(f.pred.y)}{f.pred.extrapola ? ' ⚠' : ''}</> : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="nota">OD corregida = lecturas dentro de la ventana lineal × 10ᵏ, promediadas (⚠: ninguna lectura cayó dentro de la ventana). Media ± DE entre réplicas. «Estimada por curva»: tiempos sin recuento válido, calculados con la ecuación de la pestaña Curva (⚠: fuera del rango calibrado).</p>
    </section>
  )
}

// UFC/mL estimada con la curva para las filas que tienen OD y no tienen recuento válido
function Predicciones({ s, preds, onda, u }) {
  const cols = ['Muestra', `Tiempo (${u})`, 'Réplica', 'OD usada', 'UFC/mL estimada', 'Predicción 95 % inf', 'Predicción 95 % sup', 'Fuera del rango calibrado']
  const datos = preds.map((x) => ({
    Muestra: x.fila.muestra, [`Tiempo (${u})`]: Number.isFinite(x.t) ? x.t : x.fila.tiempo, Réplica: x.fila.rep, 'OD usada': r4(x.p.x),
    'UFC/mL estimada': r3s(x.p.y), 'Predicción 95 % inf': r3s(x.p.p[0]), 'Predicción 95 % sup': r3s(x.p.p[1]), 'Fuera del rango calibrado': x.p.extrapola ? 'Sí' : 'No',
  }))
  return (
    <section className="tarjeta">
      <div className="titulo-fila">
        <h2>UFC/mL estimadas con la curva <small className="ayuda">({preds.length} {preds.length === 1 ? 'réplica' : 'réplicas'} con OD y sin recuento válido)</small></h2>
        <button className="chico" onClick={() => excelDe([{ nombre: 'Estimadas por curva', columnas: cols, filas: datos }, hojaCondiciones(s.opts)]).then((b) => descargarBlob(b, 'ufc_estimadas.xlsx'))}>Descargar Excel</button>
      </div>
      <div className="tabla-scroll chica">
        <table className="tabla">
          <thead><tr><th>Muestra</th><th>Tiempo ({u})</th><th>Rép.</th><th>OD{onda} usada</th><th>UFC/mL estimada</th><th>Predicción 95 %</th><th /></tr></thead>
          <tbody>
            {preds.map((x) => (
              <tr key={x.fila.id}>
                <td><b>{x.fila.muestra || '(sin nombre)'}</b></td><td>{x.fila.tiempo || '–'}</td><td>{x.fila.rep}</td>
                <td>{x.p.x.toFixed(3)}</td><td><b>≈ {cient(x.p.y)}</b></td>
                <td>{cient(x.p.p[0], 1)} – {cient(x.p.p[1], 1)}</td>
                <td>{x.p.extrapola && <span className="estado est">fuera del rango calibrado</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="nota">Se calculan con el modelo elegido en la pestaña Curva ({s.curva.aj?.M.corto}). Son estimaciones, no recuentos: el intervalo de predicción indica dónde caería un recuento real con un 95 % de probabilidad.</p>
    </section>
  )
}
