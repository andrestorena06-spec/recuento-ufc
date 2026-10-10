# Recuento UFC

Cálculo de **UFC/mL** a partir de recuentos manuales de colonias en diluciones seriadas 1:10 y **curva de calibración OD ↔ UFC/mL**.
Todo se calcula en el navegador: no hace falta instalar nada y los datos no se envían a ningún servidor.

**Uso:** doble clic en [`Recuento_UFC.html`](Recuento_UFC.html) (Edge, Chrome o Firefox).

## Pestañas
| Pestaña | Qué hace |
|---|---|
| Archivo | Guardar/cargar sesión, plantilla de Excel. |
| Datos | Grilla tipo Excel: muestra, tiempo (h por defecto), réplica (se numera sola en cada muestra y tiempo), dilución previa, «Sin diluir», −1 … −10 (botón **+** para agregar más). Siempre hay una fila vacía lista abajo; Enter en Muestra o Tiempo vacíos copia el de arriba; los nombres de muestra se guardan. Volumen sembrado fijo (opcional por fila). Se puede cargar un Excel o pegar una tabla: con encabezados cada dato va a su fila por muestra, tiempo y réplica. |
| OD | Longitud de onda, lecturas (una o varias), blanco (o «lecturas ya corregidas por el blanco»), dilución de la lectura, origen de la OD (misma suspensión o cultivo paralelo) y OD en el tiempo. |
| Tabla | Correspondencia UFC/mL ↔ OD por réplica (por defecto) o promediada, y factor de conversión directo. |
| Curva | Cinco modelos (lineal, proporcional, cuadrático, log–log, semilog), ponderación por error proporcional, bandas de confianza y predicción, comparación por AICc, residuos, interpretación automática y calculadora OD ↔ UFC/mL. |
| Método | Explicación de todos los cálculos y referencias. |

## Cálculos principales
- Celda vacía = dilución **no sembrada**; `0` = sembrada sin colonias; `INC` (MNPC, TNTC, >300) = incontable.
- Rango contable elegible: 30–300, 25–250 (FDA BAM), 10–300 (ISO 7218), 3–30 por gota, o personalizado.
- Media ponderada ISO 7218 / BAM: `N = ΣC / Σ(V·10⁻ᵏ)` (estimador de máxima verosimilitud bajo Poisson).
- Recuentos estimados fuera del rango, `<` límite de detección y `>` límite superior.
- IC 95 % exacto de Poisson (Garwood) y prueba χ² de coherencia entre diluciones.
- Réplicas promediadas en log₁₀ (media geométrica).

## Para modificar la interfaz
Requiere Node.js:
```
cd web
npm install
npm test          # pruebas de los cálculos
npm run build     # genera ../Recuento_UFC.html
```
