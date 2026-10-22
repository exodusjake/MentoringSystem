import { defineConfig, loadEnv } from 'vite';

// Single-page app: index.html + React Router. JSX is compiled by Vite's built-in transformer
// (automatic runtime), so no React plugin is needed.
export default defineConfig(({ mode }) => {
  // Optional dev proxy: with VITE_PROXY_TARGET set (e.g. https://my-backend.example.com) the dev server forwards
  // /api and /uploads to that backend, so the browser never makes a cross-origin call (no CORS change needed there).
  // Use it together with VITE_API_BASE_URL=/api. Unset = no proxy.
  const target = loadEnv(mode, process.cwd(), '').VITE_PROXY_TARGET;
  return {
    oxc: {
      jsx: { runtime: 'automatic' },
    },
    server: {
      port: 5173,
      proxy: target ? {
        '/api': { target, changeOrigin: true, secure: true },
        '/uploads': { target, changeOrigin: true, secure: true },
      } : undefined,
    },
    build: {
      // Route components are lazy-loaded, so each page becomes its own chunk.
      chunkSizeWarningLimit: 600,
      // No source maps, so the original source isn't served to anyone opening DevTools.
      sourcemap: false,
      // Drop console.* and debugger from the bundle, so API errors and internals aren't printed in the browser console.
      rolldownOptions: { output: { minify: { compress: { dropConsole: true, dropDebugger: true } } } },
    },
  };
});
