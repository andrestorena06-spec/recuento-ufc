import { useMemo, useState } from 'react'
import { datosCurva, motivoSinPunto } from '../calibracion.js'
import { cient, ESTADOS, nombreRep } from '../ufc.js'
import { finito } from '../estadistica.js'
import { excelDe } from '../excel.js'
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

export function TablaTab({ s }) {
  const o = s.opts
  const c = s.corr
  const onda = ondaDe(o)
  const curva = useMemo(() => datosCurva(c, o), [c, o])
  const enCurva = new Map(curva.todos.map((p) => [p.key, p]))
  const [orden, setOrden] = useState(null)

  const filas = useMemo(() => {
    if (o.modo === 'promedio') {
      return c.prom.map((p) => {
        const k = enCurva.get('m:' + p.muestra)
        return {
          Muestra: p.muestra, 'n OD': p.nOD, [`OD${onda} media`]: r4(p.x), 'DE OD': r4(p.xde),
          'n UFC': p.nUFC, 'UFC/mL (media geométrica)': r3s(p.y), 'log10 UFC/mL': r4(p.logMedia, 3), 'DE log10': r4(p.logDe, 3),
          'IC95 inf': r3s(10 ** (p.logMedia - p.logIc)), 'IC95 sup': r3s(10 ** (p.logMedia + p.logIc)),
          'UFC/mL (media aritmética)': r3s(p.yAritm), 'UFC/mL por unidad de OD': r3s(p.y / p.x),
          'Origen OD': p.origen === 'paralelo' ? 'Cultivo paralelo' : 'Misma suspensión',
          'En la curva': k ? (k.usado ? 'Sí' : 'No: ' + k.motivo) : 'No: ' + (!p.nOD ? 'sin OD' : 'sin recuento válido'),
        }
      })
    }
    return c.ind.map((p) => {
      const k = enCurva.get('i:' + p.id) || (p.origen === 'paralelo' ? enCurva.get('m:' + p.muestra) : null)
      const sin = motivoSinPunto(p, o)
      const enC = p.origen === 'paralelo'
        ? (k ? (k.usado ? 'Sí, como promedio de la muestra' : 'No: ' + k.motivo) : 'No: ' + (sin || 'sin promedio'))
        : sin ? 'No: ' + sin : k ? (k.usado ? 'Sí' : 'No: ' + k.motivo) : 'No'
      return {
        Muestra: p.muestra, Réplica: p.rep, [`OD${onda} neta`]: r4(p.x), 'Lecturas OD': p.d.n, 'Dil. lectura OD': p.d.Fod,
        'UFC/mL (suspensión leída)': r3s(p.y), 'IC95 inf': r3s(p.ic[0]), 'IC95 sup': r3s(p.ic[1]), 'log10 UFC/mL': r4(Math.log10(p.y), 3),
        'UFC/mL madre': r3s(p.r.Nmadre), 'UFC/mL por unidad de OD': r3s(p.y / p.x), 'Recuento': ESTADOS[p.r.estado][0],
        'Diluciones usadas': p.r.dils.map((k) => (k ? '-' + k : '0')).join(', '),
        'Origen OD': p.origen === 'paralelo' ? 'Cultivo paralelo' : 'Misma suspensión', 'En la curva': enC,
      }
    })
  }, [c, o, onda])
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
            <ModoSel s={s} />
            <button className="primario" disabled={!filas.length}
              onClick={() => excelDe([{ nombre: o.modo === 'promedio' ? 'Promedios' : 'Individual', columnas, filas: vista }]).then((b) => descargarBlob(b, `correspondencia_${o.modo}.xlsx`))}>
              Descargar Excel</button>
          </div>
        </div>
        <p className="ayuda" style={{ marginTop: 0 }}>
          La UFC/mL que se compara con cada OD es la de <b>la suspensión cuya OD se leyó</b>: UFC/mL de la muestra madre (recuento × 10ᵏ / volumen × dilución previa)
          ÷ factor de dilución de la lectura de OD. {o.modo === 'promedio'
            ? 'En modo promedio la OD es la media aritmética y la UFC/mL la media geométrica de las réplicas válidas.'
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
                    {columnas.map((col) => <td key={col}>{col === 'Muestra' && f.Réplica ? nombreRep(f.Muestra, f.Réplica) : mostrar(col, f[col])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
