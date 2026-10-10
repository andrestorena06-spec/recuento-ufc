// Copia la compilación de un solo archivo a la carpeta recuento_ufc
import { copyFileSync } from 'node:fs'
copyFileSync('dist/index.html', '../Recuento_UFC.html')
console.log('Listo: ../Recuento_UFC.html')
