// API location comes from .env (VITE_API_BASE_URL, e.g. http://localhost:5076/api). The static-file host
// (proofs, signatures, attachments) is the same server without the trailing /api.
// If the variable is unset, fall back to the vanilla app's rule: HTTPS frontends use the EC2 backend over
// HTTPS (mixed-content blocking), plain-HTTP frontends use <hostname>:5076.
const BACKEND_HTTPS_HOST = '18-136-217-232.sslip.io';

const envBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

// A path like "/api" (the production build) means "the same site that served this page": it works from any hostname
// pointing at the server and needs no CORS or CSP exception. Made absolute so print windows resolve files too.
const API_BASE_URL = envBase.startsWith('/') ? window.location.origin + envBase : envBase || (window.location.protocol === 'https:'
    ? `https://${BACKEND_HTTPS_HOST}/api`
    : `http://${window.location.hostname}:5076/api`);

const FILE_BASE_URL = API_BASE_URL.replace(/\/api$/i, '');

export const CONFIG = {
    API_BASE_URL,
    FILE_BASE_URL,
    getUrl:     (endpoint) => `${CONFIG.API_BASE_URL}/${endpoint}`,
    getFileUrl: (path)     => path ? `${CONFIG.FILE_BASE_URL}${path}` : null,
};
