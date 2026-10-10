import { useRef } from 'react'
import { plantilla } from '../excel.js'
import { descargarBlob } from '../utils.js'

export function ArchivoTab({ s }) {
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
          <li><b>Datos</b>: una fila por réplica con las colonias contadas en cada dilución (se puede cargar un Excel o pegar desde Excel).</li>
          <li><b>OD</b>: la longitud de onda y la OD de cada réplica, y si la OD es de la misma suspensión sembrada o de un cultivo paralelo.</li>
          <li><b>Tabla</b>: la correspondencia UFC/mL ↔ OD, por réplica o promediada.</li>
          <li><b>Curva</b>: ajuste de modelos, comparación, residuos y calculadora OD → UFC/mL.</li>
          <li><b>Método</b>: cómo se hace cada cálculo y por qué.</li>
        </ol>
      </section>
      <div className="rejilla-2">
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
          <h2>Formato del Excel</h2>
          <p className="ayuda" style={{ marginTop: 0 }}>Una fila de encabezados con <code>Muestra</code> y las columnas que correspondan:</p>
          <ul className="ayuda">
            <li><code>Réplica</code> (opcional; si no está, se toma del nombre: L100A1₂, L100A1_2, L100A1 (2), o por orden de aparición).</li>
            <li><code>Volumen (µL)</code> y <code>Dilución previa</code> (opcionales).</li>
            <li><code>Sin diluir</code>, <code>-1</code>, <code>-2</code>… (también <code>10^-3</code>, <code>10⁻³</code>, <code>1e-3</code>).</li>
            <li>OD: <code>OD</code>, <code>OD 2</code>…, <code>Blanco</code>, <code>Dilución lectura OD</code>, <code>Origen OD</code> (misma / paralelo). Pueden ir en la misma hoja o en otra.</li>
          </ul>
          <button className="primario" onClick={() => plantilla().then((b) => descargarBlob(b, 'plantilla_recuento_ufc.xlsx'))}>Descargar plantilla con ejemplo</button>
        </section>
      </div>
    </div>
  )
}
