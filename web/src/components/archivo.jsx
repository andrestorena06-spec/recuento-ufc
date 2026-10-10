import { useRef } from 'react'
import { plantilla } from '../excel.js'
import { Campo, Check } from './ui.jsx'
import { textoCondiciones } from '../modelo.js'
import { descargarBlob } from '../utils.js'

export function ArchivoTab({ s }) {
  const c = s.opts.condiciones || {}
  const ref = useRef()
  const guardar = () => descargarBlob(new Blob([JSON.stringify(s.exportarSesion())], { type: 'application/json' }), 'sesion_recuento_ufc.json')
  const cargar = async (file) => {
    try { s.importarSesion(JSON.parse(await file.text())); s.avisar('Sesión cargada.') } catch { s.avisar('No se pudo leer la sesión.', 'error') }
  }
  return (
    <div className="pagina">
      <section className="tarjeta">
        <h2>Recuento UFC</h2>
        <p>Calcula UFC/mL a partir de recuentos manuales en diluciones seriadas 1:10 y construye la correspondencia entre UFC/mL y densidad óptica (curva de calibración).</p>
        <p className="ayuda aviso-privacidad">Todo se calcula en tu navegador: los datos no se envían a ningún servidor. El trabajo se guarda solo en este navegador; para pasarlo a otra computadora usá «Guardar sesión».</p>
        <ol>
          <li><b>Datos</b>: una fila por réplica (muestra, tiempo y réplica) con las colonias contadas en cada dilución. Se puede cargar un Excel o pegar una tabla.</li>
          <li><b>OD</b>: la OD leída en cada dilución (sin diluir, −1, −2…); el programa arma la OD corregida con las lecturas que caen en el rango lineal.</li>
          <li><b>Crecimiento</b>: OD y log₁₀ UFC/mL en el tiempo (doble eje), fase exponencial, µ, tiempo de generación y latencia.</li>
          <li><b>Tabla</b>: la correspondencia UFC/mL ↔ OD, por réplica o promediada.</li>
          <li><b>Curva</b>: correlación OD ↔ log₁₀ UFC/mL con ecuación y R², comparación de modelos, residuos y calculadora.</li>
          <li><b>Método</b>: cómo se hace cada cálculo y por qué.</li>
        </ol>
      </section>
      <div className="rejilla-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <section className="tarjeta">
          <h2>Sesión</h2>
          <p className="ayuda" style={{ marginTop: 0 }}>Guarda recuentos, OD, opciones, exclusiones y estilos en un archivo .json.</p>
          <div className="fila-ctrl">
            <button className="primario" onClick={guardar} disabled={!s.filas.length}>Guardar sesión</button>
            <button onClick={() => ref.current.click()}>Cargar sesión</button>
            <input ref={ref} type="file" hidden accept=".json" onChange={(e) => { e.target.files[0] && cargar(e.target.files[0]); e.target.value = '' }} />
          </div>
          <hr />
          <button className="peligro" onClick={() => window.confirm('¿Empezar un trabajo nuevo? Se borran los datos actuales de este navegador.') && s.nuevo()}>Empezar de cero</button>
        </section>
        <section className="tarjeta">
          <h2>Condiciones del experimento</h2>
          <p className="ayuda" style={{ marginTop: 0 }}>Una curva de calibración solo vale para estas condiciones. Se agregan como hoja «Condiciones» en todos los Excel descargados.</p>
          <div className="fila-ctrl">
            {[['cepa', 'Cepa', 'L100A1'], ['medio', 'Medio de cultivo', 'BHI'], ['temperatura', 'Temperatura (°C)', '37'], ['fecha', 'Fecha', '']].map(([k, t, ph]) => (
              <Campo key={k} label={t}>
                <input type={k === 'fecha' ? 'date' : 'text'} style={{ width: k === 'temperatura' ? 90 : 150 }} placeholder={ph} value={c[k] || ''}
                  onChange={(e) => s.setOpt('condiciones', { ...c, [k]: e.target.value })} />
              </Campo>
            ))}
          </div>
          <Campo label="Notas"><input value={c.notas || ''} placeholder="Agitación, inóculo, fase…" onChange={(e) => s.setOpt('condiciones', { ...c, notas: e.target.value })} /></Campo>
          <Check label="Mostrar las condiciones al pie de los gráficos" checked={s.opts.notaCondiciones} onChange={(v) => s.setOpt('notaCondiciones', v)}
            ayuda={textoCondiciones(s.opts) || 'Completá algún dato para verlo'} />
        </section>
        <section className="tarjeta">
          <h2>Nombres de muestra guardados</h2>
          <p className="ayuda" style={{ marginTop: 0 }}>Se guardan al escribirlos y se sugieren en la columna Muestra (también se conservan al empezar de cero).</p>
          <div className="chips-nombres">
            {(s.opts.nombres || []).map((n) => (
              <span key={n}>{n}<button className="mini" title="Olvidar este nombre" onClick={() => s.setOpt('nombres', s.opts.nombres.filter((x) => x !== n))}>×</button></span>
            ))}
            {!(s.opts.nombres || []).length && <span className="ayuda" style={{ background: 'none' }}>Todavía no hay nombres guardados.</span>}
          </div>
        </section>
        <section className="tarjeta">
          <h2>Formato del Excel</h2>
          <p className="ayuda" style={{ marginTop: 0 }}>Una fila de encabezados con <code>Muestra</code> y las columnas que correspondan:</p>
          <ul className="ayuda">
            <li><code>Tiempo</code> (opcional; en la unidad elegida en Datos).</li>
            <li><code>Réplica</code> (opcional; si no está, se toma del nombre —L100A1₂, L100A1_2, L100A1 (2)— o se numera por orden dentro de cada muestra y tiempo).</li>
            <li><code>Volumen (µL)</code> (opcional; si viene, se desactiva «volumen fijo»).</li>
            <li><code>Sin diluir</code>, <code>-1</code>, <code>-2</code>… (también <code>10^-3</code>, <code>10⁻³</code>, <code>1e-3</code>).</li>
            <li>OD por dilución: <code>OD sin diluir</code> (o <code>OD</code>), <code>OD -1</code>, <code>OD -2</code>…, y opcionalmente <code>Blanco</code> y <code>Origen OD</code> (misma / paralelo). Pueden ir en la misma hoja que los recuentos o en otra.</li>
          </ul>
          <button className="primario" onClick={() => plantilla().then((b) => descargarBlob(b, 'plantilla_recuento_ufc.xlsx'))}>Descargar plantilla con ejemplo</button>
        </section>
      </div>
    </div>
  )
}
