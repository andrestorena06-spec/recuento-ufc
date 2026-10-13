import { useMemo, useState } from 'react'
import { Campo, Check, Select } from './ui.jsx'
import { PanelGrafico } from './panelGrafico.jsx'
import { ModoSel, PuntosSel } from './tabla.jsx'
import { Ayuda, BotonTip, Calc, Et } from './tip.jsx'
import { dPrediccion } from '../desarrollos.js'
import { ondaDe } from './od.jsx'
import { etiquetaK, interpretar, MODELOS, odParaUFC } from '../calibracion.js'
import { ejeUFC, OPCIONES_EJE_UFC } from '../modelo.js'
import { cient, fmtP, leerFactor } from '../ufc.js'
import { finito } from '../estadistica.js'
import { paletaMuestras } from '../utils.js'
import { excelDe, hojaCondiciones } from '../excel.js'
import { descargarBlob } from '../utils.js'

const num = (x, d = 4) => (finito(x) ? (Math.abs(x) >= 1e4 || (Math.abs(x) < 1e-3 && x !== 0) ? cient(x, 3) : x.toPrecision(d)) : '–')

export function CurvaTab({ s }) {
  const o = s.opts
  const onda = ondaDe(o)
  const ejeOD = `OD${onda ? ' a ' + onda + ' nm' : ''}`
  const ejeOD2 = o.puntos === 'dilucion' ? ejeOD : `OD corregida${onda ? ' (' + onda + ' nm)' : ''}`
  const { todos, usados, usadosDet, ajustes, lin, separadas, detalle, cepas, porCepa, comparacion: cmpCepas } = s.curva
  const aj = ajustes[o.modelo]
  const ok = aj && !aj.error
  const u = o.unidadTiempo || 'h'
  const tiempos = [...new Set(s.corr.ind.map((p) => p.tiempo))].sort((a, b) => (Number(a) - Number(b)) || String(a).localeCompare(String(b)))
  const porTiempo = o.colorPor === 'tiempo'
  const porDil = o.colorPor === 'dilucion'
  const dils = [...new Set(s.corr.ind.map((p) => p.k).filter((k) => k !== null))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))
  const colD = paletaMuestras(dils.map(String))
  const colM = paletaMuestras(s.corr.muestras)
  const colT = paletaMuestras(tiempos)
  const colorCurva = separadas ? colM[detalle] : '#3a2a1e'
  const colorDe = (p) => (porTiempo ? colT[p.tiempo] : porDil ? colD[String(p.k)] : colM[p.muestra])
  const nombreDe = (p) => (p.tipo === 'promedio' ? `${p.etiqueta}, ${etiquetaK(p.k).toLowerCase()} (promedio)` : `${p.etiqueta}, réplica ${p.rep}, ${etiquetaK(p.k).toLowerCase()}`)
  const [barras, setBarras] = useState(true)

  const alternar = (p) => {
    const ex = o.excluidos.includes(p.key) ? o.excluidos.filter((k) => k !== p.key) : [...o.excluidos, p.key]
    s.setOpt('excluidos', ex)
  }

  // curva y bandas sobre el rango de OD de los puntos usados (de la cepa del detalle si hay una curva por cepa)
  const xs = usadosDet.map((p) => p.x).filter((x) => x > 0)
  const xmin = xs.length ? Math.min(...xs) : 0.01
  const xmax = xs.length ? Math.max(...xs) : 1
  const curvaPts = useMemo(() => {
    if (!ok) return []
    const lo = o.escalaX === 'log' || aj.M.escala === 'loglog' ? xmin / 1.15 : 0
    const hi = xmax * 1.08
    return Array.from({ length: 160 }, (_, i) => {
      const x = o.escalaX === 'log' || aj.M.escala === 'loglog' ? lo * (hi / lo) ** (i / 159) : lo + ((hi - lo) * i) / 159
      return [x, aj.banda(x)]
    }).filter(([, b]) => b)
  }, [aj, ok, xmin, xmax, o.escalaX])

  const puntos = todos.map((p) => {
    const prom = p.tipo === 'promedio'
    let yErr = null, xErr = null
    if (barras && prom && p.nUFC > 1) yErr = [10 ** (p.logMedia - p.logDe), 10 ** (p.logMedia + p.logDe)]
    if (barras && prom && p.nOD > 1) xErr = [p.x - p.xde, p.x + p.xde]
    if (barras && !prom && finito(p.ic?.[0])) yErr = p.ic
    return {
      key: p.key, x: p.x, y: p.y, color: colorDe(p), excluido: !p.usado, forma: prom ? 'cuadrado' : 'circulo', yErr, xErr,
      titulo: `${nombreDe(p)}${p.dilsOD ? ` (OD de ${p.dilsOD.map(etiquetaK).join(', ').toLowerCase()})` : ''}\nOD = ${p.x.toFixed(3)} · ${cient(p.y)} UFC/mL${p.usado ? '' : '\nFuera del ajuste: ' + p.motivo}\nClic para ${p.usado ? 'excluir' : 'incluir'}`,
    }
  })
  const leyenda = [
    ...(porDil
      ? dils.filter((k) => todos.some((p) => p.k === k)).map((k) => ({ texto: etiquetaK(k), color: colD[String(k)] }))
      : porTiempo
      ? tiempos.filter((t) => todos.some((p) => p.tiempo === t)).slice(0, 14).map((t) => ({ texto: t === '' ? '(sin tiempo)' : `${t} ${u}`, color: colT[t] }))
      : s.corr.muestras.filter((m) => todos.some((p) => p.muestra === m)).slice(0, 14).map((m) => ({ texto: m || '(sin nombre)', color: colM[m] }))),
    ...(ok ? [{ texto: separadas ? `${MODELOS[o.modelo].corto}, una por cepa` : MODELOS[o.modelo].corto, color: '#3a2a1e', linea: true }] : []),
    ...(ok && o.bandaC ? [{ texto: separadas ? `IC 95 % (${detalle})` : 'IC 95 % curva', color: separadas ? colorCurva : '#d9731f', banda: true, opacidad: 0.3 }] : []),
    ...(ok && o.bandaP ? [{ texto: separadas ? `Predicción 95 % (${detalle})` : 'Predicción 95 %', color: '#8a7765', linea: true, dash: '4 4' }] : []),
  ]
  // con una curva por cepa: la línea de cada cepa en su color, sobre su propio rango de OD
  const lineaDe = (a, x0, x1) => {
    const log = o.escalaX === 'log' || a.M.escala === 'loglog'
    const lo = log ? x0 / 1.15 : 0, hi = x1 * 1.08
    return Array.from({ length: 120 }, (_, i) => { const x = log ? lo * (hi / lo) ** (i / 119) : lo + ((hi - lo) * i) / 119; return [x, a.pred(x)] })
  }
  const otras = separadas ? porCepa.filter((c) => c.muestra !== detalle && c.aj).map((c) => ({ pts: lineaDe(c.aj, c.xmin, c.xmax), color: colM[c.muestra], ancho: 2 })) : []
  const bandas = ok && o.bandaC ? [{ sup: curvaPts.map(([x, b]) => [x, b.c[1]]), inf: curvaPts.map(([x, b]) => [x, b.c[0]]), color: separadas ? colorCurva : '#d9731f', opacidad: 0.15 }] : []
  const curvas = ok ? [
    ...otras,
    { pts: curvaPts.map(([x, b]) => [x, b.y]), color: colorCurva, ancho: 2.4 },
    ...(o.bandaP ? [{ pts: curvaPts.map(([x, b]) => [x, b.p[0]]), color: '#8a7765', dash: '4 4', ancho: 1.2 }, { pts: curvaPts.map(([x, b]) => [x, b.p[1]]), color: '#8a7765', dash: '4 4', ancho: 1.2 }] : []),
  ] : []

  const comparacion = Object.entries(ajustes).filter(([, a]) => !a.error)
  const mejorAic = Math.min(...comparacion.map(([, a]) => a.aicc).filter(finito))

  const exportar = () => {
    const hojas = [{
      nombre: 'Puntos', columnas: ['Muestra', `Tiempo (${u})`, 'Réplica', 'Dilución OD', 'Tipo', 'OD', 'UFC/mL', 'En el ajuste', 'Motivo', 'UFC/mL ajustado', 'Residuo log10'],
      filas: todos.map((p) => ({ Muestra: p.muestra, [`Tiempo (${u})`]: Number.isFinite(p.t) ? p.t : p.tiempo, Réplica: p.rep ?? '', 'Dilución OD': etiquetaK(p.k), Tipo: p.tipo, OD: p.x, 'UFC/mL': p.y, 'En el ajuste': p.usado ? 'Sí' : 'No', Motivo: p.motivo,
        'UFC/mL ajustado': ok ? aj.pred(p.x) : null, 'Residuo log10': ok && aj.pred(p.x) > 0 ? Math.log10(p.y / aj.pred(p.x)) : null })),
    }, {
      nombre: 'Modelos', columnas: ['Modelo', 'Ecuación', 'n', 'R2', 'R2 ajustado', 'RMSE log10', 'AICc', 'Error relativo medio %'],
      filas: comparacion.map(([m, a]) => ({ Modelo: MODELOS[m].nombre, Ecuación: MODELOS[m].ecuacion(a.f.beta), n: a.f.n, R2: a.f.r2, 'R2 ajustado': a.f.r2aj, 'RMSE log10': a.rmseLog, AICc: a.aicc, 'Error relativo medio %': a.mape })),
    }]
    if (ok) hojas.push({
      nombre: 'Parámetros', columnas: ['Parámetro', 'Estimación', 'Error estándar', 'IC95 inf', 'IC95 sup', 't', 'p'],
      filas: aj.M.params.map((nm, i) => ({ Parámetro: nm, Estimación: aj.f.beta[i], 'Error estándar': aj.f.se[i], 'IC95 inf': aj.f.ic[i][0], 'IC95 sup': aj.f.ic[i][1], t: aj.f.t[i], p: aj.f.p[i] })),
    })
    hojas.push(hojaCondiciones(o, s.filas))
    excelDe(hojas).then((b) => descargarBlob(b, `curva_${o.modelo}.xlsx`))
  }

  return (
    <div className="con-lateral">
      <aside className="lateral">
        <h2>Curva de calibración</h2>
        <Campo label={<Et texto="OD de cada punto" ayuda="Qué OD se usa en el eje X. «OD corregida»: un punto por réplica con la OD de la muestra (lecturas dentro de la ventana lineal × 10ᵏ). «Por dilución»: cada lectura de OD es un punto con la UFC/mL de esa dilución." />}><PuntosSel s={s} /></Campo>
        <Campo label={<Et texto="Réplicas" ayuda="«Réplicas individuales»: cada réplica es un punto. «Promedio por muestra»: un punto por cepa y tiempo (OD media frente a la media geométrica de UFC/mL), con barras de ± 1 DE." />}><ModoSel s={s} /></Campo>
        {cepas.length > 1 && (
          <Campo label={<Et texto={`Curva (${cepas.length} cepas)`} ayuda="Cada cepa puede tener su propia relación OD ↔ UFC (por tamaño y forma celular). La prueba F debajo del gráfico indica si las cepas difieren." />}>
            <div className="seg">
              <BotonTip className={o.curvaPor !== 'comun' ? 'on' : ''} onClick={() => s.setOpt('curvaPor', 'cepa')}
                ayuda="Ajusta una ecuación distinta para cada cepa, cada una en su color (recomendado si la prueba F da p < 0,05).">Una por cepa</BotonTip>
              <BotonTip className={o.curvaPor === 'comun' ? 'on' : ''} onClick={() => s.setOpt('curvaPor', 'comun')}
                ayuda="Ajusta una sola ecuación con los puntos de todas las cepas juntas (válido si las cepas no difieren).">Común a todas</BotonTip>
            </div>
          </Campo>
        )}
        {separadas && (
          <Campo label={<Et texto="Cepa del detalle" ayuda="Cepa cuyos resultados completos se muestran abajo: parámetros con su error, comparación de modelos, interpretación, residuos y calculadora. Las demás cepas siguen dibujadas en el gráfico." />}>
            <Select value={detalle} onChange={(v) => s.setOpt('cepaDetalle', v)} opciones={cepas.map((c) => [c, c])} />
          </Campo>
        )}
        <Campo label={<Et texto="Modelo" ayuda="Forma de la relación entre OD y UFC/mL. «Clásico» (log₁₀ UFC = m·OD + b) es la recta habitual; «Proporcional» (UFC = b·OD) es la que corresponde al rango lineal del fotómetro; «Lineal», «Cuadrático» y «Log–log» sirven para comparar. La tabla «Comparación de modelos» indica cuál ajusta mejor." />}>
          <Select value={o.modelo} onChange={(v) => s.setOpt('modelo', v)} opciones={Object.entries(MODELOS).map(([k, m]) => [k, m.nombre])} />
        </Campo>
        {MODELOS[o.modelo].escala === 'lin' && (
          <Campo label={<Et texto="Ponderación" ayuda="Cuánto pesa cada punto en el ajuste. Con «error proporcional» cada punto pesa según su error relativo (recomendado, porque el error de un recuento crece con su valor). Sin ponderar, los puntos de UFC alta dominan." />}>
            <Select value={o.ponderacion} onChange={(v) => s.setOpt('ponderacion', v)}
              opciones={[['relativa', 'Error proporcional (pesos 1/UFC²)'], ['ninguna', 'Sin ponderar (mínimos cuadrados)']]} />
          </Campo>
        )}
        <p className="nota">{MODELOS[o.modelo].escala === 'lin'
          ? (o.ponderacion === 'relativa' ? 'Recomendado: el error de un recuento es proporcional a su valor, así que cada punto pesa según su error relativo.' : 'Sin ponderar, los puntos de UFC alta dominan el ajuste.')
          : 'Ajuste por mínimos cuadrados sobre log₁₀(UFC/mL): ya supone error proporcional.'}</p>
        <div className="fila-ctrl">
          <Campo label={<Et texto="Eje Y" ayuda="Escala de UFC/mL: log₁₀ (valores 2…9, lo habitual en los papers), logarítmica con etiquetas 10ⁿ, o lineal." />}><Select value={o.escalaY} onChange={(v) => s.setOpt('escalaY', v)} opciones={OPCIONES_EJE_UFC} /></Campo>
          <Campo label={<Et texto="Eje X" ayuda="Escala de la OD: lineal (lo habitual) o logarítmica (útil si las OD abarcan varios órdenes de magnitud)." />}><Select value={o.escalaX} onChange={(v) => s.setOpt('escalaX', v)} opciones={[['lin', 'Lineal'], ['log', 'Log']]} /></Campo>
        </div>
        <Campo label={<Et texto="Color de los puntos" ayuda="Colorea los puntos por cepa, por tiempo de muestreo o por dilución leída, para ver de dónde viene cada punto." />}>
          <Select value={o.colorPor} onChange={(v) => s.setOpt('colorPor', v)} opciones={[['muestra', 'Por cepa'], ['tiempo', 'Por tiempo'], ['dilucion', 'Por dilución']]} />
        </Campo>
        <Check label={<Et texto="Ecuación y R² sobre el gráfico" ayuda="Escribe la ecuación ajustada y su R² en un recuadro dentro del gráfico (como la línea de tendencia de Excel). Sale también en la imagen descargada." />} checked={o.mostrarEcuacion} onChange={(v) => s.setOpt('mostrarEcuacion', v)} />
        <Check label={<Et texto="Banda de confianza 95 %" ayuda="Zona sombreada donde está la curva verdadera con 95 % de confianza. Es angosta en el centro de los datos y se abre en los extremos." />} checked={o.bandaC} onChange={(v) => s.setOpt('bandaC', v)} />
        <Check label={<Et texto="Banda de predicción 95 %" ayuda="Líneas punteadas donde caería el recuento de una muestra nueva con 95 % de probabilidad. Es la que importa para usar la curva: indica cuánto puede errar una estimación." />} checked={o.bandaP} onChange={(v) => s.setOpt('bandaP', v)} />
        <Check label={<Et texto="Barras de error en los puntos" ayuda="En réplicas individuales: IC 95 % de Poisson de cada recuento. En promedios: ± 1 DE de la OD y del log₁₀ UFC entre réplicas." />} checked={barras} onChange={setBarras}
          ayuda={o.modo === 'promedio' ? '± 1 DE (OD y log₁₀ UFC)' : 'IC 95 % de Poisson del recuento'} />
        <h3><Et texto="Rango de tiempo del ajuste" ayuda="Solo los puntos tomados entre estos tiempos entran en la ecuación (los demás se ven con una ✕). Lo usual es usar la fase exponencial; en Crecimiento se aplica con un clic." /></h3>
        {separadas && Object.keys(o.rangosCepa || {}).some((m) => cepas.includes(m)) && (
          <div className="aviso-sel" style={{ marginBottom: 6 }}>
            Por cepa (desde Crecimiento): {Object.entries(o.rangosCepa).filter(([m]) => cepas.includes(m)).map(([m, r]) => `${m} ${r[0]}–${r[1]} ${u}`).join(' · ')}.{' '}
            <button className="enlace" onClick={() => s.setOpt('rangosCepa', {})}>Quitar</button>
            <br /><small>Las cepas sin rango propio usan el general de abajo.</small>
          </div>
        )}
        <div className="fila-ctrl">
          <Campo label={`Desde (${u})`}><input value={o.tMin} placeholder="sin límite" onChange={(e) => s.setOpt('tMin', e.target.value)} /></Campo>
          <Campo label={`Hasta (${u})`}><input value={o.tMax} placeholder="sin límite" onChange={(e) => s.setOpt('tMax', e.target.value)} /></Campo>
        </div>
        <p className="nota">Lo usual es construir la ecuación solo con la fase exponencial. En la pestaña <button className="enlace" onClick={() => s.irA('crecimiento')}>Crecimiento</button> se detecta y se puede aplicar acá con un clic.</p>
        <h3><Et texto="Rango de OD del ajuste" ayuda="Solo los puntos con OD entre estos valores entran en la ecuación. Sirve para quedarse con el tramo lineal." /></h3>
        <div className="fila-ctrl">
          <Campo label="OD mínima"><input value={o.odMin} placeholder="sin límite" onChange={(e) => s.setOpt('odMin', e.target.value)} /></Campo>
          <Campo label="OD máxima"><input value={o.odMax} placeholder="sin límite" onChange={(e) => s.setOpt('odMax', e.target.value)} /></Campo>
        </div>
        <Check label={<Et texto="Usar recuentos estimados" ayuda="Incluye los recuentos de réplicas sin ninguna placa dentro del rango contable (se usó la más cercana). Son menos confiables; por defecto quedan afuera." />} checked={o.incluirEstimados} onChange={(v) => s.setOpt('incluirEstimados', v)} ayuda="Placas fuera del rango contable" />
        <p className="nota">Clic en un punto del gráfico para sacarlo o volver a ponerlo en el ajuste.</p>
        <BotonTip className="ancho" disabled={!o.excluidos.length} onClick={() => s.setOpt('excluidos', [])} titulo="Volver a incluir todos"
          ayuda="Vuelve a poner en el ajuste los puntos que sacaste con un clic en el gráfico.">Volver a incluir todos ({o.excluidos.length})</BotonTip>
        <BotonTip className="ancho" onClick={exportar} disabled={!todos.length} titulo="Descargar resultados"
          ayuda="Excel con los puntos (y si entran en el ajuste), la comparación de modelos, los parámetros de la cepa del detalle y las condiciones del experimento.">Descargar resultados (Excel)</BotonTip>
        <p className="nota">{usados.length} puntos en el ajuste de {todos.length}.</p>
      </aside>
      <div className="principal">
        {!todos.length ? (
          <div className="vacio">No hay pares OD–UFC todavía. Necesitás recuentos (pestaña <button className="enlace" onClick={() => s.irA('datos')}>C</button>) y lecturas de OD (pestaña <button className="enlace" onClick={() => s.irA('od')}>OD</button>) para las mismas muestras.</div>
        ) : (
          <>
            <PanelGrafico estilo={s.estilos.curva} setEstilo={s.setEstilo('curva')} nombre={`curva_${o.modelo}`} alto={460}
              puntos={puntos} curvas={curvas} bandas={bandas} leyenda={leyenda} onClickPunto={alternar} nota={s.nota}
              anotacion={!o.mostrarEcuacion ? [] : separadas
                ? porCepa.filter((c) => c.aj).map((c) => `${c.muestra}: ${(c.aj.M.ecuacionCorta || c.aj.M.ecuacion)(c.aj.f.beta)} · R² = ${c.aj.f.r2.toFixed(3)}`)
                : ok ? [aj.M.ecuacionCorta ? aj.M.ecuacionCorta(aj.f.beta) : aj.M.ecuacion(aj.f.beta), `R² = ${aj.f.r2.toFixed(4)} · n = ${aj.f.n}`] : []}
              ejeX={{ titulo: ejeOD2, log: o.escalaX === 'log', cero: o.escalaX !== 'log' }}
              ejeY={ejeUFC(o)} />
            {cepas.length > 1 && <CurvasPorCepa s={s} porCepa={porCepa} cmp={cmpCepas} colM={colM} separadas={separadas} />}
            {aj?.error && <p className="banner">{separadas ? `${detalle}: ` : ''}{aj.error}</p>}
            {ok && <Resultados aj={aj} s={s} cepa={separadas ? detalle : null} />}
            {comparacion.length > 0 && (
              <section style={{ marginTop: 22 }}>
                <h3>Comparación de modelos{separadas ? ` · ${detalle}` : ''}</h3>
                <div className="tabla-scroll chica">
                  <table className="tabla">
                    <thead><tr><th>Modelo</th><th><Ayuda clave="n">n</Ayuda></th><th><Ayuda clave="r2">R² (propia escala)</Ayuda></th><th><Ayuda clave="rmse">RMSE log₁₀</Ayuda></th><th><Ayuda clave="errRel">Error relativo medio</Ayuda></th><th><Ayuda clave="aicc">AICc</Ayuda></th><th><Ayuda clave="aicc">ΔAICc</Ayuda></th><th /></tr></thead>
                    <tbody>
                      {comparacion.map(([m, a]) => (
                        <tr key={m} className={m === o.modelo ? 'fila-activa' : ''}>
                          <td><b>{MODELOS[m].corto}</b></td><td>{a.f.n}</td><td>{a.f.r2.toFixed(4)}</td><td>{a.rmseLog.toFixed(3)}</td>
                          <td>{a.mape.toFixed(1)} %</td><td>{finito(a.aicc) ? a.aicc.toFixed(1) : '–'}</td>
                          <td>{finito(a.aicc) ? (a.aicc - mejorAic).toFixed(1) : '–'}{a.aicc === mejorAic ? ' ★' : ''}</td>
                          <td>{m !== o.modelo && <BotonTip className="chico" onClick={() => s.setOpt('modelo', m)} titulo={`Usar ${MODELOS[m].corto}`} ayuda="Cambia el modelo de la curva a este (para todas las cepas).">Usar</BotonTip>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="nota">Para comparar modelos ajustados en escalas distintas, RMSE y AICc se calculan con los residuos en log₁₀(UFC/mL), la escala en la que el error de un recuento es aproximadamente constante.
                  Menor AICc = mejor equilibrio entre ajuste y número de parámetros; ΔAICc &lt; 2 se considera equivalente. No elijas solo por el número: mirá también los residuos.</p>
              </section>
            )}
            {ok && <Interpretacion ajustes={ajustes} aj={aj} usados={usados} lin={lin} o={o} />}
            {ok && <Residuos s={s} aj={aj} colorDe={colorDe} nombreDe={nombreDe} ejeOD={ejeOD2} />}
            {ok && <Calculadora aj={aj} xmin={xmin} xmax={xmax} onda={onda} corregida={o.puntos !== 'dilucion'} cepa={separadas ? detalle : null} />}
          </>
        )}
      </div>
    </div>
  )
}

function Resultados({ aj, s, cepa }) {
  const { f, M } = aj
  return (
    <section style={{ marginTop: 18 }}>
      <h3 className="normal">Ajuste{cepa ? ` de ${cepa}` : ''}: {M.nombre}</h3>
      <div className="ecuacion">{M.ecuacion(f.beta)}</div>
      <div className="tabla-scroll chica">
        <table className="tabla">
          <thead><tr><th>Parámetro</th><th><Ayuda clave="estimacion">Estimación</Ayuda></th><th><Ayuda clave="ee">Error estándar</Ayuda></th><th><Ayuda clave="ee">IC 95 %</Ayuda></th><th><Ayuda clave="pvalor">t</Ayuda></th><th><Ayuda clave="pvalor">p</Ayuda></th></tr></thead>
          <tbody>
            {M.params.map((nm, i) => (
              <tr key={nm}><td>{nm}</td><td><b>{num(f.beta[i])}</b></td><td>{num(f.se[i])}</td><td>{num(f.ic[i][0])} a {num(f.ic[i][1])}</td><td>{f.t[i].toFixed(2)}</td><td>{fmtP(f.p[i]).replace('= ', '')}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="fila-ctrl" style={{ gap: 24 }}>
        <span>n = <b>{f.n}</b></span>
        <span>R² = <b>{f.r2.toFixed(4)}</b></span>
        <span>R² ajustado = <b>{f.r2aj.toFixed(4)}</b></span>
        <span title="Desvío estándar de los residuos">σ residual = <b>{M.escala === 'lin'
          ? (s.opts.ponderacion === 'relativa' ? `${(100 * f.sigma).toFixed(1)} % (relativo)` : `${cient(f.sigma)} UFC/mL`)
          : `${f.sigma.toFixed(3)} log₁₀ (×${(10 ** f.sigma).toFixed(2)})`}</b></span>
        <span>gl = {f.gl}</span>
      </div>
      {M.escala === 'lin' && s.opts.ponderacion === 'relativa' && <p className="nota">Con pesos 1/UFC², el R² se calcula sobre los datos ponderados (como <code>lm(weights = 1/y^2)</code> de R) y no es comparable con el de un ajuste sin ponderar.</p>}
    </section>
  )
}

function Interpretacion({ ajustes, aj, usados, lin, o }) {
  const items = interpretar(ajustes, aj, usados, lin, o)
  return (
    <section style={{ marginTop: 22 }}>
      <h3>Interpretación</h3>
      <ul className="interp">{items.map(([t, txt], i) => <li key={i} className={t}>{t === 'ok' ? '✓ ' : '⚠ '}{txt}</li>)}</ul>
    </section>
  )
}

function Residuos({ s, aj, colorDe, nombreDe, ejeOD }) {
  const puntos = aj.pts.map((p, i) => ({ key: p.key, x: p.x, y: aj.resGraf[i], color: colorDe(p), forma: p.tipo === 'promedio' ? 'cuadrado' : 'circulo', r: 4.5,
    titulo: `${nombreDe(p)}: residuo ${aj.resGraf[i].toPrecision(3)}` }))
  const lim = Math.max(...aj.resGraf.map(Math.abs).filter(finito), 1e-9) * 1.15
  return (
    <section style={{ marginTop: 22 }}>
      <h3>Residuos</h3>
      <p className="nota" style={{ marginTop: 0 }}>Deben repartirse al azar alrededor de 0. Una forma de U o de arco indica que el modelo no sigue la curvatura; un abanico que se abre indica que la ponderación no es la adecuada.</p>
      <PanelGrafico estilo={s.estilos.residuos} setEstilo={s.setEstilo('residuos')} nombre="residuos" alto={260}
        puntos={puntos} rangoY={[-lim, lim]} lineasH={[{ y: 0, color: '#3a2a1e', dash: '4 3' }]}
        ejeX={{ titulo: ejeOD, log: s.opts.escalaX === 'log', cero: s.opts.escalaX !== 'log' }} ejeY={{ titulo: aj.escalaRes }} />
    </section>
  )
}

function Calculadora({ aj, xmin, xmax, onda, corregida, cepa }) {
  const [od, setOd] = useState('0.5')
  const [fac, setFac] = useState('1')
  const [ufc, setUfc] = useState('1e8')
  const xLeida = Number(String(od).replace(',', '.'))
  const Fl = leerFactor(fac)
  // con OD corregida la curva espera la OD llevada a la muestra sin diluir (lectura × F);
  // con puntos por dilución la curva da la UFC/mL de la dilución leída, que se multiplica por F
  const x = corregida ? xLeida * Fl : xLeida
  const F = corregida ? 1 : Fl
  const b = finito(x) ? aj.banda(x) : null
  const fuera = finito(x) && (x < xmin || x > xmax)
  const objetivo = Number(String(ufc).replace(',', '.'))
  const xo = odParaUFC(aj, objetivo, xmax)
  return (
    <section style={{ marginTop: 22 }}>
      <h3>Calculadora{cepa ? ` · curva de ${cepa}` : ''}</h3>
      <div className="calc">
        <div className="tarjeta">
          <h4>OD → UFC/mL</h4>
          <div className="fila-ctrl">
            <Campo label={`OD${onda} neta medida`}><input value={od} onChange={(e) => setOd(e.target.value)} /></Campo>
            <Campo label="Dilución en que se leyó (1:F)"><input value={fac} onChange={(e) => setFac(e.target.value)} /></Campo>
          </div>
          {b && finito(F) ? (
            <>
              <div className="res-calc"><Calc d={dPrediccion(aj, x, Fl, corregida, xLeida)}>{cient(b.y * F)} UFC/mL</Calc></div>
              <p className="nota">IC 95 % de la media: {cient(Math.max(0, b.c[0]) * F, 1)} – {cient(b.c[1] * F, 1)}<br />
                Predicción 95 % (una muestra nueva): {cient(Math.max(0, b.p[0]) * F, 1)} – {cient(b.p[1] * F, 1)}
                {Fl !== 1 && (corregida ? <><br />OD corregida usada: {xLeida} × {Fl} = {x.toFixed(3)}.</> : <><br />Ya multiplicado por {Fl} (la dilución en que se leyó).</>)}</p>
              {fuera && <p className="aviso-sel">Fuera del rango calibrado (OD {xmin.toFixed(3)} a {xmax.toFixed(3)}): es una extrapolación y puede ser muy errónea.</p>}
            </>
          ) : <p className="nota">Ingresá una OD válida{aj.M.escala === 'loglog' ? ' (mayor que 0)' : ''}.</p>}
        </div>
        <div className="tarjeta">
          <h4>UFC/mL → OD</h4>
          <Campo label="UFC/mL deseadas (ej.: 1e8 o 100000000)"><input value={ufc} onChange={(e) => setUfc(e.target.value)} /></Campo>
          {finito(xo) ? (
            <>
              <div className="res-calc">OD{onda}{corregida ? ' corregida' : ''} ≈ {xo.toFixed(3)}</div>
              <p className="nota">OD a la que hay que llevar la suspensión para tener esa concentración, según la curva.</p>
              {(xo < xmin || xo > xmax) && <p className="aviso-sel">Fuera del rango calibrado: conviene preparar una suspensión más concentrada (o más diluida) dentro del rango y diluirla.</p>}
            </>
          ) : <p className="nota">{objetivo > 0 ? 'La curva no alcanza ese valor en el rango de OD razonable.' : 'Ingresá un valor positivo.'}</p>}
        </div>
      </div>
    </section>
  )
}

// Una ecuación por cepa y la prueba de si hacen falta curvas distintas
function CurvasPorCepa({ s, porCepa, cmp, colM, separadas }) {
  const o = s.opts
  return (
    <section style={{ marginTop: 18 }}>
      <h3 className="normal">Curva de cada cepa</h3>
      <div className="tabla-scroll chica">
        <table className="tabla">
          <thead><tr><th>Cepa</th><th><Ayuda clave="n">n</Ayuda></th><th><Ayuda clave="ecuacion">Ecuación ({MODELOS[o.modelo].corto})</Ayuda></th><th><Ayuda clave="r2">R²</Ayuda></th><th><Ayuda clave="rangoOD">Rango de OD</Ayuda></th><th /></tr></thead>
          <tbody>
            {porCepa.map((c) => (
              <tr key={c.muestra} className={separadas && c.muestra === s.curva.detalle ? 'fila-activa' : ''}>
                <td><i className="punto-placa" style={{ background: colM[c.muestra] }} /> <b>{c.muestra || '(sin nombre)'}</b></td>
                <td>{c.n}</td>
                {c.aj ? <>
                  <td><code>{c.aj.M.ecuacion(c.aj.f.beta)}</code></td>
                  <td>{c.aj.f.r2.toFixed(4)}</td>
                  <td>{c.xmin.toFixed(3)} – {c.xmax.toFixed(3)}</td>
                </> : <td colSpan={3} className="ayuda">{c.error}</td>}
                <td>{separadas && c.aj && c.muestra !== s.curva.detalle && <BotonTip className="chico" onClick={() => s.setOpt('cepaDetalle', c.muestra)} titulo="Ver detalle" ayuda="Muestra abajo los parámetros, residuos y calculadora de esta cepa.">Ver detalle</BotonTip>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cmp ? (
        <p className={cmp.p < 0.05 ? (separadas ? 'interp-ok' : 'aviso-sel') : 'nota'} style={{ marginTop: 8 }}>
          <b>¿Hace falta una curva por cepa?</b> Prueba F (curva común frente a una por cepa, modelo {MODELOS[o.modelo].corto}):
          F({cmp.d1}, {cmp.d2}) = {cmp.F.toFixed(2)}, p {fmtP(cmp.p)}.{' '}
          {cmp.p < 0.05
            ? <>Las cepas <b>difieren</b>: la relación OD ↔ UFC no es la misma, así que cada cepa necesita su propia curva{separadas ? ' (es lo que se está usando).' : '. Conviene elegir «Una por cepa».'}</>
            : <>No hay evidencia de que las cepas difieran: {separadas ? 'se podría usar una curva común a todas (más puntos, intervalos más estrechos).' : 'la curva común es adecuada.'} Con pocos puntos la prueba tiene poca potencia.</>}
        </p>
      ) : <p className="nota">Para comparar las cepas hace falta que al menos dos tengan curva propia.</p>}
    </section>
  )
}
