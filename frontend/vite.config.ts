import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// Vite 配置：React 插件 + 路径别名 + 后端联调代理
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // 开发环境代理后端 API，避免 CORS 问题；后端已在 8000 端口配置 CORS 白名单
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/docs': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/openapi.json': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
