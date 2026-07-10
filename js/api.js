/* ═══════════════════════════════════════
   KEFFIROOMS — API CLIENT
   All backend communication
═══════════════════════════════════════ */

let platformConfig = null;

function getToken() {
  return localStorage.getItem(KR_CONFIG.tokenKey);
}

function setToken(token) {
  if (token) localStorage.setItem(KR_CONFIG.tokenKey, token);
  else localStorage.removeItem(KR_CONFIG.tokenKey);
}

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const isForm = options.body instanceof FormData;
  if (!isForm && options.body && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const url = `${KR_CONFIG.apiBase}${path}`;
  let res;

  try {
    res = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch (err) {
    const hint = KR_CONFIG.apiBase.includes('localhost:3000')
      ? ' Start the server: cd server && npm run dev'
      : '';
    const netErr = new Error(
      `Cannot reach KeffiRooms API at ${KR_CONFIG.apiBase}.${hint} Open http://localhost:3000 (not Live Server).`
    );
    netErr.code = 'NETWORK_ERROR';
    throw netErr;
  }

  if (res.status === 401 && path !== '/auth/refresh' && path !== '/auth/login') {
    const refreshed = await refreshToken();
    if (refreshed) {
      headers.Authorization = `Bearer ${getToken()}`;
      res = await fetch(`${KR_CONFIG.apiBase}${path}`, {
        ...options,
        headers,
        credentials: 'include',
      });
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed');
    err.code = data.code;
    err.status = res.status;
    err.details = data.details;
    throw err;
  }
  return data;
}

async function refreshToken() {
  try {
    const data = await fetch(`${KR_CONFIG.apiBase}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    }).then((r) => r.json());
    if (data.accessToken) {
      setToken(data.accessToken);
      if (data.user) setSession(mapApiUser(data.user));
      return true;
    }
  } catch { /* ignore */ }
  setToken(null);
  clearSession();
  return false;
}

function mapApiUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    role: u.role,
    name: u.name,
    email: u.email,
    phone: u.phone,
    avatarUrl: u.avatarUrl,
    loggedIn: true,
    isAdmin: u.role === 'admin' || u.isPromotedAdmin,
    isMaster: u.role === 'admin',
    isPromotedAgent: u.role === 'agent' && !!u.isPromotedAdmin,
    agentStatus: u.agentStatus,
    via: 'api',
  };
}

const API = {
  auth: {
    adminRequestOtp: (email) =>
      apiFetch('/auth/admin/request-otp', { method: 'POST', body: { email } }),
    adminVerifyOtp: (email, code) =>
      apiFetch('/auth/admin/verify-otp', { method: 'POST', body: { email, code } }),
    login: (identifier, password) =>
      apiFetch('/auth/login', { method: 'POST', body: { identifier, password } }),
    registerSeeker: (body) =>
      apiFetch('/auth/register/seeker', { method: 'POST', body }),
    registerAgent: (body) =>
      apiFetch('/auth/register/agent', { method: 'POST', body }),
    logout: () => apiFetch('/auth/logout', { method: 'POST' }),
    me: () => apiFetch('/auth/me'),
    forgotPassword: (email, role) =>
      apiFetch('/auth/forgot-password', { method: 'POST', body: { email, role } }),
    verifyResetOtp: (email, code, role) =>
      apiFetch('/auth/verify-reset-otp', { method: 'POST', body: { email, code, role } }),
    resetPassword: (token, password) =>
      apiFetch('/auth/reset-password', { method: 'POST', body: { token, password } }),
    googleUrl: (role = 'seeker') =>
      `${KR_CONFIG.apiBase}/auth/google?role=${role}`,
    googleToken: (credential, role = 'seeker') =>
      apiFetch('/auth/google/token', { method: 'POST', body: { credential, role } }),
    googleDev: (body) =>
      apiFetch('/auth/google/dev', { method: 'POST', body }),
  },
  listings: {
    list: (params = {}) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') qs.set(k, v);
      });
      return apiFetch(`/listings?${qs}`);
    },
    mine: () => apiFetch('/listings/mine'),
    unlist: (id, notes) =>
      apiFetch(`/listings/${id}/unlist`, { method: 'PATCH', body: notes ? { notes } : {} }),
    relist: (id) =>
      apiFetch(`/listings/${id}/relist`, { method: 'PATCH' }),
    get: (id) => apiFetch(`/listings/${id}`),
    bySerial: (serial) => apiFetch(`/listings/by-serial/${serial}`),
    create: (formData) =>
      apiFetch('/listings', { method: 'POST', body: formData }),
    update: (id, body) =>
      apiFetch(`/listings/${id}`, { method: 'PATCH', body }),
    stats: () => apiFetch('/listings/stats'),
    featured: () => apiFetch('/listings/featured'),
    platform: () => apiFetch('/listings/config/platform'),
  },
  admin: {
    pendingListings: () => apiFetch('/admin/listings/pending'),
    allListings: () => apiFetch('/admin/listings'),
    setListingStatus: (id, status, notes) =>
      apiFetch(`/admin/listings/${id}/status`, { method: 'PATCH', body: { status, notes } }),
    pendingAgents: () => apiFetch('/admin/agents/pending'),
    approvedAgents: () => apiFetch('/admin/agents/approved'),
    deniedAgents: () => apiFetch('/admin/agents/denied'),
    setAgentStatus: (id, status) =>
      apiFetch(`/admin/agents/${id}/status`, { method: 'PATCH', body: { status } }),
    promoteAgent: (id) => apiFetch(`/admin/agents/${id}/promote`, { method: 'POST' }),
    users: () => apiFetch('/admin/users'),
    kpi: () => apiFetch('/admin/kpi'),
    activity: () => apiFetch('/admin/activity'),
    fees: () => apiFetch('/admin/fees'),
  },
  social: {
    createInquiry: (body) => apiFetch('/inquiries', { method: 'POST', body }),
    submitReview: (body) => apiFetch('/reviews', { method: 'POST', body }),
    favorites: () => apiFetch('/favorites'),
    toggleFavorite: (listingId) =>
      apiFetch(`/favorites/${listingId}`, { method: 'POST' }),
    sendMessage: (conversationId, body) =>
      apiFetch(`/conversations/${conversationId}/messages`, { method: 'POST', body: { body } }),
  },
};

async function loadPlatformConfig() {
  if (platformConfig) return platformConfig;
  try {
    platformConfig = await API.listings.platform();
  } catch {
    platformConfig = {
      adminWa: '2347066068160',
      adminPhone: '07066068160',
      fees: { agent: 5000, seeker: 2000, totalPerConnection: 7000 },
      google: { enabled: false, devLogin: true, clientId: null, redirectEnabled: false },
    };
  }
  return platformConfig;
}

function setAuthFromResponse(data) {
  if (data.accessToken) setToken(data.accessToken);
  if (data.user) setSession(mapApiUser(data.user));
  return data;
}

async function bootstrapAuth() {
  if (!getToken()) return null;
  try {
    const data = await API.auth.me();
    setSession(mapApiUser(data.user));
    return getSession();
  } catch {
    setToken(null);
    return null;
  }
}
