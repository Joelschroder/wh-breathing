import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relativa sökvägar gör att bygget fungerar både lokalt och under
  // https://<användare>.github.io/wh-breathing/ (GitHub Pages).
  base: './',
  server: { host: true },
});
