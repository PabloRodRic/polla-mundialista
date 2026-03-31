/* eslint-disable no-undef */
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        // In dev, forward /football-api/* → https://api.football-data.org/v4/*
        // and inject the API key so it never leaks into the client bundle.
        '/football-api': {
          target: 'https://api.football-data.org/v4',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/football-api/, ''),
          headers: { 'X-Auth-Token': env.VITE_FOOTBALL_DATA_API_KEY || '' },
        },
      },
    },
  };
});
