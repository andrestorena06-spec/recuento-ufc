import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GLOSARIO } from '../ayudas.js'

// Recuadro emergente al pasar el mouse. Se dibuja en el body con posición fija, así no lo recortan las tablas con scroll.
function useCaja(ancho) {
  const ref = useRef()
  const [pos, setPos] = useState(null)
  const abrir = () => {
    const r = ref.current.getBoundingClientRect()
    setPos({ x: Math.max(8, Math.min(r.left, window.innerWidth - ancho - 12)), abajo: r.bottom + 8, arriba: r.top, alto: window.innerHeight })
  }
  const caja = (contenido) => pos && contenido && createPortal(
    <div className="tip-caja" style={{ left: pos.x, width: ancho, ...(pos.abajo > pos.alto * 0.62 ? { bottom: pos.alto - pos.arriba + 8 } : { top: pos.abajo }) }}>
      {contenido}
    </div>, document.body)
  return { ref, abrir, cerrar: () => setPos(null), caja }
}

export function Tip({ contenido, children, ancho = 340, className = '', bloque = false }) {
  const c = useCaja(ancho)
  const Tag = bloque ? 'div' : 'span'
  return (
    <Tag ref={c.ref} className={`tip ${className}`} onMouseEnter={c.abrir} onMouseLeave={c.cerrar}>
      {children}
      {c.caja(contenido)}
    </Tag>
  )
}

// Botón con explicación al pasar el mouse (sigue siendo un <button> para no romper los grupos de botones)
export function BotonTip({ titulo, ayuda, children, ancho = 300, ...props }) {
  const c = useCaja(ancho)
  return (
    <button ref={c.ref} {...props} onMouseEnter={c.abrir} onMouseLeave={c.cerrar}>
      {children}
      {c.caja(<FichaAyuda titulo={titulo || children} texto={ayuda} />)}
    </button>
  )
}

// Contenido estándar: título, qué es, fórmula general y notas
export function FichaAyuda({ titulo, texto, formula = [], nota }) {
  return (
    <>
      <div className="tip-titulo">{titulo}</div>
      {texto && <p className="tip-texto">{texto}</p>}
      {formula.length > 0 && <div className="tip-formula">{formula.map((l, i) => <div key={i}>{l}</div>)}</div>}
      {nota && <p className="tip-nota">{nota}</p>}
    </>
  )
}

// Encabezado o etiqueta con explicación del glosario (ⓘ)
export function Ayuda({ clave, children, ancho }) {
  const g = GLOSARIO[clave]
  if (!g) return <>{children}</>
  return (
    <Tip contenido={<FichaAyuda {...g} />} ancho={ancho || 360} className="con-ayuda">
      {children ?? g.titulo}<span className="i-ayuda">ⓘ</span>
    </Tip>
  )
}

// Etiqueta de un control con su explicación
export function Et({ texto, ayuda, titulo }) {
  return (
    <Tip contenido={<FichaAyuda titulo={titulo || texto} texto={ayuda} />} ancho={320} className="con-ayuda">
      {texto}<span className="i-ayuda">ⓘ</span>
    </Tip>
  )
}

// Valor calculado con el desarrollo de su cálculo. d = { titulo, pasos: [[etiqueta, expresión]], nota }
export function Calc({ d, children }) {
  if (!d || !d.pasos?.length) return <>{children}</>
  return (
    <Tip ancho={430} className="calc-valor" contenido={
      <>
        <div className="tip-titulo">{d.titulo}</div>
        <table className="desarrollo"><tbody>
          {d.pasos.map(([a, b], i) => (
            <tr key={i}>{b === undefined ? <td colSpan={2} className="paso-texto">{a}</td> : <><td className="paso-lhs">{a}</td><td className="paso-rhs">{b}</td></>}</tr>
          ))}
        </tbody></table>
        {d.nota && <p className="tip-nota">{d.nota}</p>}
      </>
    }>{children}</Tip>
  )
}
