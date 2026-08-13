import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // @sabz/api-client is a linked workspace package built as CommonJS; without
    // pre-bundling the browser imports its raw CJS output and fails with
    // "does not provide an export named 'ApiError'", rendering a blank page.
    include: ['@sabz/api-client'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
