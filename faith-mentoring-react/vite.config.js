import { defineConfig } from 'vite';

// Single-page app: index.html + React Router. JSX is compiled by Vite's built-in transformer
// (automatic runtime), so no React plugin is needed.
export default defineConfig({
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  build: {
    // Route components are lazy-loaded, so each page becomes its own chunk.
    chunkSizeWarningLimit: 600,
  },
});
