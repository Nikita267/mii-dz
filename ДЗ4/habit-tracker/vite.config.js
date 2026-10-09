import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Конфигурация Vite: React + Tailwind CSS v4 (плагин) + Vitest (jsdom).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    open: false,
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
