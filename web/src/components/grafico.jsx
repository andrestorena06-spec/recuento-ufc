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
function etiquetaTick(v, log, paso) {
  if (log) return `10${sup(Math.round(Math.log10(v)))}`
  if (v === 0) return '0'
  const a = Math.abs(v)
  if (a >= 1e4 || a < 1e-3) {
    const e = Math.floor(Math.log10(a))
    const m = v / 10 ** e
    const ms = Number(m.toPrecision(3)).toString()
    return ms === '1' ? `10${sup(e)}` : `${ms}×10${sup(e)}`
  }
  const dec = paso >= 1 ? 0 : Math.min(6, Math.max(0, Math.ceil(-Math.log10(paso) - 1e-9)))
  return v.toFixed(dec)
}

function escala(valores, log, { incluirCero = false, categorias = null } = {}) {
  if (categorias) {
    const n = categorias.length
    return { min: -0.5, max: n - 0.5, ticks: categorias.map((_, i) => i), log: false, cat: true }
  }
  let v = valores.filter((x) => fin(x) && (!log || x > 0))
  if (!v.length) v = log ? [1, 10] : [0, 1]
  let lo = Math.min(...v), hi = Math.max(...v)
  if (log) {
    let a = Math.floor(Math.log10(lo)), b = Math.ceil(Math.log10(hi))
    if (a === b) { a -= 1; b += 1 }
    const ticks = []
    for (let e = a; e <= b; e++) ticks.push(10 ** e)
    // demasiadas décadas: una marca cada dos
    const paso = ticks.length > 9 ? 2 : 1
    return { min: 10 ** a, max: 10 ** b, ticks: ticks.filter((_, i) => i % paso === 0), log: true }
  }
  if (incluirCero) lo = Math.min(0, lo)
  if (lo === hi) { lo -= Math.abs(lo) * 0.1 || 1; hi += Math.abs(hi) * 0.1 || 1 }
  const pad = (hi - lo) * 0.04
  const t = ticksBonitos(incluirCero && lo >= 0 ? 0 : lo - pad, hi + pad, 6)
  return { min: t.min, max: t.max, ticks: t.ticks, paso: t.paso, log: false }
}

export const Grafico = forwardRef(function Grafico({
  puntos = [], curvas = [], bandas = [], ejeX, ejeY, leyenda = [], est, tam = null, ancho = 820, alto = 430,
  onClickPunto, onContext, rangoX = null, rangoY = null, lineasH = [],
}, svgRef) {
  const W = tam ? tam.w : ancho
  const H = tam ? tam.h : alto
  const sx = escala(rangoX || puntos.flatMap((p) => [p.x, ...(p.xErr || [])]), ejeX.log, { incluirCero: ejeX.cero, categorias: ejeX.categorias })
  const sy = escala(rangoY || puntos.flatMap((p) => [p.y, ...(p.yErr || [])]), ejeY.log, { incluirCero: ejeY.cero })

  const lx = ejeX.categorias ? ejeX.categorias : sx.ticks.map((t) => etiquetaTick(t, sx.log, sx.paso))
  const ly = sy.ticks.map((t) => etiquetaTick(t, sy.log, sy.paso))
  const n = est.numeros
  const wTickY = Math.max(...ly.map((t) => medir(t, n.size, n.bold, n.italic)))
  const tituloY = est.leyendaY.texto || ejeY.titulo
  const tituloX = est.leyendaX.texto || ejeX.titulo
  const titulo = est.titulo.texto
  const rot = ejeX.categorias && ejeX.categorias.some((c) => medir(c, n.size) > (W - 200) / Math.max(1, ejeX.categorias.length) - 6)
  const altoTickX = rot ? Math.max(...lx.map((t) => medir(t, n.size, n.bold, n.italic))) * 0.72 + n.size : n.size * 1.3
  const wLeyenda = leyenda.length ? Math.min(220, Math.max(...leyenda.map((l) => medir(l.texto, est.leyenda.size, est.leyenda.bold) + 30))) : 0

  const left = 12 + est.leyendaY.size * 1.3 + 10 + wTickY + 8
  const right = 18 + (wLeyenda ? wLeyenda + 14 : 0)
  const top = 14 + (titulo ? est.titulo.size * 1.5 + 8 : 0)
  const bottom = 10 + altoTickX + 10 + est.leyendaX.size * 1.5
  const pw = Math.max(80, W - left - right)
  const ph = Math.max(80, H - top - bottom)

  const fx = (v) => {
    const t = sx.log ? (Math.log10(v) - Math.log10(sx.min)) / (Math.log10(sx.max) - Math.log10(sx.min)) : (v - sx.min) / (sx.max - sx.min)
    return left + t * pw
  }
  const fy = (v) => {
    const t = sy.log ? (Math.log10(v) - Math.log10(sy.min)) / (Math.log10(sy.max) - Math.log10(sy.min)) : (v - sy.min) / (sy.max - sy.min)
    return top + ph - t * ph
  }
  const ok = (x, y) => fin(x) && fin(y) && (!sx.log || x > 0) && (!sy.log || y > 0)
  const camino = (pts) => {
    let d = '', pen = false
    pts.forEach(([x, y]) => {
      if (!ok(x, y)) { pen = false; return }
      const X = fx(x), Y = Math.max(top - 2000, Math.min(top + ph + 2000, fy(y)))
      d += `${pen ? 'L' : 'M'}${X.toFixed(2)},${Y.toFixed(2)}`
      pen = true
    })
    return d
  }
  const area = (s, i) => {
    const a = s.filter(([x, y]) => ok(x, y)), b = i.filter(([x, y]) => ok(x, y)).reverse()
    if (a.length < 2 || b.length < 2) return ''
    return camino(a) + camino(b).replace(/^M/, 'L') + 'Z'
  }
  const idClip = useRef('clip' + Math.random().toString(36).slice(2, 8)).current

  // marcas secundarias en escala log (2…9)
  const menores = []
  if (sy.log) for (let e = Math.log10(sy.min); e < Math.log10(sy.max); e++) for (let k = 2; k < 10; k++) menores.push(k * 10 ** e)
  const menoresX = []
  if (sx.log) for (let e = Math.log10(sx.min); e < Math.log10(sx.max); e++) for (let k = 2; k < 10; k++) menoresX.push(k * 10 ** e)

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width={W} height={H} onContextMenu={onContext}
      style={{ fontFamily: "'Segoe UI', system-ui, Arial, sans-serif", background: '#fff' }}>
      <defs><clipPath id={idClip}><rect x={left} y={top} width={pw} height={ph} /></clipPath></defs>
      <rect x="0" y="0" width={W} height={H} fill="#fff" />
      {titulo && <text x={left + pw / 2} y={14 + est.titulo.size} textAnchor="middle" style={estiloTexto(est.titulo)}>{titulo}</text>}
      {/* rejilla */}
      {menores.map((t) => <line key={'my' + t} x1={left} x2={left + pw} y1={fy(t)} y2={fy(t)} stroke="#f3f4f6" />)}
      {menoresX.map((t) => <line key={'mx' + t} y1={top} y2={top + ph} x1={fx(t)} x2={fx(t)} stroke="#f3f4f6" />)}
      {sy.ticks.map((t, i) => (
        <g key={'y' + i}>
          <line x1={left} x2={left + pw} y1={fy(t)} y2={fy(t)} stroke="#e6e9ee" />
          <text x={left - 7} y={fy(t)} textAnchor="end" dominantBaseline="central" style={estiloTexto(n)}>{ly[i]}</text>
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
      <text x={left + pw / 2} y={H - 8} textAnchor="middle" style={estiloTexto(est.leyendaX)}>{tituloX}</text>

      <g clipPath={`url(#${idClip})`}>
        {bandas.map((b, i) => <path key={'b' + i} d={area(b.sup, b.inf)} fill={b.color} fillOpacity={b.opacidad ?? 0.15} stroke="none" />)}
        {lineasH.map((l, i) => ok(sx.min, l.y) && <line key={'h' + i} x1={left} x2={left + pw} y1={fy(l.y)} y2={fy(l.y)} stroke={l.color} strokeDasharray={l.dash} />)}
        {curvas.map((c, i) => <path key={'c' + i} d={camino(c.pts)} fill="none" stroke={c.color} strokeWidth={c.ancho || 2} strokeDasharray={c.dash} />)}
        {puntos.map((p, i) => {
          if (!ok(p.x, p.y)) return null
          const X = fx(p.x), Y = fy(p.y)
          const col = p.excluido ? '#9aa5b1' : p.color
          return (
            <g key={p.key ?? i} style={{ cursor: onClickPunto ? 'pointer' : 'default' }} onClick={() => onClickPunto && onClickPunto(p)}>
              {p.yErr && ok(p.x, p.yErr[0]) && ok(p.x, p.yErr[1]) && (
                <g stroke={col} strokeWidth="1.3">
                  <line x1={X} x2={X} y1={fy(p.yErr[0])} y2={fy(p.yErr[1])} />
                  <line x1={X - 4} x2={X + 4} y1={fy(p.yErr[0])} y2={fy(p.yErr[0])} />
                  <line x1={X - 4} x2={X + 4} y1={fy(p.yErr[1])} y2={fy(p.yErr[1])} />
                </g>
              )}
              {p.xErr && ok(p.xErr[0], p.y) && ok(p.xErr[1], p.y) && (
                <g stroke={col} strokeWidth="1.3">
                  <line y1={Y} y2={Y} x1={fx(p.xErr[0])} x2={fx(p.xErr[1])} />
                  <line y1={Y - 4} y2={Y + 4} x1={fx(p.xErr[0])} x2={fx(p.xErr[0])} />
                  <line y1={Y - 4} y2={Y + 4} x1={fx(p.xErr[1])} x2={fx(p.xErr[1])} />
                </g>
              )}
              {p.forma === 'cuadrado'
                ? <rect x={X - (p.r || 5)} y={Y - (p.r || 5)} width={2 * (p.r || 5)} height={2 * (p.r || 5)} fill={p.hueco || p.excluido ? '#fff' : col} stroke={col} strokeWidth="1.6" />
                : <circle cx={X} cy={Y} r={p.r || 5} fill={p.hueco || p.excluido ? '#fff' : col} fillOpacity={p.hueco || p.excluido ? 1 : 0.85} stroke={col} strokeWidth="1.6" />}
              {p.excluido && <path d={`M${X - 5},${Y - 5}L${X + 5},${Y + 5}M${X - 5},${Y + 5}L${X + 5},${Y - 5}`} stroke="#c0392b" strokeWidth="1.5" />}
              {p.titulo && <title>{p.titulo}</title>}
            </g>
          )
        })}
      </g>

      {leyenda.length > 0 && (
        <g transform={`translate(${left + pw + 16},${top + 4})`}>
          {leyenda.map((l, i) => (
            <g key={i} transform={`translate(0,${i * est.leyenda.size * 1.55})`}>
              {l.linea
                ? <line x1="0" x2="16" y1={est.leyenda.size * 0.6} y2={est.leyenda.size * 0.6} stroke={l.color} strokeWidth="2.5" strokeDasharray={l.dash} />
                : l.banda
                  ? <rect x="0" y={est.leyenda.size * 0.1} width="16" height={est.leyenda.size} fill={l.color} fillOpacity={l.opacidad ?? 0.2} />
                  : <circle cx="8" cy={est.leyenda.size * 0.6} r="5" fill={l.hueco ? '#fff' : l.color} stroke={l.color} strokeWidth="1.6" />}
              <text x="24" y={est.leyenda.size * 0.6} dominantBaseline="central" style={estiloTexto(est.leyenda)}>{l.texto}</text>
            </g>
          ))}
        </g>
      )}
    </svg>
  )
})
