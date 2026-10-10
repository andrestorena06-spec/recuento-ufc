# Recuento UFC

Cálculo de **UFC/mL** a partir de recuentos manuales de colonias en diluciones seriadas 1:10 y **curva de calibración OD ↔ UFC/mL**.
Todo se calcula en el navegador: no hace falta instalar nada y los datos no se envían a ningún servidor.

**Uso:** doble clic en [`Recuento_UFC.html`](Recuento_UFC.html) (Edge, Chrome o Firefox).

## Pestañas
| Pestaña | Qué hace |
|---|---|
| Archivo | Guardar/cargar sesión, plantilla de Excel, condiciones del experimento (cepa, medio, temperatura…) que se agregan a todos los Excel y opcionalmente al pie de los gráficos. |
| Datos | Grilla tipo Excel: muestra, tiempo (h por defecto), réplica (se numera sola en cada muestra y tiempo), «Sin diluir», −1 … −10 (botón **+** para agregar más). Siempre hay una fila vacía lista abajo; Enter en Muestra o Tiempo vacíos copia el de arriba; los nombres de muestra se guardan. Volumen sembrado fijo (opcional por fila). Se puede cargar un Excel o pegar una tabla: con encabezados cada dato va a su fila por muestra, tiempo y réplica. |
| OD | OD leída en cada dilución (Sin diluir, −1, −2…). **OD corregida** = lecturas dentro de la ventana lineal del equipo (por defecto 0,1–0,8) × 10ᵏ, promediadas. Control de linealidad (la OD debe bajar ×10 por dilución), blanco u «OD ya corregida», origen de la OD. |
| Crecimiento | Curva de crecimiento con doble eje (OD corregida a la izquierda, log₁₀ UFC/mL a la derecha), fase exponencial detectada, µ, tiempo de generación y latencia, y UFC/mL estimadas con la curva para tiempos sin recuento. |
| Tabla | Correspondencia UFC/mL ↔ OD (OD corregida o por dilución; réplicas o promedios), **resumen por tiempo** (la tabla que se reporta), UFC/mL estimadas por la curva y factor de conversión. |
| Curva | Correlación OD ↔ log₁₀ UFC/mL con ecuación y R² sobre el gráfico. Modelo clásico `log₁₀ UFC = m·OD + b` por defecto, comparado con lineal, proporcional, cuadrático y log–log (aviso si otro ajusta mejor). Rango de tiempo y de OD del ajuste, bandas de confianza y predicción, residuos y calculadora. |
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
