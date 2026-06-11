/* eslint-disable no-undef */
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import svgr from 'vite-plugin-svgr';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), tailwindcss(), svgr()],
    server: {
      proxy: {
        // In dev, forward /football-api/* → local polla-proxy server
        '/football-api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  };
});
