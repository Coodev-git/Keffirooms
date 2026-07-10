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
}

async function renderAdmin() {
  try {
    const [pending, agents] = await Promise.all([
      API.admin.pendingListings(),
      API.admin.pendingAgents(),
    ]);
    adminState.pendingListings = pending.listings || [];
    adminState.pendingAgents = agents.agents || [];
    const tcQ = document.getElementById('tc-q');
    if (tcQ) tcQ.textContent = adminState.pendingListings.length;
    const tcAg = document.getElementById('tc-ag');
    if (tcAg) tcAg.textContent = adminState.pendingAgents.length;
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
