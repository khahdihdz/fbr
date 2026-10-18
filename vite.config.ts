import { defineConfig } from 'vite';

export default defineConfig({
  base: '/fbr/',
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: false,
    assetsDir: 'assets',
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
