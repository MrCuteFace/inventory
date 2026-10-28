import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_DEMO builds the static demo (GitHub Pages): relative paths, its own dist folder, the API
// answered in the browser. Otherwise: Vite on 5181 proxies /api to the API on 5281.
declare const process: { env: Record<string, string | undefined> }
const demo = Boolean(process.env.VITE_DEMO)

export default defineConfig({
  base: demo ? './' : '/',
  plugins: [react()],
  server: {
    port: 5181,
    strictPort: true,
    proxy: { '/api': 'http://localhost:5281' },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
  },
})
