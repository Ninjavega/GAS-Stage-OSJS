import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  publicDir: path.resolve(__dirname, 'public'),
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    lib: {
      entry: path.resolve(__dirname, 'src/index.tsx'),
      name: 'TerminalApp',
      formats: ['iife'],
      fileName: () => 'main.js'
    },
    rollupOptions: {
      output: {
        assetFileNames: assetInfo => assetInfo.name && assetInfo.name.endsWith('.css')
          ? 'main.css'
          : assetInfo.name || '[name].[ext]'
      }
    }
  }
});
