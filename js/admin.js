/* ═══════════════════════════════════════
   KEFFIROOMS — ADMIN.JS
   Admin panel — API-backed
═══════════════════════════════════════ */

let adminState = {
  pendingListings: [],
  allListings: [],
  pendingAgents: [],
  approvedAgents: [],
  deniedAgents: [],
};

function adminIsMaster() {
  return isMasterAdminSession(getSession());
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await requireAuthAsync('admin');
  if (!session) return;
  await initPlatform();
  applyTheme();
  setupDualRolePortal('admin');
  await renderAdmin();
});

function admTab(tab, el) {
  document.querySelectorAll('.adm-tab').forEach(t => t.classList.remove('on'));
  el.classList.add('on');
  document.querySelectorAll('.adm-panel').forEach(p => p.classList.remove('on'));
  document.getElementById('adm-panel-' + tab).classList.add('on');
  if (tab === 'queue') renderAuditQueue();
  if (tab === 'kpi') renderKPI();
  if (tab === 'agents') renderAgentRequests();
  if (tab === 'activity') renderActivity();
  if (tab === 'fees') renderFeeTracker();
  if (tab === 'all') renderAllListings();
  if (tab === 'users') renderUsers();
  if (tab === 'hsbookings') renderHotelBookings();
  if (tab === 'hshotels') renderHotelManager();
}

async function renderAdmin() {
  try {
    const [pending, agents, hsBookings] = await Promise.all([
      API.admin.pendingListings(),
      API.admin.pendingAgents(),
      API.admin.hotelBookings('pending').catch(() => ({ bookings: [] })),
    ]);
    adminState.pendingListings = pending.listings || [];
    adminState.pendingAgents = agents.agents || [];
    const tcQ = document.getElementById('tc-q');
    if (tcQ) tcQ.textContent = adminState.pendingListings.length;
    const tcAg = document.getElementById('tc-ag');
    if (tcAg) tcAg.textContent = adminState.pendingAgents.length;
    const tcHs = document.getElementById('tc-hs');
    if (tcHs) tcHs.textContent = (hsBookings.bookings || []).length;
  } catch (e) {
    showToast('Failed to load admin data');
  }
  renderAuditQueue();
}

function renderAuditQueue() {
  updateTrustStats();
  const panel = document.getElementById('pq-list');
  if (!panel) return;
  const pending = adminState.pendingListings.length
    ? adminState.pendingListings
    : [];

  if (!pending.length) {
    API.admin.pendingListings().then(d => {
      adminState.pendingListings = d.listings || [];
      renderAuditQueueInner(adminState.pendingListings, panel);
    }).catch(() => renderAuditQueueInner([], panel));
    return;
  }
  renderAuditQueueInner(pending, panel);
}

function renderAuditQueueInner(pending, panel) {
  if (!pending.length) {
    panel.innerHTML = `<div class="empty" style="padding:20px 16px;">
      <span class="material-symbols-rounded" style="font-size:3rem;color:var(--em);">check_circle</span>
      <p>All clear — no pending audits.</p>
    </div>`;
    return;
  }

  panel.innerHTML = pending.map((l, i) => {
    const meta = l.photoMetadata && l.photoMetadata[0];
    return `<div class="pq-card" style="animation-delay:${i * 60}ms">
      <div class="pqc-img">
        ${listingPhotoGalleryHtml(l.photos, `adm-pq-${l.id}`, {
          compact: true,
          alt: l.title,
          emptyHtml: `<div class="pqc-img-ph"><span class="material-symbols-rounded" style="font-size:2rem;">image_not_supported</span></div>`,
        })}
      </div>
      <div class="pqc-body">
        <div class="pqc-status-row">
          <span class="pqc-s-tag">PENDING VERIFICATION</span>
          ${l.serialNumber ? `<span class="listing-tag">${formatListingTag(l.serialNumber)}</span>` : ''}
          <span class="pqc-distance">${escapeHtml(l.distance || '')}</span>
        </div>
        <div class="pqc-title">${escapeHtml(l.title)}</div>
        <div class="pqc-desc">${escapeHtml(l.description || 'No description.')}</div>
        <div class="pqc-meta">
          <div class="pqc-meta-row">
            <span class="material-symbols-rounded" style="font-size:.85rem;color:var(--teal-l);">location_on</span>
            ${escapeHtml(l.area)}, Keffi &nbsp;
            <span class="material-symbols-rounded" style="font-size:.85rem;color:var(--teal-l);">payments</span>
            N${fmtN(l.price)}/yr
          </div>
          <div class="pqc-meta-row">
            <span class="material-symbols-rounded" style="font-size:.85rem;color:var(--teal-l);">person</span>
            ${escapeHtml(l.agentName)}
            ${l.agentTrustScore != null ? trustScoreBadgeHtml(l.agentTrustScore, l.agentTrustLabel, { compact: true }) : ''}
            ${getAgentPhoneFromListing(l) && toWhatsAppIntl(getAgentPhoneFromListing(l))
              ? `<a class="pqc-agent-wa" href="${agentWhatsAppUrl(getAgentPhoneFromListing(l), `Hi ${l.agentName}, KeffiRooms admin regarding listing ${formatListingTag(l.serialNumber)}.`)}"
                  target="_blank" rel="noopener" onclick="event.stopPropagation()"
                  title="Agent WhatsApp">${escapeHtml(formatPhoneDisplay(getAgentPhoneFromListing(l)))}</a>`
              : ` (${escapeHtml(getAgentPhoneFromListing(l) || '—')})`}
          </div>
        </div>
        ${meta ? `<div class="pqc-seal"><strong>Seal Metadata Check</strong>
GPS: ${meta.gps_lat ? `${meta.gps_lat} N, ${meta.gps_lng} E` : 'No GPS'}
Hardware: ${escapeHtml(meta.device || 'Unknown')}</div>`
          : `<div class="pqc-seal" style="color:var(--gold-l);">No metadata — verify manually.</div>`}
        <div class="pqc-actions">
          ${adminListingWaButton(l, `WhatsApp ${formatPhoneDisplay(getAgentPhoneFromListing(l))}`)}
          <button class="btn-verify-pub" onclick="adminAction('${l.id}','verified')">
            <span class="material-symbols-rounded" style="font-size:1rem;">verified</span>
            Verify &amp; Publish
          </button>
          ${adminIsMaster() ? `<button class="btn-reject-flag" onclick="adminAction('${l.id}','rejected')">
            <span class="material-symbols-rounded" style="font-size:1rem;">cancel</span>
            Reject/Flag Scam
          </button>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

async function adminAction(id, status) {
  const listing = findAdminListing(id);
  try {
    await API.admin.setListingStatus(id, status);
    adminState.pendingListings = adminState.pendingListings.filter(l => l.id !== id);
    if (listing) {
      const idx = adminState.allListings.findIndex(l => l.id === id);
      if (idx >= 0) adminState.allListings[idx] = { ...listing, status };
    }
    await renderAdmin();
    if (status === 'verified' && listing) {
      showToast(`${formatListingTag(listing.serialNumber)} verified and published — agent will see it on their hub`);
    } else if (status === 'rejected' && listing) {
      showToast(`${formatListingTag(listing.serialNumber)} rejected`);
    } else if (status === 'unavailable' && listing) {
      showToast(`${formatListingTag(listing.serialNumber)} hidden from seekers`);
    } else {
      showToast('Listing updated');
    }
  } catch (e) {
    showToast(e.message || 'Action failed');
  }
}

function findAdminListing(id) {
  return adminState.pendingListings.find(l => l.id === id)
    || adminState.allListings.find(l => l.id === id);
}

function openAdminAgentWhatsApp(listingId) {
  const l = findAdminListing(listingId);
  if (!l) {
    showToast('Listing not found');
    return;
  }
  const phone = getAgentPhoneFromListing(l);
  const url = agentWhatsAppUrl(phone, listingAdminAgentMessage(l));
  if (!url) {
    showToast(`No valid WhatsApp for ${l.agentName || 'agent'} (${formatPhoneDisplay(phone)})`);
    return;
  }
  window.open(url, '_blank', 'noopener');
}

function openAdminAgentApplicationWhatsApp(agentId) {
  const a = adminState.pendingAgents.find(x => x.id === agentId)
    || adminState.approvedAgents.find(x => x.id === agentId)
    || adminState.deniedAgents.find(x => x.id === agentId);
  if (!a) {
    showToast('Agent not found');
    return;
  }
  const url = agentWhatsAppUrl(
    a.phone,
    `Hi ${a.name}, this is KeffiRooms admin regarding your agent application.`
  );
  if (!url) {
    showToast(`No valid WhatsApp for ${a.name} (${formatPhoneDisplay(a.phone)})`);
    return;
  }
  window.open(url, '_blank', 'noopener');
}

function updateTrustStats() {
  const total = adminState.allListings.length || adminState.pendingListings.length;
  const verified = (adminState.allListings || []).filter(l => l.status === 'verified').length;
  const pending = adminState.pendingListings.length;
  const verEl = document.getElementById('ts-verified');
  if (verEl) verEl.textContent = verified;
  const pndEl = document.getElementById('ts-pending');
  if (pndEl) pndEl.textContent = pending;
}

async function renderAgentRequests() {
  try {
    const [pending, approved, denied] = await Promise.all([
      API.admin.pendingAgents(),
      API.admin.approvedAgents(),
      API.admin.deniedAgents(),
    ]);
    adminState.pendingAgents = pending.agents || [];
    adminState.approvedAgents = approved.agents || [];
    adminState.deniedAgents = denied.agents || [];
  } catch { /* ignore */ }

  const pp = document.getElementById('adm-agent-pending');
  const ap = document.getElementById('adm-agent-approved');
  if (pp) {
    pp.innerHTML = adminState.pendingAgents.length
      ? adminState.pendingAgents.map(a => agentReqCard(a, 'pending')).join('')
      : '<div style="padding:10px 0;font-size:.8rem;color:var(--t4);">None pending.</div>';
  }
  if (ap) {
    ap.innerHTML = adminState.approvedAgents.length
      ? adminState.approvedAgents.map(a => agentReqCard(a, 'approved')).join('')
      : '<div style="padding:10px 0;font-size:.8rem;color:var(--t4);">No approved agents yet.</div>';
  }
}

function agentReqCard(a, status) {
  const phoneOk = isNigerianWhatsAppPhone(a.phone);
  const waBtn = adminAgentWaButton(a);
  return `<div class="agr-card">
    <div class="agr-top">
      <div class="agr-name-row">
        <span class="agr-name">${escapeHtml(a.name)}</span>
        ${a.trustScore != null ? trustScoreBadgeHtml(a.trustScore, a.trustLabel) : ''}
      </div>
      <span class="agr-time">${fmtDate(a.at)}</span>
    </div>
    <div class="agr-phone">
      <span class="material-symbols-rounded" style="font-size:.85rem;color:var(--teal-l);">phone</span>
      ${escapeHtml(a.phone || '—')}
      ${!phoneOk ? '<span class="agr-warn">Not a valid WhatsApp number</span>' : ''}
    </div>
    ${a.email ? `<div class="agr-phone">
      <span class="material-symbols-rounded" style="font-size:.85rem;color:var(--teal-l);">mail</span>
      ${escapeHtml(a.email)}
    </div>` : ''}
    <div class="agr-contact">
      ${waBtn}
      ${a.email ? `<a class="agr-btn em" href="mailto:${encodeURIComponent(a.email)}?subject=${encodeURIComponent('KeffiRooms Agent Application')}" target="_blank" rel="noopener">
        <span class="material-symbols-rounded" style="font-size:.9rem;">mail</span> Email
      </a>` : ''}
    </div>
    <div class="agr-actions">
      ${status === 'pending' ? `
        <button class="btn-approve" onclick="approveAgent('${a.id}')">
          <span class="material-symbols-rounded" style="font-size:.85rem;">check</span> Approve
        </button>
        <button class="btn-deny" onclick="denyAgent('${a.id}')">
          <span class="material-symbols-rounded" style="font-size:.85rem;">close</span> Deny
        </button>` : (a.isAdmin
        ? `<span style="font-size:.72rem;color:#A78BFA;font-weight:600;padding:8px 0;display:block;">Promoted — agent hub + admin access</span>`
        : (adminIsMaster()
          ? `<button class="btn-promote" onclick="promoteAgent('${a.id}')">
          <span class="material-symbols-rounded" style="font-size:.85rem;">shield</span> Make Admin
        </button>`
          : '')) + (adminIsMaster()
        ? `<button class="btn-deny" onclick="denyAgent('${a.id}')">
          <span class="material-symbols-rounded" style="font-size:.85rem;">block</span> Revoke
        </button>`
        : '')}
    </div>
  </div>`;
}

async function approveAgent(id) {
  try {
    const r = await API.admin.setAgentStatus(id, 'approved');
    showToast((r.name || 'Agent') + ' approved');
    await renderAdmin();
    renderAgentRequests();
  } catch (e) { showToast(e.message); }
}

async function denyAgent(id) {
  try {
    await API.admin.setAgentStatus(id, 'denied');
    showToast('Agent denied');
    renderAgentRequests();
  } catch (e) { showToast(e.message); }
}

async function promoteAgent(id) {
  try {
    await API.admin.promoteAgent(id);
    showToast('Agent promoted — they can list rooms and use the admin panel');
    renderAgentRequests();
  } catch (e) { showToast(e.message); }
}

async function renderAllListings() {
  const c = document.getElementById('adm-all-list');
  if (!c) return;
  try {
    const data = await API.admin.allListings();
    adminState.allListings = data.listings || [];
  } catch {
    adminState.allListings = [];
  }
  filterAdminListings();
}

function filterAdminListings() {
  const c = document.getElementById('adm-all-list');
  if (!c) return;
  const q = (document.getElementById('adm-listing-search')?.value || '').trim().toLowerCase();
  let items = adminState.allListings;

  if (q) {
    const serial = parseListingSerial(q);
    items = items.filter((l) => {
      if (serial) return l.serialNumber === serial;
      const tag = formatListingTag(l.serialNumber).toLowerCase();
      return tag.includes(q)
        || (l.title || '').toLowerCase().includes(q)
        || (l.area || '').toLowerCase().includes(q)
        || String(l.serialNumber || '').includes(q);
    });
  }

  if (!items.length) {
    c.innerHTML = `<div class="empty"><p>${q ? 'No listings match your search.' : 'No listings yet.'}</p></div>`;
    return;
  }

  c.innerHTML = items.map(l => `
    <div class="all-listing-row">
      <div class="alr-top">
        <div class="alr-thumb">
          ${listingPhotoThumbHtml(l.photos, `adm-alr-${l.id}`)}
        </div>
        <div class="alr-info">
          <div class="alr-title">
            ${l.serialNumber ? `<span class="listing-tag">${formatListingTag(l.serialNumber)}</span> ` : ''}
            ${escapeHtml(l.title)}
          </div>
          <div class="alr-meta">
            N${fmtN(l.price)}/yr · ${escapeHtml(l.area)} · ${escapeHtml(l.agentName || '')}
            ${l.agentTrustScore != null ? trustScoreBadgeHtml(l.agentTrustScore, l.agentTrustLabel, { compact: true }) : ''}
          </div>
          <span class="sbadge ${l.status}">${l.status.toUpperCase()}</span>
        </div>
      </div>
      <div class="alr-contact">${adminListingWaButton(l)}</div>
      <div class="alr-actions">
        ${l.status !== 'verified' ? `<button class="btn-alr-v" onclick="adminAction('${l.id}','verified')">Verify &amp; Publish</button>` : ''}
        ${adminIsMaster() && l.status !== 'rejected' ? `<button class="btn-alr-r" onclick="adminAction('${l.id}','rejected')">Reject</button>` : ''}
        ${adminIsMaster() && ['verified', 'pending'].includes(l.status)
          ? `<button class="btn-alr-u" onclick="adminAction('${l.id}','unavailable')">Unlist</button>`
          : ''}
        ${adminIsMaster() && l.status === 'unavailable'
          ? `<button class="btn-alr-v" onclick="adminAction('${l.id}','pending')">Relist</button>`
          : ''}
      </div>
    </div>`).join('');
}

async function lookupListingBySerial() {
  const input = document.getElementById('adm-listing-search');
  const serial = parseListingSerial(input?.value || '');
  if (!serial) {
    filterAdminListings();
    return;
  }
  try {
    const data = await API.listings.bySerial(serial);
    if (data.listing) {
      const exists = adminState.allListings.some(l => l.id === data.listing.id);
      if (!exists) adminState.allListings.unshift(data.listing);
      filterAdminListings();
    }
  } catch {
    filterAdminListings();
  }
}

async function renderUsers() {
  const c = document.getElementById('adm-users-list');
  if (!c) return;
  try {
    const data = await API.admin.users();
    const all = data.users || [];
    if (!all.length) {
      c.innerHTML = `<div class="empty"><p>No users yet.</p></div>`;
      return;
    }
    c.innerHTML = all.map(u => `
      <div class="agr-card">
        <div class="agr-top"><span class="agr-name">${escapeHtml(u.name || u.phone)}</span><span class="agr-time">${u.role}</span></div>
        <div class="agr-phone">${escapeHtml(u.phone || '')}</div>
      </div>`).join('');
  } catch {
    c.innerHTML = `<div class="empty"><p>Could not load users.</p></div>`;
  }
}

async function renderKPI() {
  try {
    const [kpi, denied] = await Promise.all([
      API.admin.kpi(),
      API.admin.deniedAgents(),
    ]);
    const el = (id, v) => { const e = document.getElementById(id); if (e) animateCount(e, v); };
    el('kpi-total', kpi.total_listings || 0);
    el('kpi-verified', kpi.verified || 0);
    el('kpi-agents', kpi.agents || 0);
    el('kpi-seekers', kpi.seekers || 0);
    const sv = document.getElementById('sv-amount');
    if (sv) sv.textContent = '₦' + fmtN((kpi.verified_value || 0) * 2);

    const banned = denied.agents || [];
    const bl = document.getElementById('banned-agents-list');
    if (bl && banned.length) {
      bl.innerHTML = `<div style="font-size:.72rem;font-weight:700;color:var(--red);margin-bottom:6px;">Blacklisted (${banned.length})</div>` +
        banned.map(a => `<div class="ban-item">${escapeHtml(a.name)} — ${escapeHtml(a.phone)}</div>`).join('');
    }
  } catch { /* ignore */ }
}

async function renderActivity() {
  const log = document.getElementById('activity-log');
  if (!log) return;
  try {
    const data = await API.admin.activity();
    const events = data.events || [];
    if (!events.length) {
      log.innerHTML = '<div style="font-size:.78rem;color:var(--t4);">No activity yet.</div>';
      return;
    }
    log.innerHTML = events.map((e, i) => `
      <div class="activity-item" style="animation-delay:${i * 30}ms">
        <div class="activity-dot ${e.type}"></div>
        <div class="activity-text">${escapeHtml(e.text)}</div>
        <div class="activity-time">${fmtDateTime(e.time)}</div>
      </div>`).join('');
  } catch {
    log.innerHTML = '<div style="color:var(--t4);">Failed to load activity.</div>';
  }
}

async function renderFeeTracker() {
  try {
    const data = await API.admin.fees();
    const fees = data.fees || PLATFORM_FEES;
    const fc = document.getElementById('ft-connections');
    if (fc) fc.textContent = data.connections || 0;
    const fp = document.getElementById('ft-pending-n');
    if (fp) fp.textContent = data.pending || 0;
    const ft = document.getElementById('ft-total');
    if (ft) ft.textContent = '₦' + fmtN(data.totalEstimated || 0);
    const fs = document.getElementById('ft-seeker-fee');
    if (fs) fs.textContent = '₦' + fmtN(fees.seeker || 2000);
    const fa = document.getElementById('ft-agent-fee');
    if (fa) fa.textContent = '₦' + fmtN(fees.agent || 5000);
    const fpc = document.getElementById('ft-per-connection');
    if (fpc) fpc.textContent = '₦' + fmtN(fees.totalPerConnection || (fees.seeker + fees.agent) || 7000);

    const rl = document.getElementById('reviews-list');
    const reviews = data.reviews || [];
    if (rl) {
      if (!reviews.length) {
        rl.innerHTML = '<div style="font-size:.78rem;color:var(--t4);">No reviews yet.</div>';
        return;
      }
      rl.innerHTML = reviews.map((r, i) => `
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r-xl);padding:14px;margin-bottom:10px;">
          <div style="color:var(--gold-l);">${'★'.repeat(r.rating)}</div>
          ${r.comment ? `<div style="font-size:.78rem;color:var(--t2);">${escapeHtml(r.comment)}</div>` : ''}
        </div>`).join('');
    }
  } catch { /* ignore */ }
}

function collectFees() {
  API.admin.fees().then(data => {
    const fees = data.fees || PLATFORM_FEES;
    const msg = encodeURIComponent(
      `KeffiRooms Fee Collection\nConnections: ${data.connections}\nSeeker fee: ₦${fmtN(fees.seeker)} each\nAgent fee: ₦${fmtN(fees.agent)} each\nEstimated total: ₦${fmtN(data.totalEstimated || 0)}`
    );
    window.open(`https://wa.me/${ADMIN_WA}?text=${msg}`, '_blank');
  });
}

/* ═══════════════════════════════════════
   HotelSpace (hotel_*) admin
═══════════════════════════════════════ */

let hotelAdminState = { hotels: [], bookings: [] };

function fmtHsDate(d) {
  if (!d) return '—';
  return String(d).slice(0, 10);
}

async function renderHotelBookings() {
  const list = document.getElementById('hs-bookings-list');
  if (!list) return;
  list.innerHTML = '<div style="padding:16px;color:var(--t3);font-size:.8rem;">Loading bookings…</div>';
  const status = document.getElementById('hs-booking-filter')?.value || '';
  try {
    const data = await API.admin.hotelBookings(status || undefined);
    hotelAdminState.bookings = data.bookings || [];
    const pendingCount = hotelAdminState.bookings.filter((b) => b.status === 'pending').length;
    const tc = document.getElementById('tc-hs');
    if (tc && !status) tc.textContent = pendingCount;
    if (!hotelAdminState.bookings.length) {
      list.innerHTML = '<div class="empty" style="padding:24px 16px;text-align:center;color:var(--t3);">No bookings yet.</div>';
      return;
    }
    list.innerHTML = hotelAdminState.bookings.map((b) => {
      const actions = [];
      if (b.status === 'pending') {
        actions.push(`<button type="button" class="hs-btn-teal" onclick="setHotelBookingStatus('${b.id}','payment_confirmed')">Mark payment confirmed</button>`);
      }
      if (b.status === 'payment_confirmed' || b.status === 'hotel_contacted') {
        const contactMsg = [
          'KeffiRooms HotelSpace reservation request',
          `Code: ${b.bookingCode}`,
          `Room: ${b.roomType}`,
          `Check-in: ${fmtHsDate(b.requestedCheckinDate)}`,
          `Check-out: ${fmtHsDate(b.requestedCheckoutDate)}`,
          `Guest name: ${b.studentName}`,
          '',
          'Please confirm if this room is available. Reply YES or NO.',
        ].join('\n');
        const wa = b.managerWa
          ? `https://wa.me/${b.managerWa}?text=${encodeURIComponent(contactMsg)}`
          : '';
        if (wa) {
          actions.push(`<a class="hs-btn-wa" href="${wa}" target="_blank" rel="noopener">Contact hotel</a>`);
        }
        if (b.status === 'payment_confirmed') {
          actions.push(`<button type="button" class="hs-btn-gold" onclick="setHotelBookingStatus('${b.id}','hotel_contacted')">Mark hotel contacted</button>`);
        }
        actions.push(`<button type="button" class="hs-btn-teal" onclick="setHotelBookingStatus('${b.id}','confirmed')">Mark confirmed</button>`);
      }
      if (!['expired', 'cancelled', 'confirmed'].includes(b.status)) {
        actions.push(`<button type="button" class="hs-btn-ghost" onclick="setHotelBookingStatus('${b.id}','cancelled')">Cancel</button>`);
      }
      return `<div class="hs-adm-card">
        <div class="hs-adm-card-title">${escapeHtml(b.bookingCode)} · ${escapeHtml(b.hotelName || '')}</div>
        <div class="hs-adm-meta">
          <span class="hs-status ${escapeHtml(b.status)}">${escapeHtml(b.status.replace(/_/g, ' '))}</span>
          · ${escapeHtml(b.roomType)} · ${fmtHsDate(b.requestedCheckinDate)} → ${fmtHsDate(b.requestedCheckoutDate)}
          · Guest: ${escapeHtml(b.studentName)} (${escapeHtml(b.studentPhone || '')})
          · Expires: ${fmtHsDate(b.expiresAt)}
        </div>
        <div class="hs-adm-actions">${actions.join('')}</div>
      </div>`;
    }).join('');
  } catch (e) {
    list.innerHTML = `<div style="padding:16px;color:var(--red);font-size:.8rem;">${escapeHtml(e.message || 'Failed to load')}</div>`;
  }
}

async function setHotelBookingStatus(id, status) {
  try {
    const { booking } = await API.admin.setHotelBookingStatus(id, status);
    showToast(`Booking ${booking.bookingCode} → ${status.replace(/_/g, ' ')}`);
    if ((status === 'payment_confirmed' || status === 'hotel_contacted') && booking.contactHotelWhatsappUrl) {
      // Prefer manual click of Contact Hotel; still open when marking payment confirmed
      if (status === 'payment_confirmed') {
        window.open(booking.contactHotelWhatsappUrl, '_blank', 'noopener');
      }
    }
    await renderHotelBookings();
  } catch (e) {
    showToast(e.message || 'Update failed');
  }
}

async function renderHotelManager() {
  const list = document.getElementById('hs-hotels-list');
  const ownersEl = document.getElementById('hs-owners-pending');
  if (ownersEl) {
    ownersEl.innerHTML = '<div style="padding:0 16px;color:var(--t3);font-size:.78rem;">Loading registrations…</div>';
    try {
      const { owners } = await API.admin.pendingHotelOwners();
      const tc = document.getElementById('tc-ho');
      if (tc) tc.textContent = (owners || []).length;
      if (!owners?.length) {
        ownersEl.innerHTML = '<div style="padding:0 16px 8px;font-size:.76rem;color:var(--t4);">No pending hotel owners.</div>';
      } else {
        ownersEl.innerHTML = owners.map((o) => {
          const wa = o.wa ? `https://wa.me/${o.wa}?text=${encodeURIComponent(
            `Hello ${o.name}, this is KeffiRooms admin. We received your hotel registration for "${o.hotelName}" in ${o.area || 'Keffi'}. Please confirm you are available for a quick verification.`
          )}` : '';
          return `<div class="hs-adm-card">
            <div class="hs-adm-card-title">${escapeHtml(o.hotelName || o.name)}</div>
            <div class="hs-adm-meta">
              Owner: ${escapeHtml(o.name)} · ${escapeHtml(o.phone || '')} · ${escapeHtml(o.email || '')}<br>
              Area: ${escapeHtml(o.area || '—')} · Landmark: ${escapeHtml(o.landmark || '—')}<br>
              Pin: ${o.pinLat != null ? `${o.pinLat}, ${o.pinLng}` : 'missing'} ${o.pinAcc ? `(±${escapeHtml(o.pinAcc)})` : ''}<br>
              Label: ${escapeHtml(o.locationAddress || '—')}<br>
              ₦${fmtN(o.priceRangeMin)}–₦${fmtN(o.priceRangeMax)}/night
            </div>
            <div class="hs-adm-actions">
              ${wa ? `<a class="hs-btn-wa" href="${wa}" target="_blank" rel="noopener">WhatsApp owner</a>` : ''}
              ${o.mapUrl ? `<a class="hs-btn-ghost" href="${escapeHtml(o.mapUrl)}" target="_blank" rel="noopener">Open pin on Maps</a>` : ''}
              <button type="button" class="hs-btn-teal" onclick="setHotelOwnerStatus('${o.id}','approved')">Approve</button>
              <button type="button" class="hs-btn-ghost" onclick="setHotelOwnerStatus('${o.id}','denied')">Deny</button>
            </div>
          </div>`;
        }).join('');
      }
    } catch (e) {
      ownersEl.innerHTML = `<div style="padding:0 16px;color:var(--red);font-size:.78rem;">${escapeHtml(e.message || 'Failed')}</div>`;
    }
  }

  if (!list) return;
  list.innerHTML = '<div style="padding:16px;color:var(--t3);font-size:.8rem;">Loading hotels…</div>';
  try {
    const data = await API.admin.hotels();
    hotelAdminState.hotels = data.hotels || [];
    if (!hotelAdminState.hotels.length) {
      list.innerHTML = '<div class="empty" style="padding:24px 16px;text-align:center;color:var(--t3);">No hotels yet. Click Add hotel or wait for registrations.</div>';
      return;
    }
    list.innerHTML = hotelAdminState.hotels.map((h) => {
      const rooms = (h.rooms || []).map((r) => `
        <div style="display:flex;justify-content:space-between;gap:8px;font-size:.76rem;padding:6px 0;border-top:1px solid var(--border);">
          <span>${escapeHtml(r.roomType)} · ₦${fmtN(r.price)} · ${r.isAvailable ? 'available' : 'off'}</span>
          <span>
            <button type="button" class="hs-btn-ghost" style="padding:4px 8px;" onclick="toggleHotelRoom('${r.id}', ${r.isAvailable ? 'false' : 'true'})">${r.isAvailable ? 'Disable' : 'Enable'}</button>
          </span>
        </div>`).join('');
      return `<div class="hs-adm-card">
        <div class="hs-adm-card-title">${escapeHtml(h.name)} ${h.isActive ? '' : '(inactive)'} · ${escapeHtml(h.verifyStatus || '')}</div>
        <div class="hs-adm-meta">₦${fmtN(h.priceRangeMin)}–₦${fmtN(h.priceRangeMax)} · ${escapeHtml(h.area || '')}
          · Owner: ${escapeHtml(h.ownerName || 'Admin-listed')} (${escapeHtml(h.ownerStatus || '—')})
          · Address: ${escapeHtml(h.locationAddress || '')}</div>
        <div class="hs-adm-actions">
          <button type="button" class="hs-btn-teal" onclick="openHotelForm('${h.id}')">Edit</button>
          <button type="button" class="hs-btn-gold" onclick="openRoomForm('${h.id}')">Add room</button>
          <button type="button" class="hs-btn-ghost" onclick="toggleHotelActive('${h.id}', ${h.isActive ? 'false' : 'true'})">${h.isActive ? 'Deactivate' : 'Activate'}</button>
        </div>
        <div style="margin-top:8px;">${rooms || '<div style="font-size:.74rem;color:var(--t4);">No rooms yet</div>'}</div>
      </div>`;
    }).join('');
  } catch (e) {
    list.innerHTML = `<div style="padding:16px;color:var(--red);font-size:.8rem;">${escapeHtml(e.message || 'Failed to load')}</div>`;
  }
}

async function setHotelOwnerStatus(id, status) {
  try {
    await API.admin.setHotelOwnerStatus(id, status);
    showToast(status === 'approved' ? 'Hotel owner approved — property is live' : 'Status updated');
    await renderHotelManager();
  } catch (e) {
    showToast(e.message || 'Failed');
  }
}

function closeHotelModal() {
  const bd = document.getElementById('hs-modal-backdrop');
  if (bd) bd.classList.remove('on');
}

function openHotelForm(hotelId) {
  const hotel = hotelId ? hotelAdminState.hotels.find((h) => h.id === hotelId) : null;
  const modal = document.getElementById('hs-modal');
  const bd = document.getElementById('hs-modal-backdrop');
  if (!modal || !bd) return;
  modal.innerHTML = `
    <h3>${hotel ? 'Edit hotel' : 'Add hotel'}</h3>
    <form id="hs-hotel-form" class="hs-form-grid" onsubmit="submitHotelForm(event,'${hotel ? hotel.id : ''}')">
      <label>Name <input name="name" required value="${escapeHtml(hotel?.name || '')}"></label>
      <label>Description <input name="description" value="${escapeHtml(hotel?.description || '')}"></label>
      <label>Area (public) <input name="area" value="${escapeHtml(hotel?.area || '')}"></label>
      <label>Landmark (public) <input name="landmark" value="${escapeHtml(hotel?.landmark || '')}"></label>
      <label>Exact address (hidden until payment) <input name="locationAddress" required value="${escapeHtml(hotel?.locationAddress || '')}"></label>
      <label>Price min <input name="priceRangeMin" type="number" min="0" required value="${hotel?.priceRangeMin ?? ''}"></label>
      <label>Price max <input name="priceRangeMax" type="number" min="0" required value="${hotel?.priceRangeMax ?? ''}"></label>
      <label>Rating (optional) <input name="rating" type="number" min="0" max="5" step="0.1" value="${hotel?.rating ?? ''}"></label>
      <label>Manager WhatsApp <input name="managerPhone" required value="${escapeHtml(hotel?.managerPhone || '')}"></label>
      <label>Backup phone <input name="backupPhone" value="${escapeHtml(hotel?.backupPhone || '')}"></label>
      <label>Amenities (comma-separated) <input name="amenities" value="${escapeHtml((hotel?.amenities || []).join(', '))}"></label>
      <label>Photos <input name="photos" type="file" accept="image/*" multiple></label>
      <div class="hs-adm-actions">
        <button type="submit" class="hs-btn-teal">${hotel ? 'Save' : 'Create'}</button>
        <button type="button" class="hs-btn-ghost" onclick="closeHotelModal()">Cancel</button>
      </div>
    </form>`;
  bd.classList.add('on');
}

async function submitHotelForm(event, hotelId) {
  event.preventDefault();
  const form = event.target;
  const fd = new FormData(form);
  const amenities = String(fd.get('amenities') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  fd.set('amenities', JSON.stringify(amenities));
  fd.delete('photos');
  const files = form.querySelector('input[name="photos"]')?.files;
  const out = new FormData();
  for (const [k, v] of fd.entries()) out.append(k, v);
  if (files?.length) {
    for (const f of files) out.append('photos', f);
  }
  try {
    if (hotelId) await API.admin.updateHotel(hotelId, out);
    else await API.admin.createHotel(out);
    showToast(hotelId ? 'Hotel updated' : 'Hotel created');
    closeHotelModal();
    await renderHotelManager();
  } catch (e) {
    showToast(e.message || 'Save failed');
  }
}

function openRoomForm(hotelId) {
  const modal = document.getElementById('hs-modal');
  const bd = document.getElementById('hs-modal-backdrop');
  if (!modal || !bd) return;
  modal.innerHTML = `
    <h3>Add room type</h3>
    <form class="hs-form-grid" onsubmit="submitRoomForm(event,'${hotelId}')">
      <label>Room type <input name="roomType" placeholder="single / double / deluxe" required></label>
      <label>Price / night <input name="price" type="number" min="1" required></label>
      <label>Description <input name="description"></label>
      <label>Room photos (max 4) <input name="photos" type="file" accept="image/*" multiple></label>
      <div class="hs-adm-actions">
        <button type="submit" class="hs-btn-teal">Add to shop</button>
        <button type="button" class="hs-btn-ghost" onclick="closeHotelModal()">Cancel</button>
      </div>
    </form>`;
  bd.classList.add('on');
}

async function submitRoomForm(event, hotelId) {
  event.preventDefault();
  const form = event.target;
  const fd = new FormData();
  fd.append('roomType', form.roomType.value.trim());
  fd.append('price', form.price.value);
  fd.append('description', form.description.value.trim());
  const files = form.photos?.files;
  if (files?.length) {
    for (let i = 0; i < Math.min(files.length, 4); i += 1) fd.append('photos', files[i]);
  }
  try {
    await API.admin.createHotelRoom(hotelId, fd);
    showToast('Room added');
    closeHotelModal();
    await renderHotelManager();
  } catch (e) {
    showToast(e.message || 'Failed');
  }
}

async function toggleHotelRoom(roomId, isAvailable) {
  try {
    await API.admin.updateHotelRoom(roomId, { isAvailable: isAvailable === true || isAvailable === 'true' });
    showToast('Room updated');
    await renderHotelManager();
  } catch (e) {
    showToast(e.message || 'Failed');
  }
}

async function toggleHotelActive(hotelId, isActive) {
  try {
    await API.admin.updateHotel(hotelId, { isActive: isActive === true || isActive === 'true' });
    showToast('Hotel updated');
    await renderHotelManager();
  } catch (e) {
    showToast(e.message || 'Failed');
  }
}
