import { useMemo, useState } from 'react'
import { Campo, Check, Select } from './ui.jsx'
import { PanelGrafico } from './panelGrafico.jsx'
import { ModoSel } from './tabla.jsx'
import { ondaDe } from './od.jsx'
import { ajustar, datosCurva, interpretar, MODELOS, odParaUFC } from '../calibracion.js'
import { cient, fmtP, leerFactor, nombreRep } from '../ufc.js'
import { finito } from '../estadistica.js'
import { paletaMuestras } from '../utils.js'
import { excelDe } from '../excel.js'
import { descargarBlob } from '../utils.js'

const num = (x, d = 4) => (finito(x) ? (Math.abs(x) >= 1e4 || (Math.abs(x) < 1e-3 && x !== 0) ? cient(x, 3) : x.toPrecision(d)) : '–')

export function CurvaTab({ s }) {
  const o = s.opts
  const onda = ondaDe(o)
  const ejeOD = `OD${onda ? ' a ' + onda + ' nm' : ''}`
  const { todos, usados } = useMemo(() => datosCurva(s.corr, o), [s.corr, o])
  const ajustes = useMemo(() => Object.fromEntries(Object.keys(MODELOS).map((m) => [m, ajustar(usados, m, o.ponderacion)])), [usados, o.ponderacion])
  const aj = ajustes[o.modelo]
  const ok = aj && !aj.error
  const colores = paletaMuestras(s.corr.muestras)
  const [barras, setBarras] = useState(true)

  const alternar = (p) => {
    const ex = o.excluidos.includes(p.key) ? o.excluidos.filter((k) => k !== p.key) : [...o.excluidos, p.key]
    s.setOpt('excluidos', ex)
  }

  // curva y bandas sobre el rango de OD de los puntos usados
  const xs = usados.map((p) => p.x).filter((x) => x > 0)
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
      key: p.key, x: p.x, y: p.y, color: colores[p.muestra], excluido: !p.usado, forma: prom ? 'cuadrado' : 'circulo', yErr, xErr,
      titulo: `${prom ? p.muestra + ' (promedio)' : nombreRep(p.muestra, p.rep)}\nOD = ${p.x.toFixed(3)} · ${cient(p.y)} UFC/mL${p.usado ? '' : '\nFuera del ajuste: ' + p.motivo}\nClic para ${p.usado ? 'excluir' : 'incluir'}`,
    }
  })
  const leyenda = [
    ...s.corr.muestras.filter((m) => todos.some((p) => p.muestra === m)).slice(0, 14).map((m) => ({ texto: m || '(sin nombre)', color: colores[m] })),
    ...(ok ? [{ texto: MODELOS[o.modelo].corto, color: '#3a2a1e', linea: true }] : []),
    ...(ok && o.bandaC ? [{ texto: 'IC 95 % curva', color: '#d9731f', banda: true, opacidad: 0.3 }] : []),
    ...(ok && o.bandaP ? [{ texto: 'Predicción 95 %', color: '#8a7765', linea: true, dash: '4 4' }] : []),
  ]
  const bandas = ok && o.bandaC ? [{ sup: curvaPts.map(([x, b]) => [x, b.c[1]]), inf: curvaPts.map(([x, b]) => [x, b.c[0]]), color: '#d9731f', opacidad: 0.18 }] : []
  const curvas = ok ? [
    { pts: curvaPts.map(([x, b]) => [x, b.y]), color: '#3a2a1e', ancho: 2.2 },
    ...(o.bandaP ? [{ pts: curvaPts.map(([x, b]) => [x, b.p[0]]), color: '#8a7765', dash: '4 4', ancho: 1.2 }, { pts: curvaPts.map(([x, b]) => [x, b.p[1]]), color: '#8a7765', dash: '4 4', ancho: 1.2 }] : []),
  ] : []

  const comparacion = Object.entries(ajustes).filter(([, a]) => !a.error)
  const mejorAic = Math.min(...comparacion.map(([, a]) => a.aicc).filter(finito))

  const exportar = () => {
    const hojas = [{
      nombre: 'Puntos', columnas: ['Muestra', 'Réplica', 'Tipo', 'OD', 'UFC/mL', 'En el ajuste', 'Motivo', 'UFC/mL ajustado', 'Residuo log10'],
      filas: todos.map((p) => ({ Muestra: p.muestra, Réplica: p.rep ?? '', Tipo: p.tipo, OD: p.x, 'UFC/mL': p.y, 'En el ajuste': p.usado ? 'Sí' : 'No', Motivo: p.motivo,
        'UFC/mL ajustado': ok ? aj.pred(p.x) : null, 'Residuo log10': ok && aj.pred(p.x) > 0 ? Math.log10(p.y / aj.pred(p.x)) : null })),
    }, {
      nombre: 'Modelos', columnas: ['Modelo', 'Ecuación', 'n', 'R2', 'R2 ajustado', 'RMSE log10', 'AICc', 'Error relativo medio %'],
      filas: comparacion.map(([m, a]) => ({ Modelo: MODELOS[m].nombre, Ecuación: MODELOS[m].ecuacion(a.f.beta), n: a.f.n, R2: a.f.r2, 'R2 ajustado': a.f.r2aj, 'RMSE log10': a.rmseLog, AICc: a.aicc, 'Error relativo medio %': a.mape })),
    }]
    if (ok) hojas.push({
      nombre: 'Parámetros', columnas: ['Parámetro', 'Estimación', 'Error estándar', 'IC95 inf', 'IC95 sup', 't', 'p'],
      filas: aj.M.params.map((nm, i) => ({ Parámetro: nm, Estimación: aj.f.beta[i], 'Error estándar': aj.f.se[i], 'IC95 inf': aj.f.ic[i][0], 'IC95 sup': aj.f.ic[i][1], t: aj.f.t[i], p: aj.f.p[i] })),
    })
    excelDe(hojas).then((b) => descargarBlob(b, `curva_${o.modelo}.xlsx`))
  }

  return (
    <div className="con-lateral">
      <aside className="lateral">
        <h2>Curva de calibración</h2>
        <Campo label="Puntos"><ModoSel s={s} /></Campo>
        <Campo label="Modelo">
          <Select value={o.modelo} onChange={(v) => s.setOpt('modelo', v)} opciones={Object.entries(MODELOS).map(([k, m]) => [k, m.nombre])} />
        </Campo>
        {MODELOS[o.modelo].escala === 'lin' && (
          <Campo label="Ponderación">
            <Select value={o.ponderacion} onChange={(v) => s.setOpt('ponderacion', v)}
              opciones={[['relativa', 'Error proporcional (pesos 1/UFC²)'], ['ninguna', 'Sin ponderar (mínimos cuadrados)']]} />
          </Campo>
        )}
        <p className="nota">{MODELOS[o.modelo].escala === 'lin'
          ? (o.ponderacion === 'relativa' ? 'Recomendado: el error de un recuento es proporcional a su valor, así que cada punto pesa según su error relativo.' : 'Sin ponderar, los puntos de UFC alta dominan el ajuste.')
          : 'Ajuste por mínimos cuadrados sobre log₁₀(UFC/mL): ya supone error proporcional.'}</p>
        <div className="fila-ctrl">
          <Campo label="Eje Y"><Select value={o.escalaY} onChange={(v) => s.setOpt('escalaY', v)} opciones={[['log', 'Log'], ['lin', 'Lineal']]} /></Campo>
          <Campo label="Eje X"><Select value={o.escalaX} onChange={(v) => s.setOpt('escalaX', v)} opciones={[['lin', 'Lineal'], ['log', 'Log']]} /></Campo>
        </div>
        <Check label="Banda de confianza 95 % (de la curva)" checked={o.bandaC} onChange={(v) => s.setOpt('bandaC', v)} />
        <Check label="Banda de predicción 95 % (de una medición nueva)" checked={o.bandaP} onChange={(v) => s.setOpt('bandaP', v)} />
        <Check label="Barras de error en los puntos" checked={barras} onChange={setBarras}
          ayuda={o.modo === 'promedio' ? '± 1 DE (OD y log₁₀ UFC)' : 'IC 95 % de Poisson del recuento'} />
        <h3>Rango de OD del ajuste</h3>
        <div className="fila-ctrl">
          <Campo label="OD mínima"><input value={o.odMin} placeholder="sin límite" onChange={(e) => s.setOpt('odMin', e.target.value)} /></Campo>
          <Campo label="OD máxima"><input value={o.odMax} placeholder="sin límite" onChange={(e) => s.setOpt('odMax', e.target.value)} /></Campo>
        </div>
        <Check label="Usar recuentos estimados" checked={o.incluirEstimados} onChange={(v) => s.setOpt('incluirEstimados', v)} ayuda="Placas fuera del rango contable" />
        <p className="nota">Clic en un punto del gráfico para sacarlo o volver a ponerlo en el ajuste.</p>
        <button className="ancho" disabled={!o.excluidos.length} onClick={() => s.setOpt('excluidos', [])}>Volver a incluir todos ({o.excluidos.length})</button>
        <button className="ancho" onClick={exportar} disabled={!todos.length}>Descargar resultados (Excel)</button>
        <p className="nota">{usados.length} puntos en el ajuste de {todos.length}.</p>
      </aside>
      <div className="principal">
        {!todos.length ? (
          <div className="vacio">No hay pares OD–UFC todavía. Necesitás recuentos (pestaña <button className="enlace" onClick={() => s.irA('datos')}>Datos</button>) y lecturas de OD (pestaña <button className="enlace" onClick={() => s.irA('od')}>OD</button>) para las mismas muestras.</div>
        ) : (
          <>
            <PanelGrafico estilo={s.estilos.curva} setEstilo={s.setEstilo('curva')} nombre={`curva_${o.modelo}`} alto={460}
              puntos={puntos} curvas={curvas} bandas={bandas} leyenda={leyenda} onClickPunto={alternar}
              ejeX={{ titulo: ejeOD, log: o.escalaX === 'log', cero: o.escalaX !== 'log' }}
              ejeY={{ titulo: 'UFC/mL', log: o.escalaY === 'log', cero: o.escalaY !== 'log' }} />
            {aj?.error && <p className="banner">{aj.error}</p>}
            {ok && <Resultados aj={aj} s={s} />}
            {comparacion.length > 0 && (
              <section style={{ marginTop: 22 }}>
                <h3>Comparación de modelos</h3>
                <div className="tabla-scroll chica">
                  <table className="tabla">
                    <thead><tr><th>Modelo</th><th>n</th><th>R² (propia escala)</th><th>RMSE log₁₀</th><th>Error relativo medio</th><th>AICc</th><th>ΔAICc</th><th /></tr></thead>
                    <tbody>
                      {comparacion.map(([m, a]) => (
                        <tr key={m} className={m === o.modelo ? 'fila-activa' : ''}>
                          <td><b>{MODELOS[m].corto}</b></td><td>{a.f.n}</td><td>{a.f.r2.toFixed(4)}</td><td>{a.rmseLog.toFixed(3)}</td>
                          <td>{a.mape.toFixed(1)} %</td><td>{finito(a.aicc) ? a.aicc.toFixed(1) : '–'}</td>
                          <td>{finito(a.aicc) ? (a.aicc - mejorAic).toFixed(1) : '–'}{a.aicc === mejorAic ? ' ★' : ''}</td>
                          <td>{m !== o.modelo && <button className="chico" onClick={() => s.setOpt('modelo', m)}>Usar</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="nota">Para comparar modelos ajustados en escalas distintas, RMSE y AICc se calculan con los residuos en log₁₀(UFC/mL), la escala en la que el error de un recuento es aproximadamente constante.
                  Menor AICc = mejor equilibrio entre ajuste y número de parámetros; ΔAICc &lt; 2 se considera equivalente. No elijas solo por el número: mirá también los residuos.</p>
              </section>
            )}
            {ok && <Interpretacion ajustes={ajustes} aj={aj} usados={usados} />}
            {ok && <Residuos s={s} aj={aj} colores={colores} ejeOD={ejeOD} />}
            {ok && <Calculadora aj={aj} xmin={xmin} xmax={xmax} onda={onda} />}
          </>
        )}
      </div>
    </div>
  )
}

function Resultados({ aj, s }) {
  const { f, M } = aj
  return (
    <section style={{ marginTop: 18 }}>
      <h3 className="normal">Ajuste: {M.nombre}</h3>
      <div className="ecuacion">{M.ecuacion(f.beta)}</div>
      <div className="tabla-scroll chica">
        <table className="tabla">
          <thead><tr><th>Parámetro</th><th>Estimación</th><th>Error estándar</th><th>IC 95 %</th><th>t</th><th>p</th></tr></thead>
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

function Interpretacion({ ajustes, aj, usados }) {
  const items = interpretar(ajustes, aj, usados)
  return (
    <section style={{ marginTop: 22 }}>
      <h3>Interpretación</h3>
      <ul className="interp">{items.map(([t, txt], i) => <li key={i} className={t}>{t === 'ok' ? '✓ ' : '⚠ '}{txt}</li>)}</ul>
    </section>
  )
}

function Residuos({ s, aj, colores, ejeOD }) {
  const puntos = aj.pts.map((p, i) => ({ key: p.key, x: p.x, y: aj.resGraf[i], color: colores[p.muestra], forma: p.tipo === 'promedio' ? 'cuadrado' : 'circulo', r: 4.5,
    titulo: `${p.tipo === 'promedio' ? p.muestra : nombreRep(p.muestra, p.rep)}: residuo ${aj.resGraf[i].toPrecision(3)}` }))
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

function Calculadora({ aj, xmin, xmax, onda }) {
  const [od, setOd] = useState('0.5')
  const [fac, setFac] = useState('1')
  const [ufc, setUfc] = useState('1e8')
  const x = Number(String(od).replace(',', '.'))
  const F = leerFactor(fac)
  const b = finito(x) ? aj.banda(x) : null
  const fuera = finito(x) && (x < xmin || x > xmax)
  const objetivo = Number(String(ufc).replace(',', '.'))
  const xo = odParaUFC(aj, objetivo, xmax)
  return (
    <section style={{ marginTop: 22 }}>
      <h3>Calculadora</h3>
      <div className="calc">
        <div className="tarjeta">
          <h4>OD → UFC/mL</h4>
          <div className="fila-ctrl">
            <Campo label={`OD${onda} neta medida`}><input value={od} onChange={(e) => setOd(e.target.value)} /></Campo>
            <Campo label="Dilución de la lectura (1:F)"><input value={fac} onChange={(e) => setFac(e.target.value)} /></Campo>
          </div>
          {b && finito(F) ? (
            <>
              <div className="res-calc">{cient(b.y * F)} UFC/mL</div>
              <p className="nota">IC 95 % de la media: {cient(Math.max(0, b.c[0]) * F, 1)} – {cient(b.c[1] * F, 1)}<br />
                Predicción 95 % (una muestra nueva): {cient(Math.max(0, b.p[0]) * F, 1)} – {cient(b.p[1] * F, 1)}
                {F !== 1 && <><br />Ya multiplicado por {F} (la dilución en que se leyó).</>}</p>
              {fuera && <p className="aviso-sel">Fuera del rango calibrado (OD {xmin.toFixed(3)} a {xmax.toFixed(3)}): es una extrapolación y puede ser muy errónea.</p>}
            </>
          ) : <p className="nota">Ingresá una OD válida{aj.M.escala === 'loglog' ? ' (mayor que 0)' : ''}.</p>}
        </div>
        <div className="tarjeta">
          <h4>UFC/mL → OD</h4>
          <Campo label="UFC/mL deseadas (ej.: 1e8 o 100000000)"><input value={ufc} onChange={(e) => setUfc(e.target.value)} /></Campo>
          {finito(xo) ? (
            <>
              <div className="res-calc">OD{onda} ≈ {xo.toFixed(3)}</div>
              <p className="nota">OD a la que hay que llevar la suspensión para tener esa concentración, según la curva.</p>
              {(xo < xmin || xo > xmax) && <p className="aviso-sel">Fuera del rango calibrado: conviene preparar una suspensión más concentrada (o más diluida) dentro del rango y diluirla.</p>}
            </>
          ) : <p className="nota">{objetivo > 0 ? 'La curva no alcanza ese valor en el rango de OD razonable.' : 'Ingresá un valor positivo.'}</p>}
        </div>
      </div>
    </section>
  )
}
