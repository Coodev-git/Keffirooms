/* ═══════════════════════════════════════
   KEFFIROOMS — AUTH.JS
   Session + authentication (API-backed)
═══════════════════════════════════════ */

const SESSION = { current: null };

function setSession(data) {
  SESSION.current = data;
  if (data) sessionStorage.setItem('kr6_session', JSON.stringify(data));
  else sessionStorage.removeItem('kr6_session');
}

function getSession() {
  if (SESSION.current) return SESSION.current;
  const stored = sessionStorage.getItem('kr6_session');
  if (stored) {
    SESSION.current = JSON.parse(stored);
    return SESSION.current;
  }
  return null;
}

function clearSession() {
  SESSION.current = null;
  sessionStorage.removeItem('kr6_session');
  localStorage.removeItem(KR_CONFIG.tokenKey);
}

function goPage(url) {
  document.body.style.animation = 'pageOut 200ms ease both';
  setTimeout(() => { window.location.href = url; }, 180);
}

function requireTermsAgreed(checkboxId) {
  const el = document.getElementById(checkboxId);
  if (!el?.checked) {
    showToast('Please agree to the Terms & Conditions');
    return false;
  }
  return true;
}

function addRipple(el, event) {
  const ripple = document.createElement('span');
  const rect = el.getBoundingClientRect();
  const x = event ? event.clientX - rect.left : rect.width / 2;
  const y = event ? event.clientY - rect.top : rect.height / 2;
  ripple.style.cssText = `
    position:absolute;border-radius:50%;background:rgba(255,255,255,.14);
    width:200px;height:200px;margin-left:-100px;margin-top:-100px;
    left:${x}px;top:${y}px;animation:ripple 500ms ease-out both;
    pointer-events:none;z-index:0;
  `;
  el.style.position = 'relative';
  el.style.overflow = 'hidden';
  el.appendChild(ripple);
  setTimeout(() => ripple.remove(), 520);
}

function clearAuthLoginFields() {
  ['sk-email', 'sk-password', 'ag-email', 'ag-password', 'adm-id', 'adm-otp', 'reset-email', 'reset-otp', 'reset-password'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  if (typeof clearAdminOtp === 'function') clearAdminOtp();
}

// ── SEEKER AUTH ──
let googleSignInReady = false;

function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google script failed')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google script failed'));
    document.head.appendChild(script);
  });
}

async function handleGoogleCredential(response) {
  if (!response?.credential) {
    showToast('Google sign-in was cancelled');
    return;
  }
  try {
    const data = await API.auth.googleToken(response.credential, 'seeker');
    if (data.registered) {
      showToast(data.message || 'Registration submitted');
      return;
    }
    setAuthFromResponse(data);
    if (data.user?.role !== 'seeker') {
      showToast('This account is not a student account');
      await API.auth.logout();
      clearSession();
      return;
    }
    goPage('seeker.html');
  } catch (e) {
    showToast(e.message || 'Google sign-in failed');
  }
}

async function initGoogleSignIn() {
  try {
    const cfg = await loadPlatformConfig();
    if (!cfg.google?.enabled || !cfg.google?.clientId) return;
    await loadGoogleScript();
    window.google.accounts.id.initialize({
      client_id: cfg.google.clientId,
      callback: handleGoogleCredential,
      auto_select: false,
      cancel_on_tap_outside: true,
      context: 'signin',
      ux_mode: 'popup',
    });
    googleSignInReady = true;
  } catch (e) {
    console.warn('Google Sign-In init failed', e);
  }
}

async function seekerGoogleLogin() {
  try {
    const cfg = await loadPlatformConfig();
    if (!cfg.google?.enabled) {
      if (cfg.google?.devLogin) {
        openGoogleDevSheet();
        return;
      }
      showToast('Google sign-in is not set up. Add GOOGLE_CLIENT_ID to server/.env and restart.');
      return;
    }
    if (!googleSignInReady) await initGoogleSignIn();
    if (googleSignInReady && window.google?.accounts?.id) {
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          if (cfg.google.redirectEnabled) {
            window.location.href = API.auth.googleUrl('seeker');
          } else {
            showToast('Google sign-in blocked. Allow popups for this site and try again.');
          }
        }
      });
      return;
    }
    if (cfg.google.redirectEnabled) {
      window.location.href = API.auth.googleUrl('seeker');
      return;
    }
    showToast('Google sign-in could not start. Check GOOGLE_CLIENT_ID in server/.env');
  } catch {
    showToast('Could not reach server. Open http://localhost:3000/auth-seeker.html');
  }
}

function openGoogleDevSheet() {
  const sheet = document.getElementById('google-dev-sheet');
  const login = document.getElementById('sheet-login');
  if (sheet && login) {
    login.style.display = 'none';
    sheet.style.display = 'block';
    sheet.style.animation = 'sheetUp 300ms var(--ease) both';
    document.getElementById('google-dev-email')?.focus();
    return;
  }
  const email = window.prompt('Enter your Google email (local dev sign-in):');
  if (!email?.trim()) return;
  submitGoogleDevLogin(email.trim());
}

function closeGoogleDevSheet() {
  const sheet = document.getElementById('google-dev-sheet');
  const login = document.getElementById('sheet-login');
  if (sheet) sheet.style.display = 'none';
  if (login) login.style.display = 'block';
}

async function submitGoogleDevLogin(emailOverride) {
  const email = (emailOverride || document.getElementById('google-dev-email')?.value || '').trim();
  const name = document.getElementById('google-dev-name')?.value?.trim();
  if (!email) {
    showToast('Enter your Google email');
    return;
  }
  try {
    const data = await API.auth.googleDev({ email, name: name || undefined });
    setAuthFromResponse(data);
    if (data.user?.role !== 'seeker') {
      showToast('This account is not a student account');
      await API.auth.logout();
      clearSession();
      return;
    }
    showToast('Signed in!');
    goPage('seeker.html');
  } catch (e) {
    showToast(e.message || 'Google sign-in failed');
  }
}

async function seekerEmailLogin() {
  const email = document.getElementById('sk-email')?.value.trim();
  const password = document.getElementById('sk-password')?.value;
  if (!email || !password) { showToast('Enter email and password'); return; }
  try {
    const data = await API.auth.login(email, password);
    setAuthFromResponse(data);
    if (data.user?.role !== 'seeker') {
      showToast('This account is not a student account');
      await API.auth.logout();
      clearSession();
      return;
    }
    goPage('seeker.html');
  } catch (e) {
    showToast(e.message || 'Login failed');
  }
}

async function seekerRegister() {
  if (!requireTermsAgreed('sk-terms')) return;
  const name = document.getElementById('sk-name')?.value.trim();
  const email = document.getElementById('sk-email-reg')?.value.trim()
    || document.getElementById('sk-email')?.value.trim();
  const phone = document.getElementById('sk-phone')?.value.trim();
  const password = document.getElementById('sk-password-reg')?.value
    || document.getElementById('sk-password')?.value;
  if (!name || !email || !password) { showToast('Fill all required fields'); return; }
  try {
    const data = await API.auth.registerSeeker({ name, email, phone, password });
    setAuthFromResponse(data);
    showToast('Account created!');
    goPage('seeker.html');
  } catch (e) {
    showToast(e.message || 'Registration failed');
  }
}

function seekerGuest() {
  setSession({ role: 'seeker', name: 'Guest', loggedIn: false, via: 'guest' });
  goPage('seeker.html');
}

// Legacy phone login — redirects to auth page
function seekerPhoneLogin() {
  seekerEmailLogin();
}

// ── AGENT AUTH ──
async function agentLogin() {
  const identifier = document.getElementById('ag-email')?.value.trim()
    || document.getElementById('ag-phone')?.value.trim();
  const password = document.getElementById('ag-password')?.value;
  if (!identifier || !password) { showToast('Enter credentials'); return; }
  try {
    const data = await API.auth.login(identifier, password);
    setAuthFromResponse(data);
    const u = data.user;
    if (u.role !== 'agent' && u.role !== 'admin') {
      showToast('Not an agent account');
      clearSession();
      return;
    }
    if (u.role === 'agent' && u.agentStatus === 'pending') {
      showToast('Awaiting admin approval');
      return;
    }
    if (u.role === 'agent' && u.agentStatus === 'denied') {
      showToast('Access denied by admin');
      clearSession();
      return;
    }
    if (u.role === 'admin') goPage('admin.html');
    else if (u.isPromotedAdmin) goPage('agent.html');
    else goPage('agent.html');
  } catch (e) {
    showToast(e.message || 'Login failed');
  }
}

async function agentRegister() {
  if (!requireTermsAgreed('rg-terms')) return;
  const name = document.getElementById('rg-name')?.value.trim();
  const phone = document.getElementById('rg-phone')?.value.trim();
  const recoveryPhone = document.getElementById('rg-recovery-phone')?.value.trim();
  const email = document.getElementById('rg-email')?.value.trim();
  const password = document.getElementById('rg-password')?.value;
  if (!name || !phone || !email || !password) {
    showToast('Fill all required fields');
    return;
  }
  if (!isNigerianWhatsAppPhone(phone)) {
    showToast('Use your active WhatsApp number (e.g. 08012345678)');
    return;
  }
  if (recoveryPhone && !isNigerianWhatsAppPhone(recoveryPhone)) {
    showToast('Recovery phone must be a valid mobile number (e.g. 08012345678)');
    return;
  }
  try {
    const body = { name, phone, email, password };
    if (recoveryPhone) body.recoveryPhone = recoveryPhone;
    await API.auth.registerAgent(body);
    showToast('Request submitted — awaiting approval');
    setTimeout(() => goPage('index.html'), 1600);
  } catch (e) {
    showToast(e.message || 'Registration failed');
  }
}

// ── PIN INPUT HELPERS ──
function pinNext(input, index, rowId) {
  const val = input.value.replace(/\D/g, '');
  input.value = val.slice(-1);
  if (val && index < 5) {
    const row = document.getElementById(rowId);
    const next = row?.querySelectorAll('.pb')[index + 1];
    if (next) next.focus();
  }
  if (index === 5 && val.length === 1) {
    const row = document.getElementById(rowId);
    const code = getPin(rowId);
    if (code.length === 6) adminVerifyOtp();
  }
}

function getPin(rowId) {
  const row = document.getElementById(rowId);
  if (!row) return '';
  return Array.from(row.querySelectorAll('.pb'))
    .map((el) => el.value.replace(/\D/g, ''))
    .join('');
}

function clearPin(rowId) {
  const row = document.getElementById(rowId);
  if (!row) return;
  row.querySelectorAll('.pb').forEach((el) => { el.value = ''; });
}

// ── ADMIN AUTH (OTP) ──
function getAdminOtpCode() {
  const el = document.getElementById('adm-otp');
  if (el) return el.value.replace(/\D/g, '');
  return getPin('pin-adm');
}

function clearAdminOtp() {
  const el = document.getElementById('adm-otp');
  if (el) el.value = '';
  clearPin('pin-adm');
}

function showAdminOtpStep(email) {
  document.getElementById('adm-step-email').style.display = 'none';
  document.getElementById('adm-step-otp').style.display = 'block';
  document.querySelector('.secure-notice')?.style.setProperty('display', 'none');
  document.getElementById('adm-step-title').textContent = 'Check Your Email';
  document.getElementById('adm-step-sub').textContent = `Enter the 6-digit code sent to ${email}. Check spam if you do not see it.`;
  clearAdminOtp();
  const otpInput = document.getElementById('adm-otp');
  if (otpInput) {
    setTimeout(() => {
      otpInput.focus();
      otpInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  }
}

async function adminRequestOtp() {
  const email = document.getElementById('adm-id')?.value.trim();
  if (!email) { showToast('Enter admin email'); return; }
  try {
    const result = await API.auth.adminRequestOtp(email);
    if (!result.delivered) {
      showToast('Could not send code — email delivery failed');
      return;
    }
    showAdminOtpStep(email);
    showToast('Code sent — check your email');
  } catch (e) {
    const msg = e.message || 'Could not send code';
    if (msg.includes('wait a minute')) {
      showAdminOtpStep(email);
    }
    showToast(msg);
    const box = document.getElementById('adm-email-warn');
    if (box && (msg.includes('SMTP') || msg.includes('Email is not configured'))) {
      box.style.display = 'block';
      box.innerHTML = `<strong>${escapeHtml(msg)}</strong><br>Set <code>SMTP_PASS</code> in <code>server/.env</code> (Gmail App Password), restart the server, then try again.`;
    }
  }
}

async function adminVerifyOtp() {
  const email = document.getElementById('adm-id')?.value.trim();
  const code = getAdminOtpCode();
  if (!email || code.length < 6) { showToast('Enter the 6-digit code'); return; }
  try {
    const data = await API.auth.adminVerifyOtp(email, code);
    setAuthFromResponse(data);
    goPage('admin.html');
  } catch (e) {
    showToast(e.message || 'Invalid code');
    clearAdminOtp();
  }
}

async function adminResendOtp() {
  const email = document.getElementById('adm-id')?.value.trim();
  if (!email) { showToast('Enter admin email'); return; }
  try {
    await API.auth.adminRequestOtp(email);
    clearAdminOtp();
    showToast('New code sent — check your email');
    document.getElementById('adm-otp')?.focus();
  } catch (e) {
    showToast(e.message || 'Could not resend code');
  }
}

function adminBackToEmail() {
  document.getElementById('adm-step-email').style.display = 'block';
  document.getElementById('adm-step-otp').style.display = 'none';
  document.querySelector('.secure-notice')?.style.removeProperty('display');
  document.getElementById('adm-step-title').textContent = 'Verify Your Email';
  document.getElementById('adm-step-sub').textContent = "We'll send a 6-digit code to your admin email.";
  clearAdminOtp();
}

/** @deprecated use adminVerifyOtp */
async function adminLogin() {
  await adminVerifyOtp();
}

async function signOut() {
  try { await API.auth.logout(); } catch { /* ignore */ }
  clearSession();
  goPage('index.html');
}

function requireAuth(expectedRole) {
  const s = getSession();
  if (!s || !s.loggedIn) {
    if (expectedRole === 'seeker') return s;
    goPage(expectedRole === 'admin' ? 'auth-admin.html' : 'auth-agent.html');
    return null;
  }
  if (expectedRole && s.role !== expectedRole && !s.isAdmin) {
    goPage('index.html');
    return null;
  }
  return s;
}

async function requireAuthAsync(expectedRole) {
  let s = getSession();
  if (!s && localStorage.getItem(KR_CONFIG.tokenKey)) {
    s = await bootstrapAuth();
  }
  if (expectedRole === 'seeker' && (!s || !s.loggedIn)) return s;

  if (!s?.loggedIn) {
    const dest = expectedRole === 'admin' ? 'auth-admin.html'
      : expectedRole === 'agent' ? 'auth-agent.html'
      : 'auth-seeker.html';
    goPage(dest);
    return null;
  }

  if (expectedRole === 'admin' && s.role !== 'admin' && !s.isAdmin) {
    goPage('index.html');
    return null;
  }
  if (expectedRole === 'agent' && s.role !== 'agent' && s.role !== 'admin') {
    goPage('index.html');
    return null;
  }
  return s;
}

function isPromotedAgent(session) {
  return !!(session?.isPromotedAgent || (session?.role === 'agent' && session?.isAdmin && !session?.isMaster));
}

function isMasterAdminSession(session) {
  return !!(session?.isMaster || session?.role === 'admin');
}

function setupDualRolePortal(currentMode) {
  const session = getSession();
  if (!isPromotedAgent(session)) return;

  const switcher = document.getElementById('dual-role-switcher');
  if (switcher) {
    switcher.style.display = 'flex';
    switcher.querySelectorAll('[data-portal]').forEach((btn) => {
      const mode = btn.getAttribute('data-portal');
      btn.classList.toggle('on', mode === currentMode);
      btn.onclick = () => {
        if (mode === currentMode) return;
        goPage(mode === 'admin' ? 'admin.html' : 'agent.html');
      };
    });
  }

  const dock = document.getElementById('promoted-agent-dock');
  if (dock) dock.style.display = currentMode === 'admin' ? 'flex' : 'none';

  const badge = document.getElementById('dual-role-badge');
  if (badge) {
    badge.style.display = 'inline-flex';
    badge.innerHTML = '<span class="material-symbols-rounded">verified_user</span> Agent + Admin';
  }

  const modeLbl = document.getElementById('portal-mode-lbl');
  if (modeLbl) {
    modeLbl.textContent = currentMode === 'admin' ? 'Admin Mode' : 'Agent Mode';
  }

  if (currentMode === 'admin') {
    document.getElementById('sadm')?.classList.add('has-promoted-dock');
  }

  if (currentMode === 'admin') {
    const exitBtn = document.getElementById('adm-exit-btn');
    if (exitBtn) {
      exitBtn.onclick = () => goPage('agent.html');
      exitBtn.innerHTML = '<span class="material-symbols-rounded ms" style="font-size:.85rem;">home_work</span> Agent Portal';
    }
    const bc = document.getElementById('adm-bc-cur');
    if (bc) bc.textContent = 'Verification Admin · Your listings stay active';
  }
}

async function updateLandingStats() {
  try {
    const stats = await API.listings.stats();
    const el_t = document.getElementById('lp-total');
    const el_v = document.getElementById('lp-verified');
    const el_a = document.getElementById('lp-agents');
    if (el_t) animateCount(el_t, stats.total || 0);
    if (el_v) animateCount(el_v, stats.verified || 0);
    if (el_a) animateCount(el_a, stats.agents || 0);
  } catch { /* offline */ }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  const msg_el = document.getElementById('toast-msg');
  if (!t || !msg_el) return;
  msg_el.textContent = msg;
  t.classList.add('on');
  setTimeout(() => t.classList.remove('on'), 3000);
}
