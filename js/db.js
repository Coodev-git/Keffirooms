/* ═══════════════════════════════════════
   KEFFIROOMS — DB.JS
   Client utilities (no local data store)
═══════════════════════════════════════ */

// Platform contact — loaded from API; fallback for offline
let ADMIN_WA = '2347066068160';
let ADMIN_PHONE = '07066068160';
let PLATFORM_FEES = { agent: 5000, seeker: 2000, totalPerConnection: 7000 };

async function initPlatform() {
  const cfg = await loadPlatformConfig();
  ADMIN_WA = cfg.adminWa || ADMIN_WA;
  ADMIN_PHONE = cfg.adminPhone || ADMIN_PHONE;
  if (cfg.fees) PLATFORM_FEES = { ...PLATFORM_FEES, ...cfg.fees };
}

function coordinationFeeText() {
  return `₦${fmtN(PLATFORM_FEES.seeker)} from seeker · ₦${fmtN(PLATFORM_FEES.agent)} from agent`;
}

// ── UTILITY ──
function fmtN(n) { return Number(n).toLocaleString('en-NG'); }

function fmtDate(ts) {
  const d = new Date(ts);
  return d.getFullYear()
    + '-' + String(d.getMonth() + 1).padStart(2, '0')
    + '-' + String(d.getDate()).padStart(2, '0');
}

function fmtDateTime(ts) {
  const d = new Date(ts);
  return fmtDate(ts)
    + ' ' + String(d.getHours()).padStart(2, '0')
    + ':' + String(d.getMinutes()).padStart(2, '0');
}

function nowStr() {
  return fmtDateTime(Date.now());
}

function isStale(ts) {
  const t = typeof ts === 'number' ? ts : new Date(ts).getTime();
  return (Date.now() - t) > 60 * 24 * 60 * 60 * 1000;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatListingTag(serial) {
  if (serial == null || serial === '') return '';
  return `#${serial}`;
}

function parseListingSerial(query) {
  const m = String(query || '').trim().match(/^#?(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

function truncateText(str, max = 400) {
  const s = String(str || '').trim();
  if (!s) return '';
  if (s.length <= max) return s;
  return s.slice(0, max).trimEnd() + '…';
}

function listingCanInquire(l) {
  const status = l?.status || 'pending';
  return status === 'verified' || status === 'pending';
}

function listingStatusForSeeker(l) {
  const status = l?.status || 'pending';
  if (status === 'verified') {
    return { canInquire: true, label: 'Verified', sublabel: 'Inquiry via WhatsApp', icon: 'verified', badgeClass: 'verified' };
  }
  if (status === 'unavailable') {
    return { canInquire: false, label: 'Unavailable', sublabel: 'Inquiries closed', icon: 'block', badgeClass: 'unavailable' };
  }
  if (status === 'rejected') {
    return { canInquire: false, label: 'Rejected', sublabel: 'Inquiries closed', icon: 'cancel', badgeClass: 'unverified' };
  }
  return { canInquire: true, label: 'Not Verified', sublabel: 'Inquiry via WhatsApp', icon: 'gpp_bad', badgeClass: 'unverified' };
}

function waSafeInline(s) {
  return String(s ?? '').replace(/[\r\n*]/g, ' ').trim();
}

function listingSeekerInquiryMessage(l, session = {}) {
  const tag = l.listingTag || formatListingTag(l.serialNumber) || '-';
  const verified = l.status === 'verified';
  const statusLine = verified ? 'Verified' : 'Pending verification (not verified yet)';
  const askLine = verified
    ? 'Please connect me with the verified agent.'
    : 'This listing is not verified yet. Please confirm it is available and connect me with the agent.';
  const title = waSafeInline(l.title) || 'Listing';
  const area = waSafeInline(l.area);
  const distance = l.distance ? waSafeInline(l.distance) : '';
  const landmark = l.landmark ? waSafeInline(l.landmark) : '';
  const locationParts = [area, distance, landmark].filter(Boolean);
  const location = locationParts.length ? locationParts.join(' | ') : 'Keffi';
  const amenities = (l.amenities || []).slice(0, 4).map(waSafeInline).filter(Boolean).join(', ') || 'See listing';
  const name = waSafeInline(session.name) || '[your full name]';
  const phone = waSafeInline(session.phone) || '[your phone]';

  return [
    'Hello KeffiRooms,',
    '',
    'I am interested in this listing:',
    '',
    `Ref: ${tag}`,
    `Title: *${title}*`,
    `Location: ${location}`,
    `Price: N${fmtN(l.price)}/year`,
    `Type: ${waSafeInline(l.type) || 'Room'}`,
    `Status: ${statusLine}`,
    `Amenities: ${amenities}`,
    '',
    askLine,
    '',
    'My details:',
    `- Name: ${name}`,
    `- Phone: ${phone}`,
    '- Available for viewing: [date & time]',
    `- Budget: N${fmtN(l.price)}/year`,
    '',
    'I agree to the KeffiRooms Terms & Conditions.',
  ].join('\n');
}

function keffiRoomsWhatsAppUrl(text) {
  const wa = String(typeof ADMIN_WA !== 'undefined' ? ADMIN_WA : '').replace(/\D/g, '');
  if (!wa) return '';
  return `https://wa.me/${wa}?text=${encodeURIComponent(text || '')}`;
}

function trustScoreBadgeHtml(score, label, opts = {}) {
  if (score == null) return '';
  const tier = score >= 85 ? 'excellent' : score >= 70 ? 'good' : score >= 50 ? 'building' : 'low';
  const compact = opts.compact ? ' compact' : '';
  const title = label ? escapeHtml(label) : '';
  return `<span class="trust-score-badge ${tier}${compact}" title="${title}">
    <span class="material-symbols-rounded">verified_user</span>${score}%
  </span>`;
}

function listingAgentStatusHtml(status) {
  const map = {
    verified: { cls: 'verified', label: 'Verified' },
    pending: { cls: 'pending', label: 'Pending' },
    rejected: { cls: 'rejected', label: 'Rejected' },
    unavailable: { cls: 'unavailable', label: 'Unlisted' },
  };
  const s = map[status] || { cls: 'pending', label: String(status || 'Unknown') };
  return `<span class="prop-status ${s.cls}">${s.label}</span>`;
}

function sanitizeListingForSeeker(l) {
  if (!l || typeof l !== 'object') return l;
  const { agentPhone, photoMetadata, ...safe } = l;
  return safe;
}

function listingStatusBadgeHtml(l, opts = {}) {
  const s = listingStatusForSeeker(l);
  const overlay = opts.overlay ? ' overlay' : '';
  const compact = opts.compact ? ' compact' : '';
  return `<span class="lst-status ${s.badgeClass}${overlay}${compact}" title="${escapeHtml(s.sublabel)}">
    <span class="material-symbols-rounded">${s.icon}</span>${s.label}
  </span>`;
}

function listingInquiryHintHtml(l) {
  const s = listingStatusForSeeker(l);
  return `<span class="lst-inquiry-hint ${s.badgeClass}">
    <span class="material-symbols-rounded">${s.canInquire ? 'chat' : 'block'}</span>${s.sublabel}
  </span>`;
}

function listingAdminAgentMessage(l) {
  const tag = formatListingTag(l.serialNumber) || 'listing';
  const statusLabel = String(l.status || 'pending').toUpperCase();
  const amenities = Array.isArray(l.amenities) ? l.amenities.filter(Boolean) : [];
  const meta = l.photoMetadata && l.photoMetadata[0];
  const gpsLine = meta?.gps_lat && meta?.gps_lng
    ? `🗺️ GPS: ${meta.gps_lat}, ${meta.gps_lng}${meta.gps_acc ? ` (±${meta.gps_acc}m)` : ''}\n`
    : '';

  const lines = [
    `Hi ${l.agentName || 'there'},`,
    '',
    `KeffiRooms admin regarding listing *${tag}*:`,
    '',
    '*Property*',
    `🏠 ${l.title || 'Untitled listing'}`,
    l.type ? `Type: ${l.type}` : '',
    `💰 ₦${fmtN(l.price || 0)}/year`,
    `Status: ${statusLabel}`,
    '',
    '*Location*',
    `📍 ${l.area || '—'}, Keffi`,
    l.distance ? `🚶 ${l.distance}` : '',
    l.landmark ? `📌 Landmark: ${l.landmark}` : '',
    gpsLine.trimEnd(),
    '',
    '*Features*',
    amenities.length ? `✨ ${amenities.join(', ')}` : '✨ None listed',
    '',
    '*Description*',
    truncateText(l.description, 400) || 'No description provided.',
    '',
    '---',
    'A student may contact us about this property. Please confirm it is still available and ready for viewing.',
    '',
    `Quote ref: *${tag}*`,
    '',
    '— KeffiRooms Admin',
  ];

  return lines.filter((line, i, arr) => !(line === '' && arr[i - 1] === '')).join('\n');
}

function adminListingWaHref(l) {
  const phone = getAgentPhoneFromListing(l);
  return agentWhatsAppUrl(phone, listingAdminAgentMessage(l));
}

function getAgentPhoneFromListing(l) {
  return String(l?.agentPhone || l?.agent_phone || '').trim();
}

function formatPhoneDisplay(phone) {
  return normalizeNigerianPhone(phone) || String(phone || '').trim() || '—';
}

function agentWhatsAppUrl(phone, text) {
  const wa = toWhatsAppIntl(phone);
  if (!wa) return '';
  return `https://wa.me/${wa}?text=${encodeURIComponent(text || '')}`;
}

function adminListingWaButton(l, label) {
  const phone = getAgentPhoneFromListing(l);
  const display = formatPhoneDisplay(phone);
  if (!toWhatsAppIntl(phone)) {
    return `<span class="alr-btn wa disabled" title="No valid agent WhatsApp (${escapeHtml(display)})">WhatsApp N/A</span>`;
  }
  const btnLabel = label || `WhatsApp ${display}`;
  return `<button type="button" class="alr-btn wa" onclick="openAdminAgentWhatsApp('${l.id}')" title="Message ${escapeHtml(l.agentName || 'agent')} on WhatsApp ${escapeHtml(display)}">
    <span class="material-symbols-rounded" style="font-size:.9rem;">chat</span> ${escapeHtml(btnLabel)}
  </button>`;
}

function adminAgentWaButton(a, label = 'WhatsApp') {
  const phone = a?.phone || '';
  const display = formatPhoneDisplay(phone);
  if (!toWhatsAppIntl(phone)) return '';
  return `<button type="button" class="agr-btn wa" onclick="openAdminAgentApplicationWhatsApp('${a.id}')" title="Open ${escapeHtml(a.name || 'agent')}'s WhatsApp: ${escapeHtml(display)}">
    <span class="material-symbols-rounded" style="font-size:.9rem;">chat</span> ${escapeHtml(label)} ${escapeHtml(display)}
  </button>`;
}

// ── PHOTO URLS ──
function resolveListingPhotoUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) {
    const base = (typeof window !== 'undefined' && window.location?.origin)
      ? window.location.origin.replace(/\/$/, '')
      : 'http://localhost:3000';
    return `${base}${trimmed}`;
  }
  return trimmed;
}

// ── PHOTO GALLERY ──
const photoGalleries = {};
let lightboxState = { photos: [], index: 0 };

function normalizePhotos(photos) {
  return (photos || []).map(resolveListingPhotoUrl).filter(Boolean);
}

function registerListingPhotos(key, photos) {
  const items = normalizePhotos(photos);
  if (items.length) photoGalleries[key] = items;
  return items;
}

function listingPhotoGalleryHtml(photos, galleryId, opts = {}) {
  const items = registerListingPhotos(galleryId, photos);
  if (!items.length) return opts.emptyHtml || '';
  const multi = items.length > 1;
  const compact = !!opts.compact;
  const showThumbs = multi && opts.thumbs !== false && !compact;
  const showDots = multi && compact;
  const alt = escapeHtml(opts.alt || 'Listing photo');
  const cls = `photo-gallery${compact ? ' compact' : ''}${opts.detail ? ' detail' : ''}`;

  return `
    <div class="${cls}" data-gallery-id="${galleryId}" data-index="0">
      <div class="pg-stage">
        ${multi ? `<button type="button" class="pg-nav pg-prev" onclick="event.stopPropagation();photoGalleryNav('${galleryId}',-1)" aria-label="Previous photo">
          <span class="material-symbols-rounded">chevron_left</span></button>` : ''}
        <img class="pg-main" src="${items[0]}" alt="${alt}" ${multi ? `onclick="event.stopPropagation();openPhotoLightbox(photoGalleries['${galleryId}'], parseInt(this.closest('[data-gallery-id]').dataset.index||'0',10))"` : ''}>
        ${multi ? `<button type="button" class="pg-nav pg-next" onclick="event.stopPropagation();photoGalleryNav('${galleryId}',1)" aria-label="Next photo">
          <span class="material-symbols-rounded">chevron_right</span></button>` : ''}
        ${multi ? `<div class="pg-counter">1 / ${items.length}</div>` : ''}
        ${opts.overlayHtml || ''}
      </div>
      ${showThumbs ? `<div class="pg-thumbs">${items.map((url, i) =>
        `<button type="button" class="pg-thumb${i === 0 ? ' on' : ''}" onclick="event.stopPropagation();photoGalleryGo('${galleryId}',${i})">
          <img src="${url}" alt="Photo ${i + 1}">
        </button>`).join('')}</div>` : ''}
      ${showDots ? `<div class="pg-dots">${items.map((_, i) =>
        `<button type="button" class="pg-dot${i === 0 ? ' on' : ''}" onclick="event.stopPropagation();photoGalleryGo('${galleryId}',${i})" aria-label="Photo ${i + 1}"></button>`).join('')}</div>` : ''}
    </div>`;
}

function photoGalleryGo(id, index) {
  const photos = photoGalleries[id];
  if (!photos?.length) return;
  const i = ((index % photos.length) + photos.length) % photos.length;
  const root = document.querySelector(`[data-gallery-id="${id}"]`);
  if (!root) return;
  root.dataset.index = String(i);
  const main = root.querySelector('.pg-main');
  if (main) {
    main.src = photos[i];
    main.alt = `Photo ${i + 1} of ${photos.length}`;
  }
  const counter = root.querySelector('.pg-counter');
  if (counter) counter.textContent = `${i + 1} / ${photos.length}`;
  root.querySelectorAll('.pg-thumb').forEach((t, idx) => t.classList.toggle('on', idx === i));
  root.querySelectorAll('.pg-dot').forEach((t, idx) => t.classList.toggle('on', idx === i));
}

function photoGalleryNav(id, delta) {
  const root = document.querySelector(`[data-gallery-id="${id}"]`);
  const cur = parseInt(root?.dataset.index || '0', 10);
  photoGalleryGo(id, cur + delta);
}

function openPhotoLightbox(photos, startIndex = 0) {
  const items = normalizePhotos(photos);
  if (!items.length) return;
  lightboxState = {
    photos: items,
    index: Math.max(0, Math.min(startIndex, items.length - 1)),
  };
  let lb = document.getElementById('kr-photo-lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'kr-photo-lightbox';
    lb.className = 'photo-lightbox';
    lb.innerHTML = `
      <button type="button" class="plb-close" onclick="closePhotoLightbox()" aria-label="Close">
        <span class="material-symbols-rounded">close</span>
      </button>
      <button type="button" class="plb-nav plb-prev" onclick="lightboxNav(-1)" aria-label="Previous">
        <span class="material-symbols-rounded">chevron_left</span>
      </button>
      <img class="plb-main" alt="Listing photo">
      <button type="button" class="plb-nav plb-next" onclick="lightboxNav(1)" aria-label="Next">
        <span class="material-symbols-rounded">chevron_right</span>
      </button>
      <div class="plb-counter"></div>
      <div class="plb-thumbs"></div>`;
    lb.addEventListener('click', (e) => { if (e.target === lb) closePhotoLightbox(); });
    document.body.appendChild(lb);
    document.addEventListener('keydown', lightboxKeydown);
  }
  renderLightbox();
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closePhotoLightbox() {
  document.getElementById('kr-photo-lightbox')?.classList.remove('open');
  document.body.style.overflow = '';
}

function lightboxNav(delta) {
  const n = lightboxState.photos.length;
  if (n < 2) return;
  lightboxState.index = (lightboxState.index + delta + n) % n;
  renderLightbox();
}

function lightboxGo(index) {
  lightboxState.index = index;
  renderLightbox();
}

function renderLightbox() {
  const lb = document.getElementById('kr-photo-lightbox');
  if (!lb) return;
  const { photos, index } = lightboxState;
  const multi = photos.length > 1;
  lb.querySelector('.plb-main').src = photos[index];
  lb.querySelector('.plb-counter').textContent = `${index + 1} / ${photos.length}`;
  lb.querySelector('.plb-prev').style.display = multi ? '' : 'none';
  lb.querySelector('.plb-next').style.display = multi ? '' : 'none';
  const thumbs = lb.querySelector('.plb-thumbs');
  thumbs.innerHTML = multi
    ? photos.map((url, i) =>
      `<button type="button" class="plb-thumb${i === index ? ' on' : ''}" onclick="lightboxGo(${i})"><img src="${url}" alt=""></button>`
    ).join('')
    : '';
}

function lightboxKeydown(e) {
  const lb = document.getElementById('kr-photo-lightbox');
  if (!lb?.classList.contains('open')) return;
  if (e.key === 'Escape') closePhotoLightbox();
  if (e.key === 'ArrowLeft') lightboxNav(-1);
  if (e.key === 'ArrowRight') lightboxNav(1);
}

function listingPhotoThumbHtml(photos, key, opts = {}) {
  const items = registerListingPhotos(key, photos);
  if (!items.length) {
    return opts.emptyHtml || `<div class="pg-thumb-empty"><span class="material-symbols-rounded">image</span></div>`;
  }
  const count = items.length > 1
    ? `<span class="pg-stack-count">${items.length}</span>`
    : '';
  return `<button type="button" class="pg-thumb-btn" onclick="event.stopPropagation();openPhotoLightbox(photoGalleries['${key}'],0)" title="View all photos" aria-label="View all ${items.length} photos">
    <img src="${items[0]}" alt="">
    ${count}
  </button>`;
}

// ── GPS ──
function getGPS() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve({ lat: null, lng: null, acc: null });
    navigator.geolocation.getCurrentPosition(
      p => resolve({
        lat: p.coords.latitude.toFixed(6),
        lng: p.coords.longitude.toFixed(6),
        acc: Math.round(p.coords.accuracy) + 'm',
      }),
      () => resolve({ lat: null, lng: null, acc: null }),
      { timeout: 5500, maximumAge: 60000 }
    );
  });
}

function getDevice() {
  if (/android/i.test(navigator.userAgent)) return 'Android';
  if (/iphone|ipad/i.test(navigator.userAgent)) return 'iOS';
  return 'Desktop';
}

function digitsOnly(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function normalizeNigerianPhone(phone) {
  const d = digitsOnly(phone);
  if (/^0[789]\d{9}$/.test(d)) return d;
  if (/^234[789]\d{9}$/.test(d)) return `0${d.slice(3)}`;
  if (/^[789]\d{9}$/.test(d)) return `0${d}`;
  return null;
}

function isNigerianWhatsAppPhone(phone) {
  return !!normalizeNigerianPhone(phone);
}

function toWhatsAppIntl(phone) {
  const local = normalizeNigerianPhone(phone);
  if (!local) return null;
  return `234${local.slice(1)}`;
}

// ── THEME (client preference only) ──
function applyTheme() {
  const theme = localStorage.getItem('kr6_theme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.getElementById('theme-icon') || document.getElementById('theme-icon-app');
  if (icon) icon.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
}

function toggleTheme() {
  const current = localStorage.getItem('kr6_theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('kr6_theme', next);
  document.documentElement.setAttribute('data-theme', next);
  const icon = document.getElementById('theme-icon') || document.getElementById('theme-icon-app');
  if (icon) {
    icon.style.animation = 'spinOnce 300ms var(--ease) both';
    icon.textContent = next === 'dark' ? 'light_mode' : 'dark_mode';
    setTimeout(() => { icon.style.animation = ''; }, 320);
  }
}

function animateCount(el, target) {
  if (!el) return;
  let current = 0;
  const step = Math.max(1, Math.floor(target / 20));
  const interval = setInterval(() => {
    current = Math.min(current + step, target);
    el.textContent = current;
    if (current >= target) clearInterval(interval);
  }, 40);
}
