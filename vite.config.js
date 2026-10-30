import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5199,
    strictPort: true,
  },
  preview: {
    port: 5299,
    strictPort: true,
  },
  // Vitest 설정. 순수 로직 모듈만 node 환경에서 시험하므로 DOM 환경은 두지 않는다.
  test: {
    include: ['src/**/*.test.js'],
  },
})
