import { useRef, useState } from 'react'
import { plantilla } from '../excel.js'
import { Campo, Check, Modal, Select } from './ui.jsx'
import { Et } from './tip.jsx'
import { cepasDe, textoCondiciones } from '../modelo.js'
import { factorDe, FACTORES, proporcion, sup } from '../ufc.js'
import { descargarBlob } from '../utils.js'

export function ArchivoTab({ s }) {
  const c = s.opts.condiciones || {}
  const cepas = cepasDe(s.filas)
  const ref = useRef()
  const [info, setInfo] = useState(false)
  const guardar = () => descargarBlob(new Blob([JSON.stringify(s.exportarSesion())], { type: 'application/json' }), 'sesion_recuento_ufc.json')
  const cargar = async (file) => {
    try { s.importarSesion(JSON.parse(await file.text())); s.avisar('Sesión cargada.') } catch { s.avisar('No se pudo leer la sesión.', 'error') }
  }
  return (
    <div className="pagina">
      <section className="tarjeta">
        <h2>Recuento UFC</h2>
        <p>Calcula UFC/mL a partir de recuentos manuales en diluciones seriadas (1:10, 1:5, 1:4, 1:3 o 1:2) y construye la correspondencia entre UFC/mL y densidad óptica (curva de calibración).</p>
        <p className="ayuda aviso-privacidad">Todo se calcula en tu navegador: los datos no se envían a ningún servidor. El trabajo se guarda solo en este navegador; para pasarlo a otra computadora usá «Guardar sesión».</p>
        <ol>
          <li><b>C</b> (colonias): una fila por réplica (muestra, tiempo y réplica) con las colonias contadas en cada dilución. Se puede cargar un Excel o pegar una tabla.</li>
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
          <h2>Diseño del experimento</h2>
          <Campo label={<Et texto="Diluciones seriadas" ayuda="Factor de cada paso de la serie de diluciones. Con 1:10 la columna −3 es 10⁻³ (1:1000); con 1:2 la columna −3 es 2⁻³ (1:8). Se aplica a los recuentos (pestaña C) y a las lecturas de OD. Las concentraciones se siguen mostrando en base 10 (UFC/mL × 10ⁿ)." />}>
            <div className="seg">
              {FACTORES.map(([v, t]) => (
                <button key={v} className={factorDe(s.opts) === v ? 'on' : ''} onClick={() => s.setOpt('factorDil', v)}>{t.replace(' (decimal)', '')}</button>
              ))}
            </div>
          </Campo>
          <p className="ayuda">
            Cada columna −k de las pestañas C y OD es la dilución <b>{factorDe(s.opts)}{sup(-1)}</b>, <b>{factorDe(s.opts)}{sup(-2)}</b>, <b>{factorDe(s.opts)}{sup(-3)}</b>…
            ({[1, 2, 3, 4].map((k) => proporcion(k, factorDe(s.opts))).join(', ')}…).
            {' '}UFC/mL = colonias × {factorDe(s.opts)}ᵏ / volumen; los resultados se muestran en base 10.
          </p>
        </section>
        <section className="tarjeta">
          <h2>Condiciones del experimento</h2>
          <p className="ayuda" style={{ marginTop: 0 }}>Una curva de calibración solo vale para estas condiciones. Se agregan como hoja «Condiciones» en todos los Excel descargados.</p>
          <p style={{ margin: '4px 0 6px' }}><b>{cepas.length === 1 ? 'Cepa' : 'Cepas'}:</b> {cepas.length ? cepas.join(', ') : <span className="ayuda">se toman de la columna Muestra en la pestaña C</span>}
            {cepas.length > 1 && <span className="ayuda"> · cada una tiene su propia curva de calibración y sus parámetros de crecimiento</span>}</p>
          <div className="rejilla-condiciones">
            {[['medio', 'Medio de cultivo', 'BHI'], ['temperatura', 'Temperatura (°C)', '37'], ['fecha', 'Fecha', '']].map(([k, t, ph]) => (
              <Campo key={k} label={t}>
                <input type={k === 'fecha' ? 'date' : 'text'} placeholder={ph} value={c[k] || ''}
                  onChange={(e) => s.setOpt('condiciones', { ...c, [k]: e.target.value })} />
              </Campo>
            ))}
          </div>
          <Campo label={<Et texto="Origen de la OD" ayuda="Indica si la OD se leyó en la misma suspensión que se sembró para el recuento, o en otro cultivo hecho en las mismas condiciones. Cambia cómo se emparejan OD y UFC en la curva." />}>
            <div className="fila-ctrl" style={{ margin: 0, flexWrap: 'nowrap' }}>
              <div style={{ flex: 1 }}><Select value={s.opts.origenGlobal || 'misma'} onChange={(v) => s.setOpt('origenGlobal', v)}
                opciones={[['misma', 'Misma suspensión que se sembró'], ['paralelo', 'Cultivo paralelo (otro tubo, mismas condiciones)']]} /></div>
              <button className="chico" onClick={() => setInfo(true)}>¿Qué cambia?</button>
            </div>
          </Campo>
          <Campo label="Notas"><input value={c.notas || ''} placeholder="Agitación, inóculo, fase…" onChange={(e) => s.setOpt('condiciones', { ...c, notas: e.target.value })} /></Campo>
          <Check label="Mostrar las condiciones al pie de los gráficos" checked={s.opts.notaCondiciones} onChange={(v) => s.setOpt('notaCondiciones', v)}
            ayuda={textoCondiciones(s.opts, s.filas) || 'Completá algún dato para verlo'} />
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
            <li><code>Tiempo</code> (opcional; en la unidad elegida en la pestaña C).</li>
            <li><code>Réplica</code> (opcional; si no está, se toma del nombre —L100A1₂, L100A1_2, L100A1 (2)— o se numera por orden dentro de cada muestra y tiempo).</li>
            <li><code>Volumen (µL)</code> (opcional; si viene, se desactiva «volumen fijo»).</li>
            <li><code>Sin diluir</code>, <code>-1</code>, <code>-2</code>… (también <code>10^-3</code>, <code>10⁻³</code>, <code>1e-3</code>).</li>
            <li>OD por dilución: <code>OD sin diluir</code> (o <code>OD</code>), <code>OD -1</code>, <code>OD -2</code>…, y opcionalmente <code>Blanco</code>. Pueden ir en la misma hoja que los recuentos o en otra.</li>
          </ul>
          <button className="primario" onClick={() => plantilla().then((b) => descargarBlob(b, 'plantilla_recuento_ufc.xlsx'))}>Descargar plantilla con ejemplo</button>
        </section>
      </div>
      {info && (
        <Modal titulo="¿La OD es de la misma suspensión que se sembró?" ancho={680} onClose={() => setInfo(false)}
          pie={<button className="primario" onClick={() => setInfo(false)}>Entendido</button>}>
          <h4>Misma suspensión (emparejada)</h4>
          <p>La OD se leyó en el mismo tubo del que se sacó la alícuota para las diluciones y la siembra. Cada réplica aporta un par (OD, UFC/mL) real:
            la OD y las UFC de esa réplica describen la misma población de células, así que cada réplica es un punto de la curva (modo <i>individual</i>).</p>
          <h4>Cultivo paralelo (independiente)</h4>
          <p>La OD se leyó en otro tubo preparado en las mismas condiciones. La réplica 1 de OD y la réplica 1 de UFC <b>no son el mismo cultivo</b>:
            emparejarlas sería arbitrario. Lo correcto es comparar el <b>promedio</b> de OD con el <b>promedio</b> de UFC de cada cepa en cada tiempo;
            por eso, en modo individual, cada cepa y tiempo aportan un único punto. La variación entre cultivos se suma al error: la curva tendrá más dispersión.</p>
          <p className="ayuda">En modo <i>promedio</i> no hay diferencia: todos los grupos entran como OD media vs. UFC media (media geométrica).</p>
        </Modal>
      )}
    </div>
  )
}
