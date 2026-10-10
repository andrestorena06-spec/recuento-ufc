import { useCallback, useEffect, useMemo, useState } from 'react'
import { DatosTab } from './components/datos.jsx'
import { ODTab } from './components/od.jsx'
import { TablaTab } from './components/tabla.jsx'
import { CurvaTab } from './components/curva.jsx'
import { MetodoTab } from './components/metodo.jsx'
import { ArchivoTab } from './components/archivo.jsx'
import { Modal } from './components/ui.jsx'
import { K_DEF, optsDef, filaVacia, numerarReplicas } from './modelo.js'
import { correspondencia } from './calibracion.js'

const CLAVE = 'recuento-ufc-v1'
const PESTANAS = [
  ['archivo', 'Archivo', 'Sesión y plantilla'],
  ['datos', 'Datos', 'Recuento de colonias'],
  ['od', 'OD', 'Densidad óptica'],
  ['tabla', 'Tabla', 'UFC/mL ↔ OD'],
  ['curva', 'Curva', 'Calibración y modelos'],
  ['metodo', 'Método', 'Cálculos y referencias'],
]

// Logo: placa de Petri con colonias
const Logo = () => (
  <svg viewBox="0 0 40 40" width="34" height="34" aria-hidden>
    <circle cx="20" cy="20" r="17" fill="none" stroke="#ffe3c2" strokeWidth="2" />
    <circle cx="20" cy="20" r="14" fill="none" stroke="#ffe3c2" strokeOpacity=".4" strokeWidth="1" />
    {[[13, 14, 2.2], [24, 12, 1.6], [27, 22, 2.4], [15, 25, 1.8], [21, 19, 1.4], [19, 29, 1.5], [10, 20, 1.2], [29, 15, 1.1]].map(([x, y, r], i) => (
      <circle key={i} cx={x} cy={y} r={r} fill="#ffe3c2" />
    ))}
  </svg>
)

function cargarGuardado() {
  try { return JSON.parse(localStorage.getItem(CLAVE)) || {} } catch { return {} }
}

export default function App() {
  const g = useMemo(cargarGuardado, [])
  const [pendiente, setPendiente] = useState(() => !!(g.filas && g.filas.length))
  const [tab, setTab] = useState('datos')
  const [filas, setFilasCrudo] = useState([])
  // toda modificación de filas pasa por acá: las réplicas automáticas se renumeran por muestra y tiempo
  const setFilas = useCallback((x) => setFilasCrudo((fs) => numerarReplicas(typeof x === 'function' ? x(fs) : x)), [])
  const [K, setK] = useState(K_DEF)
  const [M, setM] = useState(1)
  const [opts, setOpts] = useState(optsDef)
  const [estilos, setEstilos] = useState({})
  const [avisos, setAvisos] = useState([])

  useEffect(() => {
    if (pendiente) return
    try { localStorage.setItem(CLAVE, JSON.stringify({ fecha: new Date().toISOString(), filas, K, M, opts, estilos })) } catch { /* sin almacenamiento */ }
  }, [pendiente, filas, K, M, opts, estilos])

  const avisar = useCallback((texto, tipo = 'ok') => {
    const id = Math.random()
    setAvisos((a) => [...a, { id, texto, tipo }])
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 4500)
  }, [])

  const aplicarSesion = (x) => {
    if (!Array.isArray(x?.filas)) throw new Error('inválida')
    const k = Math.max(Number(x.K) || K_DEF, ...x.filas.map((f) => f.conteos?.length || 0))
    const m = Math.max(Number(x.M) || 1, ...x.filas.map((f) => f.od?.lecturas?.length || 0))
    setFilas(x.filas.map((f) => ({
      ...filaVacia(f.muestra, f.rep, k, m), repManual: true, ...f,
      conteos: Array.from({ length: k }, (_, i) => f.conteos?.[i] ?? ''),
      od: { blanco: '', dil: '', ...(f.od || {}), lecturas: Array.from({ length: m }, (_, i) => f.od?.lecturas?.[i] ?? '') },
    })))
    setK(k)
    setM(m)
    setOpts((o) => ({ ...optsDef(), ...(x.opts || {}), nombres: [...new Set([...(o.nombres || []), ...(x.opts?.nombres || [])])] }))
    setEstilos(x.estilos || {})
  }
  const continuarAnterior = () => { try { aplicarSesion(g) } catch { /* nada */ } setPendiente(false) }
  const empezarDeCero = () => { try { localStorage.removeItem(CLAVE) } catch { /* nada */ } setPendiente(false) }

  const actualizarFila = useCallback((id, cambios) => {
    setFilas((fs) => fs.map((f) => (f.id === id ? { ...f, ...(typeof cambios === 'function' ? cambios(f) : cambios) } : f)))
  }, [])

  const corr = useMemo(() => correspondencia(filas, opts), [filas, opts])

  const s = {
    filas, setFilas, actualizarFila, K, setK, M, setM, opts, setOpts,
    setOpt: (k, v) => setOpts((o) => ({ ...o, [k]: v })),
    estilos, setEstilo: (k) => (e) => setEstilos((x) => ({ ...x, [k]: e })),
    avisar, corr, irA: setTab,
    exportarSesion: () => ({ version: 1, programa: 'recuento-ufc', filas, K, M, opts, estilos }),
    importarSesion: aplicarSesion,
    nuevo: () => { setFilas([]); setK(K_DEF); setM(1); setOpts((o) => ({ ...optsDef(), nombres: o.nombres })) },
  }

  const Vista = { archivo: ArchivoTab, datos: DatosTab, od: ODTab, tabla: TablaTab, curva: CurvaTab, metodo: MetodoTab }[tab]
  const nMuestras = corr.muestras.length
  const onda = opts.onda === 'otra' ? opts.ondaOtra : opts.onda

  return (
    <div className="app">
      <nav className="barra">
        <div className="marca">
          <div className="logo"><Logo /></div>
          <div><b>Recuento UFC</b><small>Diluciones y curva OD</small></div>
        </div>
        {PESTANAS.map(([id, t, d], i) => (
          <button key={id} className={`nav ${tab === id ? 'activa' : ''}`} onClick={() => setTab(id)}>
            <span className="num">{i + 1}</span>
            <span><b>{t}</b><small>{d}</small></span>
          </button>
        ))}
        <div className="pie-nav">
          {filas.length > 0 && <div className="chip-odc">{nMuestras} {nMuestras === 1 ? 'muestra' : 'muestras'} · {filas.length} réplicas</div>}
          <small>OD a {onda || '?'} nm</small>
        </div>
      </nav>
      <main className="contenido">
        <Vista s={s} />
      </main>
      {pendiente && (
        <Modal titulo="Encontré trabajo anterior" ancho={520}
          pie={<><button onClick={empezarDeCero}>Empezar de cero</button><button className="primario" onClick={continuarAnterior}>Continuar con lo anterior</button></>}>
          <p>En este navegador quedó guardado un trabajo
            {g.fecha ? <> del <b>{new Date(g.fecha).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}</b></> : ''}:
            {' '}<b>{new Set(g.filas.map((f) => f.muestra)).size}</b> muestras y <b>{g.filas.length}</b> réplicas.</p>
          <p className="ayuda">«Empezar de cero» lo borra del navegador. Si querés conservarlo, primero continuá y usá «Guardar sesión» en Archivo.</p>
        </Modal>
      )}
      <div className="toasts">{avisos.map((a) => <div key={a.id} className={`toast ${a.tipo}`}>{a.texto}</div>)}</div>
    </div>
  )
}
