/* KeffiRooms — runtime configuration */

function resolveApiBase() {
  // Manual override (browser console: localStorage.setItem('kr6_api_base','http://localhost:3000/api'))
  const override = localStorage.getItem('kr6_api_base');
  if (override) return override.replace(/\/$/, '');

  const { protocol, hostname, port } = window.location;

  // file:// or invalid — always use the Express API
  if (protocol === 'file:' || !hostname) {
    return 'http://localhost:3000/api';
  }

  // Same-origin when the Express app serves the page (default port 3000)
  if (port === '3000' || (port === '' && hostname !== 'localhost')) {
    return `${window.location.origin}/api`;
  }

  // Live Server, VS Code preview, other static hosts on :5500, :8080, etc.
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3000/api';
  }

  // Production: same host as the page
  return `${window.location.origin}/api`;
}

const KR_CONFIG = {
  apiBase: resolveApiBase(),
  tokenKey: 'kr6_access_token',
};
