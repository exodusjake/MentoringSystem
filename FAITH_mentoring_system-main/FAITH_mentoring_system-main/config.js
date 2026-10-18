// The backend's HTTPS host (EC2 + Nginx reverse proxy, valid Let's Encrypt cert).
const BACKEND_HTTPS_HOST = '46-137-221-251.sslip.io';

const CONFIG = {
    // HTTPS frontends must call the backend over HTTPS too (mixed-content
    // blocking). Falls back to plain HTTP :5076 for local dev.
    API_BASE_URL: window.location.protocol === 'https:'
        ? `https://${BACKEND_HTTPS_HOST}/api`
        : `http://${window.location.hostname}:5076/api`,
    FILE_BASE_URL: window.location.protocol === 'https:'
        ? `https://${BACKEND_HTTPS_HOST}`
        : `http://${window.location.hostname}:5076`,
    getUrl:     (endpoint) => `${CONFIG.API_BASE_URL}/${endpoint}`,
    getFileUrl: (path)     => path ? `${CONFIG.FILE_BASE_URL}${path}` : null,
};
