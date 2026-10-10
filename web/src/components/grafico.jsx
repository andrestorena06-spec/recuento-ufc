import { forwardRef, useEffect, useRef, useState } from 'react'
import { estiloTexto, medir, ticksBonitos } from '../utils.js'
import { sup } from '../ufc.js'

export function useAncho() {
  const ref = useRef(null)
  const [w, setW] = useState(820)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver((es) => setW(Math.max(360, Math.floor(es[0].contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

const fin = Number.isFinite

// Etiquetas de los ejes: 10⁸ (log) o 2×10⁸ / 0.25 (lineal)
function etiquetaTick(v, sc) {
  if (sc.exp) { const e = Math.log10(v); return Number(e.toFixed(1)).toString() }
  if (sc.log) return `10${sup(Math.round(Math.log10(v)))}`
  if (v === 0) return '0'
  const a = Math.abs(v)
  if (a >= 1e4 || a < 1e-3) {
    const e = Math.floor(Math.log10(a))
    const m = v / 10 ** e
    const ms = Number(m.toPrecision(3)).toString()
    return ms === '1' ? `10${sup(e)}` : `${ms}×10${sup(e)}`
  }
  const dec = sc.paso >= 1 ? 0 : Math.min(6, Math.max(0, Math.ceil(-Math.log10(sc.paso) - 1e-9)))
  return v.toFixed(dec)
}

// Escala de un eje. eje: { log, exp (log con etiquetas = exponente: «log₁₀»), cero, categorias }
function escala(valores, eje = {}) {
  if (eje.categorias) {
    const n = eje.categorias.length
    return { min: -0.5, max: n - 0.5, ticks: eje.categorias.map((_, i) => i), log: false, cat: true }
  }
  const log = eje.log || eje.exp
  let v = valores.filter((x) => fin(x) && (!log || x > 0))
  if (!v.length) v = log ? [1, 10] : [0, 1]
  let lo = Math.min(...v), hi = Math.max(...v)
  if (log) {
    let a = Math.floor(Math.log10(lo)), b = Math.ceil(Math.log10(hi))
    if (a === b) { a -= 1; b += 1 }
    let ticks = []
    for (let e = a; e <= b; e++) ticks.push(10 ** e)
    if (eje.exp && b - a <= 2) ticks = Array.from({ length: (b - a) * 2 + 1 }, (_, i) => 10 ** (a + i / 2))
    // demasiadas décadas: una marca cada dos
    const paso = ticks.length > 9 ? 2 : 1
    return { min: 10 ** a, max: 10 ** b, ticks: ticks.filter((_, i) => i % paso === 0), log: true, exp: !!eje.exp }
  }
  if (eje.cero) lo = Math.min(0, lo)
  if (lo === hi) { lo -= Math.abs(lo) * 0.1 || 1; hi += Math.abs(hi) * 0.1 || 1 }
  const pad = (hi - lo) * 0.04
  const t = ticksBonitos(eje.cero && lo >= 0 ? 0 : lo - pad, hi + pad, 6)
  return { min: t.min, max: t.max, ticks: t.ticks, paso: t.paso, log: false }
}
const posicion = (sc, v) => (sc.log ? (Math.log10(v) - Math.log10(sc.min)) / (Math.log10(sc.max) - Math.log10(sc.min)) : (v - sc.min) / (sc.max - sc.min))

// Gráfico de dispersión/líneas en SVG.
// puntos: { x, y, color, eje (1|2), barra, anchoBarra, forma, hueco, excluido, xErr, yErr, r, titulo }
// curvas: { pts: [[x, y]], color, dash, ancho, eje }; bandas: { sup, inf, color, opacidad, eje }
// zonasX: { x1, x2, color, opacidad }; ejeY2: segundo eje Y a la derecha; anotacion: líneas de texto; nota: texto al pie
export const Grafico = forwardRef(function Grafico({
  puntos = [], curvas = [], bandas = [], ejeX, ejeY, ejeY2 = null, leyenda = [], est, tam = null, ancho = 820, alto = 430,
  onClickPunto, onContext, rangoX = null, rangoY = null, rangoY2 = null, lineasH = [], zonasX = [], anotacion = [], nota = '',
}, svgRef) {
  const W = tam ? tam.w : ancho
  const H = tam ? tam.h : alto
  const p1 = puntos.filter((p) => p.eje !== 2)
  const p2 = puntos.filter((p) => p.eje === 2)
  const sx = escala(rangoX || puntos.flatMap((p) => [p.x, ...(p.xErr || [])]), ejeX)
  const sy = escala(rangoY || p1.flatMap((p) => [p.y, ...(p.yErr || [])]), ejeY)
  const sy2 = ejeY2 ? escala(rangoY2 || p2.flatMap((p) => [p.y, ...(p.yErr || [])]), ejeY2) : null

  const lx = ejeX.categorias ? ejeX.categorias : sx.ticks.map((t) => etiquetaTick(t, sx))
  const ly = sy.ticks.map((t) => etiquetaTick(t, sy))
  const ly2 = sy2 ? sy2.ticks.map((t) => etiquetaTick(t, sy2)) : []
  const n = est.numeros
  const wTickY = Math.max(...ly.map((t) => medir(t, n.size, n.bold, n.italic)))
  const wTickY2 = sy2 ? Math.max(...ly2.map((t) => medir(t, n.size, n.bold, n.italic))) : 0
  const tituloY = est.leyendaY.texto || ejeY.titulo
  const tituloY2 = ejeY2?.titulo || ''
  const tituloX = est.leyendaX.texto || ejeX.titulo
  const titulo = est.titulo.texto
  const rot = ejeX.categorias && ejeX.categorias.some((c) => medir(c, n.size) > (W - 200) / Math.max(1, ejeX.categorias.length) - 6)
  const altoTickX = rot ? Math.max(...lx.map((t) => medir(t, n.size, n.bold, n.italic))) * 0.72 + n.size : n.size * 1.3
  const wLeyenda = leyenda.length ? Math.min(220, Math.max(...leyenda.map((l) => medir(l.texto, est.leyenda.size, est.leyenda.bold) + 30))) : 0
  const altoNota = nota ? 16 : 0

  const left = 12 + est.leyendaY.size * 1.3 + 10 + wTickY + 8
  const ejeDer = sy2 ? 8 + wTickY2 + 10 + est.leyendaY.size * 1.3 + 4 : 0
  const right = 18 + ejeDer + (wLeyenda ? wLeyenda + 14 : 0)
  const top = 14 + (titulo ? est.titulo.size * 1.5 + 8 : 0)
  const bottom = 10 + altoTickX + 10 + est.leyendaX.size * 1.5 + altoNota
  const pw = Math.max(80, W - left - right)
  const ph = Math.max(80, H - top - bottom)

  const fx = (v) => left + posicion(sx, v) * pw
  const fyDe = (sc) => (v) => top + ph - posicion(sc, v) * ph
  const fy1 = fyDe(sy)
  const fy2 = sy2 ? fyDe(sy2) : fy1
  const fyE = (eje) => (eje === 2 ? fy2 : fy1)
  const scE = (eje) => (eje === 2 && sy2 ? sy2 : sy)
  const ok = (x, y, eje = 1) => fin(x) && fin(y) && (!sx.log || x > 0) && (!scE(eje).log || y > 0)
  const camino = (pts, eje = 1) => {
    const fy = fyE(eje)
    let d = '', pen = false
    pts.forEach(([x, y]) => {
      if (!ok(x, y, eje)) { pen = false; return }
      const X = fx(x), Y = Math.max(top - 2000, Math.min(top + ph + 2000, fy(y)))
      d += `${pen ? 'L' : 'M'}${X.toFixed(2)},${Y.toFixed(2)}`
      pen = true
    })
    return d
  }
  const area = (s, i, eje = 1) => {
    const a = s.filter(([x, y]) => ok(x, y, eje)), b = i.filter(([x, y]) => ok(x, y, eje)).reverse()
    if (a.length < 2 || b.length < 2) return ''
    return camino(a, eje) + camino(b, eje).replace(/^M/, 'L') + 'Z'
  }
  const idClip = useRef('clip' + Math.random().toString(36).slice(2, 8)).current
  const anchoCat = sx.cat ? pw / Math.max(1, ejeX.categorias.length) : 24

  // marcas secundarias en escala log (2…9); no en el eje log₁₀ numérico
  const menores = []
  if (sy.log && !sy.exp) for (let e = Math.log10(sy.min); e < Math.log10(sy.max); e++) for (let k = 2; k < 10; k++) menores.push(k * 10 ** e)
  const menoresX = []
  if (sx.log) for (let e = Math.log10(sx.min); e < Math.log10(sx.max); e++) for (let k = 2; k < 10; k++) menoresX.push(k * 10 ** e)

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width={W} height={H} onContextMenu={onContext}
      style={{ fontFamily: "'Segoe UI', system-ui, Arial, sans-serif", background: '#fff' }}>
      <defs><clipPath id={idClip}><rect x={left} y={top} width={pw} height={ph} /></clipPath></defs>
      <rect x="0" y="0" width={W} height={H} fill="#fff" />
      {titulo && <text x={left + pw / 2} y={14 + est.titulo.size} textAnchor="middle" style={estiloTexto(est.titulo)}>{titulo}</text>}
      {/* rejilla */}
      {menores.map((t) => <line key={'my' + t} x1={left} x2={left + pw} y1={fy1(t)} y2={fy1(t)} stroke="#f3f4f6" />)}
      {menoresX.map((t) => <line key={'mx' + t} y1={top} y2={top + ph} x1={fx(t)} x2={fx(t)} stroke="#f3f4f6" />)}
      {sy.ticks.map((t, i) => (
        <g key={'y' + i}>
          <line x1={left} x2={left + pw} y1={fy1(t)} y2={fy1(t)} stroke="#e6e9ee" />
          <text x={left - 7} y={fy1(t)} textAnchor="end" dominantBaseline="central" style={estiloTexto(n)}>{ly[i]}</text>
        </g>
      ))}
      {sy2 && sy2.ticks.map((t, i) => (
        <g key={'y2' + i}>
          <line x1={left + pw} x2={left + pw + 4} y1={fy2(t)} y2={fy2(t)} stroke="#9aa5b1" />
          <text x={left + pw + 8} y={fy2(t)} textAnchor="start" dominantBaseline="central" style={estiloTexto(n)}>{ly2[i]}</text>
        </g>
      ))}
      {sx.ticks.map((t, i) => (
        <g key={'x' + i}>
          {!ejeX.categorias && <line y1={top} y2={top + ph} x1={fx(t)} x2={fx(t)} stroke="#eef0f3" />}
          {rot
            ? <text transform={`translate(${fx(t)},${top + ph + 8}) rotate(-40)`} textAnchor="end" dominantBaseline="hanging" style={estiloTexto(n)}>{lx[i]}</text>
            : <text x={fx(t)} y={top + ph + 8} textAnchor="middle" dominantBaseline="hanging" style={estiloTexto(n)}>{lx[i]}</text>}
        </g>
      ))}
      <rect x={left} y={top} width={pw} height={ph} fill="none" stroke="#9aa5b1" />
      <text transform={`translate(${12 + est.leyendaY.size * 0.5},${top + ph / 2}) rotate(-90)`} textAnchor="middle" dominantBaseline="central" style={estiloTexto(est.leyendaY)}>{tituloY}</text>
      {sy2 && <text transform={`translate(${left + pw + 8 + wTickY2 + 10 + est.leyendaY.size * 0.5},${top + ph / 2}) rotate(-90)`} textAnchor="middle" dominantBaseline="central" style={estiloTexto(est.leyendaY)}>{tituloY2}</text>}
      <text x={left + pw / 2} y={H - 8 - altoNota} textAnchor="middle" style={estiloTexto(est.leyendaX)}>{tituloX}</text>
      {nota && <text x={8} y={H - 5} style={{ fontSize: 10.5, fill: '#6b7785' }}>{nota}</text>}

      <g clipPath={`url(#${idClip})`}>
        {zonasX.map((z, i) => ok(z.x1, sy.log ? sy.min : 0) && ok(z.x2, sy.log ? sy.min : 0) && (
          <rect key={'z' + i} x={fx(z.x1)} y={top} width={Math.max(1, fx(z.x2) - fx(z.x1))} height={ph} fill={z.color} fillOpacity={z.opacidad ?? 0.1} />
        ))}
        {bandas.map((b, i) => <path key={'b' + i} d={area(b.sup, b.inf, b.eje)} fill={b.color} fillOpacity={b.opacidad ?? 0.15} stroke="none" />)}
        {puntos.filter((p) => p.barra).map((p, i) => {
          if (!ok(p.x, p.y, p.eje)) return null
          const sc = scE(p.eje), fy = fyE(p.eje)
          const base = sc.log ? sc.min : Math.max(sc.min, Math.min(sc.max, 0))
          const w = p.anchoBarra || anchoCat * 0.6
          const y0 = fy(base), y1 = fy(p.y)
          return <rect key={'bar' + i} x={fx(p.x) - w / 2} y={Math.min(y0, y1)} width={w} height={Math.abs(y0 - y1)} fill={p.color} fillOpacity="0.55" stroke={p.color} />
        })}
        {lineasH.map((l, i) => ok(sx.min, l.y) && <line key={'h' + i} x1={left} x2={left + pw} y1={fy1(l.y)} y2={fy1(l.y)} stroke={l.color} strokeDasharray={l.dash} />)}
        {curvas.map((c, i) => <path key={'c' + i} d={camino(c.pts, c.eje)} fill="none" stroke={c.color} strokeWidth={c.ancho || 2} strokeDasharray={c.dash} />)}
        {puntos.map((p, i) => {
          if (p.barra && !p.yErr) return null
          if (!ok(p.x, p.y, p.eje)) return null
          const fy = fyE(p.eje)
          const X = fx(p.x), Y = fy(p.y)
          const col = p.excluido ? '#9aa5b1' : p.color
          return (
            <g key={p.key ?? i} style={{ cursor: onClickPunto ? 'pointer' : 'default' }} onClick={() => onClickPunto && onClickPunto(p)}>
              {p.yErr && ok(p.x, p.yErr[0], p.eje) && ok(p.x, p.yErr[1], p.eje) && (
                <g stroke={p.barra ? '#3a2a1e' : col} strokeWidth="1.3">
                  <line x1={X} x2={X} y1={fy(p.yErr[0])} y2={fy(p.yErr[1])} />
                  <line x1={X - 4} x2={X + 4} y1={fy(p.yErr[0])} y2={fy(p.yErr[0])} />
                  <line x1={X - 4} x2={X + 4} y1={fy(p.yErr[1])} y2={fy(p.yErr[1])} />
                </g>
              )}
              {p.xErr && ok(p.xErr[0], p.y, p.eje) && ok(p.xErr[1], p.y, p.eje) && (
                <g stroke={col} strokeWidth="1.3">
                  <line y1={Y} y2={Y} x1={fx(p.xErr[0])} x2={fx(p.xErr[1])} />
                  <line y1={Y - 4} y2={Y + 4} x1={fx(p.xErr[0])} x2={fx(p.xErr[0])} />
                  <line y1={Y - 4} y2={Y + 4} x1={fx(p.xErr[1])} x2={fx(p.xErr[1])} />
                </g>
              )}
              {!p.barra && (p.forma === 'cuadrado'
                ? <rect x={X - (p.r || 5)} y={Y - (p.r || 5)} width={2 * (p.r || 5)} height={2 * (p.r || 5)} fill={p.hueco || p.excluido ? '#fff' : col} stroke={col} strokeWidth="1.6" />
                : <circle cx={X} cy={Y} r={p.r || 5} fill={p.hueco || p.excluido ? '#fff' : col} fillOpacity={p.hueco || p.excluido ? 1 : 0.85} stroke={col} strokeWidth="1.6" />)}
              {p.excluido && <path d={`M${X - 5},${Y - 5}L${X + 5},${Y + 5}M${X - 5},${Y + 5}L${X + 5},${Y - 5}`} stroke="#c0392b" strokeWidth="1.5" />}
              {p.titulo && <title>{p.titulo}</title>}
            </g>
          )
        })}
      </g>

      {anotacion.length > 0 && (() => {
        const sz = est.leyenda.size
        const w = Math.max(...anotacion.map((t) => medir(t, sz))) + 14
        return (
          <g transform={`translate(${left + 8},${top + 8})`}>
            <rect width={w} height={anotacion.length * sz * 1.45 + 8} rx="4" fill="#fff" fillOpacity="0.92" stroke="#e1d6c6" />
            {anotacion.map((t, i) => <text key={i} x="7" y={6 + sz * (i + 0.85) * 1.45} style={estiloTexto(est.leyenda)}>{t}</text>)}
          </g>
        )
      })()}

      {leyenda.length > 0 && (
        <g transform={`translate(${left + pw + ejeDer + 16},${top + 4})`}>
          {leyenda.map((l, i) => (
            <g key={i} transform={`translate(0,${i * est.leyenda.size * 1.55})`}>
              {l.linea
                ? <line x1="0" x2="16" y1={est.leyenda.size * 0.6} y2={est.leyenda.size * 0.6} stroke={l.color} strokeWidth="2.5" strokeDasharray={l.dash} />
                : l.banda
                  ? <rect x="0" y={est.leyenda.size * 0.1} width="16" height={est.leyenda.size} fill={l.color} fillOpacity={l.opacidad ?? 0.2} />
                  : l.forma === 'cuadrado'
                    ? <rect x="3" y={est.leyenda.size * 0.6 - 5} width="10" height="10" fill={l.hueco ? '#fff' : l.color} stroke={l.color} strokeWidth="1.6" />
                    : <circle cx="8" cy={est.leyenda.size * 0.6} r="5" fill={l.hueco ? '#fff' : l.color} stroke={l.color} strokeWidth="1.6" />}
              <text x="24" y={est.leyenda.size * 0.6} dominantBaseline="central" style={estiloTexto(est.leyenda)}>{l.texto}</text>
            </g>
          ))}
        </g>
      )}
    </svg>
  )
})
