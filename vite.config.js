import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

const apiTarget = process.env.VITE_API_TARGET || 'http://localhost:3838';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  root: 'src/client',
  build: {
    outDir: resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': apiTarget,
      '/session': apiTarget,
    },
  },
});
