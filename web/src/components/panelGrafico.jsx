import { useRef, useState } from 'react'
import { Grafico, useAncho } from './grafico.jsx'
import { EstiloDialog, MenuContextual, useMenuContextual } from './ui.jsx'
import { ExportDialog } from './exportar.jsx'
import { normalizarEstilo } from '../utils.js'

// Gráfico con menú contextual (clic derecho): estilo de texto y descarga de imagen.
// props: todo lo que acepta <Grafico> menos est/ancho/tam; estilo y setEstilo; nombre del archivo.
export function PanelGrafico({ estilo, setEstilo, nombre, alto = 430, ...props }) {
  const [ref, ancho] = useAncho()
  const svgRef = useRef()
  const [menu, abrirMenu, cerrarMenu] = useMenuContextual()
  const [dlg, setDlg] = useState(null)
  const est = normalizarEstilo(estilo)
  return (
    <div>
      <div className="chart-wrap" ref={ref}>
        <Grafico ref={svgRef} {...props} est={est} ancho={ancho} alto={alto} onContext={abrirMenu} />
      </div>
      <div className="fila-ctrl" style={{ justifyContent: 'flex-end', margin: '4px 0 0' }}>
        <span className="nota" style={{ marginRight: 'auto' }}>Clic derecho sobre el gráfico: estilo de texto y descarga.</span>
        <button className="chico" onClick={() => setDlg('estilo')}>Estilo de texto</button>
        <button className="chico primario" onClick={() => setDlg('exportar')}>Descargar imagen</button>
      </div>
      <MenuContextual menu={menu} items={[
        ['Estilo de texto…', () => { cerrarMenu(); setDlg('estilo') }],
        ['Descargar imagen…', () => { cerrarMenu(); setDlg('exportar') }],
      ]} />
      {dlg === 'estilo' && (
        <EstiloDialog estilo={est} ejeX={props.ejeX.titulo} ejeY={props.ejeY.titulo}
          onGuardar={(e) => { setEstilo(e); setDlg(null) }} onClose={() => setDlg(null)} />
      )}
      {dlg === 'exportar' && (
        <ExportDialog nombre={nombre} onClose={() => setDlg(null)}
          size0={{ w: svgRef.current?.viewBox.baseVal.width || ancho, h: svgRef.current?.viewBox.baseVal.height || alto }}
          render={(r, tam) => <div className="chart-wrap"><Grafico ref={r} {...props} est={est} tam={tam} /></div>} />
      )}
    </div>
  )
}
