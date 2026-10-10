export const FUENTE = "'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif"

// Colores por muestra (equivalente a scales::hue_pal de R)
export function paletaMuestras(muestras) {
  const n = muestras.length
  const out = {}
  muestras.forEach((m, i) => {
    const h = (15 + (360 * i) / Math.max(n, 1)) % 360
    out[m] = `hsl(${h.toFixed(0)}, 62%, 48%)`
  })
  return out
}

// Marcas "bonitas" para un eje numérico
export function ticksBonitos(min, max, n = 6) {
  if (!(max > min)) return { ticks: [min], min, max: min + 1, paso: 1 }
  const rango = max - min
  const burdo = rango / Math.max(n - 1, 1)
  const mag = Math.pow(10, Math.floor(Math.log10(burdo)))
  const res = burdo / mag
  const paso = (res < 1.5 ? 1 : res < 3 ? 2 : res < 7 ? 5 : 10) * mag
  const ini = Math.floor(min / paso) * paso
  const fin = Math.ceil(max / paso) * paso
  const ticks = []
  for (let v = ini; v <= fin + paso * 1e-6; v += paso) ticks.push(Number(v.toPrecision(12)))
  return { ticks, min: ini, max: fin, paso }
}

let _ctx
export function medir(texto, size, bold = false, italic = false) {
  if (!_ctx) _ctx = document.createElement('canvas').getContext('2d')
  _ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px ${FUENTE}`
  return _ctx.measureText(String(texto)).width
}

export function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const t = (size, color = '#1f2933', extra = {}) => ({
  size, color, bold: false, italic: false, underline: false, strike: false, texto: '', ...extra,
})
// Cada texto del gráfico tiene su propio formato. `texto` vacío = texto automático.
export const estiloDefecto = () => ({
  titulo: t(17, '#1f2933', { bold: true }),
  leyendaY: t(14),
  leyendaX: t(14),
  numeros: t(12),
  leyenda: t(12),
})
export function normalizarEstilo(e = {}) {
  const base = estiloDefecto()
  const out = { ...base }
  for (const k of Object.keys(base)) if (e[k] && typeof e[k] === 'object' && 'size' in e[k]) out[k] = { ...base[k], ...e[k] }
  return out
}
export const estiloTexto = (s) => {
  const dec = [s.underline && 'underline', s.strike && 'line-through'].filter(Boolean).join(' ')
  return { fontSize: s.size, fill: s.color, fontWeight: s.bold ? 700 : 400, fontStyle: s.italic ? 'italic' : 'normal', textDecoration: dec || 'none' }
}

export const nuevoId = () => Math.random().toString(36).slice(2, 10)
