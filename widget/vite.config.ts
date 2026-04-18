import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Ensure /admin route serves the same index.html
  build: {
    rollupOptions: {
      input: { main: 'index.html' }
    }
  }
});
