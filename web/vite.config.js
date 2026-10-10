import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Todo se calcula en el navegador. La compilación genera un solo archivo .html
// (dist/index.html) que copiar.js deja como ../Recuento_UFC.html (se abre con doble clic).
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  server: { port: 5174 },
})
