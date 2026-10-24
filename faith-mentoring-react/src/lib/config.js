// The backend's HTTPS host (EC2 + Nginx reverse proxy, Let's Encrypt cert; Nginx also serves the static frontend).
// Set in .env (see .env.example).
const BACKEND_HTTPS_HOST = import.meta.env.VITE_BACKEND_HTTPS_HOST;
const DEV_API_PORT = import.meta.env.VITE_DEV_API_PORT;

export const CONFIG = {
    // HTTPS frontends must call the backend over HTTPS too (mixed-content
    // blocking). Falls back to plain HTTP :VITE_DEV_API_PORT for local dev.
    API_BASE_URL: window.location.protocol === 'https:'
        ? `https://${BACKEND_HTTPS_HOST}/api`
        : `http://${window.location.hostname}:${DEV_API_PORT}/api`,
    FILE_BASE_URL: window.location.protocol === 'https:'
        ? `https://${BACKEND_HTTPS_HOST}`
        : `http://${window.location.hostname}:${DEV_API_PORT}`,
    getUrl:     (endpoint) => `${CONFIG.API_BASE_URL}/${endpoint}`,
    getFileUrl: (path)     => path ? `${CONFIG.FILE_BASE_URL}${path}` : null,
};
