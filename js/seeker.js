/* ═══════════════════════════════════════
   KEFFIROOMS — SEEKER.JS
   Unified student hub: Lodge + Short stay
═══════════════════════════════════════ */

let seekerState = {
  mode: 'lodge', // lodge | stay
  area: 'all',
  stayArea: 'all',
  vOnly: false,
  maxPrice: 500000,
  loved: new Set(),
  listings: [],
  hotels: [],
  currentListing: null,
  conversationId: null,
};

document.addEventListener('DOMContentLoaded', async () => {
  await initPlatform();
  applyTheme();
  await bootstrapAuth();
  const session = getSession();
  const chip = document.getElementById('mode-chip-label');
  if (chip) chip.textContent = session?.loggedIn ? 'Signed in' : 'Browsing';

  if (session?.loggedIn) {
    try {
      const fav = await API.social.favorites();
      seekerState.loved = new Set(fav.ids || []);
    } catch { /* guest */ }
  }

  const params = new URLSearchParams(location.search);
  const modeParam = params.get('mode');
  if (modeParam === 'stay' || modeParam === 'lodge') {
    const btn = document.getElementById(modeParam === 'stay' ? 'mode-stay' : 'mode-lodge');
    setStudentMode(modeParam, btn);
  } else {
    await renderHomeFeed();
  }
  renderProfile();
});

function setStudentMode(mode, el) {
  seekerState.mode = mode === 'stay' ? 'stay' : 'lodge';
  document.querySelectorAll('.sk-mode').forEach((b) => b.classList.remove('on'));
  if (el) el.classList.add('on');
  else {
    const fallback = document.getElementById(seekerState.mode === 'stay' ? 'mode-stay' : 'mode-lodge');
    if (fallback) fallback.classList.add('on');
  }

  const lodgeFilters = document.getElementById('lodge-filters');
  const stayFilters = document.getElementById('stay-filters');
  if (lodgeFilters) lodgeFilters.style.display = seekerState.mode === 'lodge' ? 'block' : 'none';
  if (stayFilters) stayFilters.style.display = seekerState.mode === 'stay' ? 'block' : 'none';

  const url = new URL(location.href);
  url.searchParams.set('mode', seekerState.mode);
  history.replaceState({}, '', url);

  renderHomeFeed();
}

async function renderHomeFeed() {
  if (seekerState.mode === 'stay') return renderStayFeed({ refresh: true });
  return renderListings();
}

function setArea(area, el) {
  seekerState.area = area;
  document.querySelectorAll('#area-list .sk-chip').forEach((b) => b.classList.remove('on'));
  el.classList.add('on');
  renderListings();
}

function setMaxPrice(price, el) {
  seekerState.maxPrice = price;
  document.querySelectorAll('#price-chips .sk-chip[data-price]').forEach((b) => b.classList.remove('on'));
  el.classList.add('on');
  renderListings();
}

function toggleVerifiedChip(el) {
  seekerState.vOnly = !seekerState.vOnly;
  el.classList.toggle('on', seekerState.vOnly);
  showToast(seekerState.vOnly ? 'Showing verified lodges only' : 'Showing all lodges');
  renderListings();
}

/* legacy stubs if old markup briefly present */
function toggleVerified() { toggleVerifiedChip(document.getElementById('v-chip')); }
function updatePrice() {}
function resetFilters() {
  seekerState.area = 'all';
  seekerState.vOnly = false;
  seekerState.maxPrice = 500000;
  document.querySelectorAll('#area-list .sk-chip').forEach((b, i) => b.classList.toggle('on', i === 0));
  document.querySelectorAll('#price-chips .sk-chip[data-price]').forEach((b) => {
    b.classList.toggle('on', b.getAttribute('data-price') === '500000');
  });
  const vc = document.getElementById('v-chip');
  if (vc) vc.classList.remove('on');
  const aq = document.getElementById('amenity-q');
  if (aq) aq.value = '';
  renderListings();
}

async function renderListings() {
  const rawQ = (document.getElementById('amenity-q')?.value || '').trim();
  try {
    const params = {
      area: seekerState.area !== 'all' ? seekerState.area : undefined,
      maxPrice: seekerState.maxPrice < 500000 ? seekerState.maxPrice : undefined,
      q: rawQ || undefined,
      verifiedOnly: seekerState.vOnly ? 'true' : undefined,
    };
    const data = await API.listings.list(params);
    seekerState.listings = data.listings || [];
  } catch {
    seekerState.listings = [];
  }

  const items = seekerState.listings;
  const cnt = document.getElementById('list-count');
  if (cnt) cnt.innerHTML = `<strong>${items.length}</strong> lodge${items.length !== 1 ? 's' : ''} near NSUK`;

  const container = document.getElementById('listings-cont');
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `
      <div class="empty">
        <span class="material-symbols-rounded" style="font-size:3rem;color:var(--t4);">search_off</span>
        <p>No lodges match that.<br>Try another area or budget.</p>
      </div>`;
    return;
  }

  container.innerHTML = items.map((l, i) => renderSeekerListingCard(l, i)).join('');
}

function setStayArea(area, el) {
  seekerState.stayArea = area || 'all';
  document.querySelectorAll('#stay-area-list .sk-chip').forEach((b) => b.classList.remove('on'));
  if (el) el.classList.add('on');
  renderStayFeed();
}

function stayDateQuery() {
  const cin = document.getElementById('stay-checkin')?.value || '';
  const cout = document.getElementById('stay-checkout')?.value || '';
  const qs = new URLSearchParams();
  if (cin) qs.set('checkin', cin);
  if (cout) qs.set('checkout', cout);
  const s = qs.toString();
  return s ? `&${s}` : '';
}

function findStayHotels() {
  renderStayFeed();
  document.getElementById('listings-cont')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openStayHotel(id) {
  goPage(`hotel.html?id=${id}${stayDateQuery()}`);
}

function initStayDateDefaults() {
  const cin = document.getElementById('stay-checkin');
  const cout = document.getElementById('stay-checkout');
  if (!cin || !cout) return;
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const iso = (d) => d.toISOString().slice(0, 10);
  cin.min = iso(today);
  cout.min = iso(tomorrow);
  if (!cin.value) cin.value = iso(today);
  if (!cout.value) cout.value = iso(tomorrow);
  cin.addEventListener('change', () => {
    const next = new Date(`${cin.value}T12:00:00`);
    next.setDate(next.getDate() + 1);
    cout.min = iso(next);
    if (cout.value && cout.value <= cin.value) cout.value = iso(next);
  });
}

async function renderStayFeed({ refresh = false } = {}) {
  const cnt = document.getElementById('list-count');
  const container = document.getElementById('listings-cont');
  if (!container) return;
  initStayDateDefaults();
  if (refresh || !seekerState.hotels.length) {
    if (cnt) cnt.innerHTML = `Loading hotels…`;
    try {
      const { hotels } = await API.hotels.list();
      seekerState.hotels = hotels || [];
    } catch (e) {
      seekerState.hotels = [];
      const msg = e?.message || 'Failed to load hotels';
      if (cnt) cnt.innerHTML = escapeHtml(msg);
      container.innerHTML = `<div class="empty">
        <span class="material-symbols-rounded" style="font-size:3rem;color:var(--t4);">cloud_off</span>
        <p>${escapeHtml(msg)}<br>If you see “route not found”, the latest hotel update still needs to deploy.</p>
      </div>`;
      return;
    }
  }

  const q = (document.getElementById('stay-q')?.value || '').trim().toLowerCase();
  let items = seekerState.hotels.slice();
  if (seekerState.stayArea && seekerState.stayArea !== 'all') {
    const area = seekerState.stayArea.toLowerCase();
    items = items.filter((h) => String(h.area || '').toLowerCase().includes(area));
  }
  if (q) {
    items = items.filter((h) => {
      const blob = [h.name, h.area, h.landmark, h.description].join(' ').toLowerCase();
      return blob.includes(q);
    });
  }

  if (cnt) {
    cnt.innerHTML = `<strong>${items.length}</strong> hotel${items.length !== 1 ? 's' : ''} in Keffi`;
  }

  if (!items.length) {
    container.innerHTML = `
      <div class="empty">
        <span class="material-symbols-rounded" style="font-size:3rem;color:var(--t4);">hotel</span>
        <p>${seekerState.hotels.length ? 'No hotels match this search.' : 'No hotels listed yet.'}<br>
        ${seekerState.hotels.length ? 'Try another area or clear the search.' : 'Check back soon, or browse lodges.'}</p>
        <button type="button" class="btn-gate" style="margin-top:12px;" onclick="setStudentMode('lodge', document.getElementById('mode-lodge'))">Browse lodges</button>
      </div>`;
    return;
  }

  container.innerHTML = items.map((h, i) => {
    const cover = h.photos?.[0] || h.proofPhotos?.[0] || h.rooms?.[0]?.photos?.[0];
    const img = cover
      ? `<img src="${escapeHtml(cover)}" alt="${escapeHtml(h.name)}" loading="lazy">`
      : `<div class="lcard-img-ph"><span class="material-symbols-rounded" style="font-size:2.5rem;">hotel</span><span>Photo coming soon</span></div>`;
    const rating = h.rating != null
      ? `<span class="sk-stay-rating"><span class="material-symbols-rounded">star</span>${Number(h.rating).toFixed(1)}</span>`
      : '<span class="sk-stay-rating muted">New</span>';
    const loc = [h.area, h.landmark].filter(Boolean).join(', ') || 'Keffi, Nasarawa';
    const rooms = h.roomCount || (h.rooms || []).length;
    return `<article class="hng-card" onclick="openStayHotel('${h.id}')" style="animation-delay:${i * 40}ms">
      <div class="hng-card-img">${img}</div>
      <div class="hng-card-body">
        <div class="hng-card-top">
          <h3 class="hng-card-name">${escapeHtml(h.name)}</h3>
          ${rating}
        </div>
        <div class="hng-card-loc">
          <span class="material-symbols-rounded">location_on</span>
          ${escapeHtml(loc)}
        </div>
        <p class="hng-card-desc">${escapeHtml(String(h.description || 'Short stay near NSUK').slice(0, 80))}${(h.description || '').length > 80 ? '…' : ''}
          ${rooms ? ` · ${rooms} room type${rooms === 1 ? '' : 's'}` : ''}</p>
        <div class="hng-card-foot">
          <div class="hng-price">from <strong>₦${fmtN(h.priceRangeMin)}</strong><span>/night</span></div>
          <span class="hng-cta">Open shop</span>
        </div>
      </div>
    </article>`;
  }).join('');
}

function renderSeekerListingCard(l, i) {
  return `
    <div class="lcard" onclick="openDetail('${l.id}')" style="animation-delay:${i * 45}ms">
      <div class="lcard-img">
        ${l.photos && l.photos.length
          ? `<img src="${l.photos[0]}" alt="${escapeHtml(l.title)}" loading="lazy">`
          : `<div class="lcard-img-ph">
               <span class="material-symbols-rounded" style="font-size:2.5rem;">image_not_supported</span>
               <span>No photo yet</span>
             </div>`}
        <div class="img-overlays">
          ${l.serialNumber ? `<span class="listing-tag lcard-tag">${formatListingTag(l.serialNumber)}</span>` : ''}
          <span class="area-tag">${escapeHtml(l.area)}</span>
          <div class="lcard-actions">
            ${listingStatusBadgeHtml(l, { overlay: true })}
            <button class="heart-btn ${seekerState.loved.has(l.id) ? 'loved' : ''}"
              onclick="event.stopPropagation(); toggleLove('${l.id}', this)">
              <span class="material-symbols-rounded" style="font-size:1rem;">${seekerState.loved.has(l.id) ? 'favorite' : 'favorite_border'}</span>
            </button>
          </div>
        </div>
        <div class="price-overlay">
          <div class="price-tag-dark">₦${fmtN(l.price)}<span>/yr</span></div>
        </div>
      </div>
      <div class="lcard-body">
        <div class="lcard-title">${escapeHtml(l.title)}</div>
        <div class="lcard-loc">
          <span class="material-symbols-rounded" style="font-size:.85rem;">location_on</span>
          ${escapeHtml(l.distance || l.area)}
        </div>
        ${l.amenities && l.amenities.length
          ? `<div class="lcard-tags">
              ${l.amenities.slice(0, 3).map(a =>
                `<span class="ltag"><span class="material-symbols-rounded" style="font-size:.75rem;">check_circle</span>${escapeHtml(a)}</span>`
              ).join('')}
              ${l.amenities.length > 3 ? `<span class="ltag">+${l.amenities.length - 3} more</span>` : ''}
            </div>`
          : ''}
        <div class="lcard-footer">
          <div class="agent-info">
            <div class="agent-av">${(l.agentName || 'A').charAt(0).toUpperCase()}</div>
            <div class="agent-nm">${escapeHtml(l.agentName || 'Agent')}</div>
          </div>
          ${listingInquiryHintHtml(l)}
        </div>
      </div>
    </div>`;
}

async function toggleLove(id, btn) {
  const session = getSession();
  if (!session?.loggedIn) {
    showToast('Sign in to save lodges');
    goPage('auth-seeker.html');
    return;
  }
  try {
    const result = await API.social.toggleFavorite(id);
    if (result.loved) {
      seekerState.loved.add(id);
      btn.classList.add('loved');
      btn.innerHTML = `<span class="material-symbols-rounded" style="font-size:1rem;">favorite</span>`;
    } else {
      seekerState.loved.delete(id);
      btn.classList.remove('loved');
      btn.innerHTML = `<span class="material-symbols-rounded" style="font-size:1rem;">favorite_border</span>`;
    }
    if (document.getElementById('sk-panel-saved')?.style.display !== 'none') renderSavedListings();
  } catch (e) {
    showToast(e.message || 'Could not update favorite');
  }
}

async function openDetail(id) {
  let l = seekerState.listings.find((x) => x.id === id);
  if (!l) {
    try {
      const data = await API.listings.get(id);
      l = data.listing;
    } catch {
      showToast('Listing not found');
      return;
    }
  }
  seekerState.currentListing = l;

  const dsImg = document.getElementById('ds-img');
  if (dsImg) {
    const galleryId = `ds-${l.id}`;
    dsImg.innerHTML = l.photos && l.photos.length
      ? `${listingPhotoGalleryHtml(l.photos, galleryId, {
          detail: true,
          alt: l.title,
          overlayHtml: `<div class="ds-price-row">
            <div class="ds-price">₦${fmtN(l.price)}/year</div>
            ${listingStatusBadgeHtml(l, { overlay: true })}
          </div>`,
        })}
        <button class="ds-close" onclick="closeDetailModal({currentTarget:this})">
          <span class="material-symbols-rounded ms" style="font-size:1rem;">close</span>
        </button>`
      : `<div class="ds-img-ph"><span class="material-symbols-rounded" style="font-size:2.5rem;">image_not_supported</span></div>
        <button class="ds-close" onclick="closeDetailModal({currentTarget:this})">
          <span class="material-symbols-rounded ms" style="font-size:1rem;">close</span>
        </button>`;
  }

  const dsTitle = document.getElementById('ds-title');
  if (dsTitle) {
    dsTitle.innerHTML = l.serialNumber
      ? `<span class="listing-tag">${formatListingTag(l.serialNumber)}</span> ${escapeHtml(l.title)}`
      : escapeHtml(l.title);
  }
  const dsStatus = document.getElementById('ds-status');
  if (dsStatus) {
    dsStatus.innerHTML = `
      <div class="ds-status-row">
        ${listingStatusBadgeHtml(l)}
        ${listingInquiryHintHtml(l)}
      </div>`;
  }

  const dsLoc = document.getElementById('ds-loc');
  if (dsLoc) {
    dsLoc.innerHTML = `<span class="material-symbols-rounded" style="font-size:.9rem;">location_on</span>${escapeHtml(l.area)}${l.distance ? ' • ' + escapeHtml(l.distance) : ''}${l.landmark ? ' — ' + escapeHtml(l.landmark) : ''}`;
  }
  const dsDesc = document.getElementById('ds-desc');
  if (dsDesc) dsDesc.textContent = l.description || 'No description provided.';
  const dsMapLbl = document.getElementById('ds-map-lbl');
  if (dsMapLbl) dsMapLbl.textContent = (l.area || 'NSUK') + ', Keffi, Nasarawa';

  const dsStale = document.getElementById('ds-stale');
  if (dsStale) {
    const ts = l.createdAt || l.created_at;
    dsStale.innerHTML = isStale(ts)
      ? `<div class="stale-warn"><span class="material-symbols-rounded" style="font-size:.85rem;">warning</span>Posted 60+ days ago. Confirm availability before visiting.</div>`
      : '';
  }

  const dsTrust = document.getElementById('ds-trust');
  if (dsTrust) {
    dsTrust.innerHTML = l.status === 'verified'
      ? `<div class="trust-env">
          <div class="te-header">
            <span class="material-symbols-rounded" style="font-size:.85rem;">verified_user</span>
            KeffiRooms Verified
          </div>
          <div class="te-body">
            Reviewed by our team. Continue on WhatsApp and we’ll connect you safely.
          </div>
        </div>`
      : `<div class="trust-env">
          <div class="te-header">
            <span class="material-symbols-rounded" style="font-size:.85rem;">schedule</span>
            Pending Verification
          </div>
          <div class="te-body">
            Still under review — you can inquire and we’ll confirm availability with the agent.
          </div>
        </div>`;
  }

  const dsAmenities = document.getElementById('ds-amenities');
  if (dsAmenities) {
    dsAmenities.innerHTML = l.amenities && l.amenities.length
      ? l.amenities.map((a) => `
          <div class="amenity-item">
            <span class="material-symbols-rounded" style="font-size:1rem;color:var(--em);">check_circle</span>
            ${escapeHtml(a)}
          </div>`).join('')
      : `<div style="grid-column:1/-1;font-size:.8rem;color:var(--t4);">No amenities listed</div>`;
  }

  const session = getSession();
  const dsContact = document.getElementById('ds-contact');
  if (dsContact) {
    if (!listingCanInquire(l)) {
      const s = listingStatusForSeeker(l);
      dsContact.innerHTML = `
        <div class="inquiry-closed-gate">
          <span class="material-symbols-rounded">block</span>
          <div>
            <strong>${escapeHtml(s.label)}</strong>
            <p>This listing is not available for inquiries.</p>
          </div>
        </div>`;
    } else {
      const pendingNote = l.status !== 'verified'
        ? `<div class="pending-inquiry-note">
            <span class="material-symbols-rounded">info</span>
            Not verified yet — you can still inquire. We’ll confirm with the agent.
          </div>`
        : '';
      dsContact.innerHTML = `
        ${pendingNote}
        <div class="contact-block">
          <div class="cb-top">
            <div class="cb-av">${(l.agentName || 'A').charAt(0).toUpperCase()}</div>
            <div class="cb-info">
              <div class="cb-name">${escapeHtml(l.agentName || 'Listed agent')}</div>
              <div class="cb-role">Via KeffiRooms WhatsApp</div>
            </div>
          </div>
          <div class="cb-btns">
            <button class="btn-contact-wa" onclick="contactViaWhatsApp()">
              <span class="material-symbols-rounded" style="font-size:1rem;">chat</span>
              Continue on WhatsApp
            </button>
            <button class="btn-call-sm" onclick="callAgent()" title="Call coordinator">
              <span class="material-symbols-rounded" style="font-size:1rem;">call</span>
            </button>
          </div>
          ${!session?.loggedIn
            ? `<div class="guest-soft-hint">No account needed. <a href="auth-seeker.html">Sign in</a> only to save lodges.</div>`
            : ''}
        </div>`;
    }
  }

  document.getElementById('detail-overlay')?.classList.add('open');
}

function closeDetailModal(e) {
  if (e.target === document.getElementById('detail-overlay') || e.currentTarget.classList.contains('ds-close')) {
    document.getElementById('detail-overlay').classList.remove('open');
  }
}

async function contactViaWhatsApp() {
  const l = seekerState.currentListing;
  if (!l) return;
  if (!listingCanInquire(l)) {
    showToast('This listing is not available for inquiries');
    return;
  }
  const session = getSession();

  if (session?.loggedIn) {
    try {
      const inq = await API.social.createInquiry({ listingId: l.id });
      seekerState.conversationId = inq.conversationId;
    } catch { /* still open WhatsApp */ }
  }

  const guestName = session?.name && session.loggedIn ? session.name : 'Student';
  const msg = listingSeekerInquiryMessage(l, { name: guestName, phone: session?.phone || '' });
  const waUrl = keffiRoomsWhatsAppUrl(msg);
  if (!waUrl) {
    showToast('WhatsApp is not configured');
    return;
  }

  sessionStorage.setItem('kr6_chat_listing', JSON.stringify(sanitizeListingForSeeker(l)));
  if (seekerState.conversationId) {
    sessionStorage.setItem('kr6_conversation_id', seekerState.conversationId);
  }

  const ov = document.getElementById('detail-overlay');
  if (ov) ov.classList.remove('open');
  window.open(waUrl, '_blank', 'noopener');
}

function callAgent() {
  window.location.href = `tel:${ADMIN_PHONE}`;
}

function openMap() {
  const l = seekerState.currentListing;
  if (!l) return;
  const q = encodeURIComponent((l.area || 'NSUK') + ', Keffi, Nasarawa State, Nigeria');
  window.open('https://maps.google.com/?q=' + q, '_blank');
}

function reportListing() {
  const l = seekerState.currentListing;
  if (!l) return;
  const msg = encodeURIComponent(`Report listing ${formatListingTag(l.serialNumber) || l.id}: ${l.title}`);
  window.open(`https://wa.me/${ADMIN_WA}?text=${msg}`, '_blank');
}

function skTab(tab, el) {
  document.querySelectorAll('.bn').forEach((b) => b.classList.remove('on'));
  el.classList.add('on');
  document.getElementById('sk-panel-home').style.display = tab === 'home' ? 'block' : 'none';
  document.getElementById('sk-panel-saved').style.display = tab === 'saved' ? 'block' : 'none';
  document.getElementById('sk-panel-profile').style.display = tab === 'profile' ? 'block' : 'none';
  if (tab === 'saved') renderSavedListings();
  if (tab === 'profile') renderProfile();
  if (tab === 'home') renderHomeFeed();
}

function renderSavedListings() {
  const container = document.getElementById('saved-cont');
  if (!container) return;
  const session = getSession();
  if (!session?.loggedIn) {
    container.innerHTML = `
      <div class="empty">
        <span class="material-symbols-rounded" style="font-size:3rem;color:var(--t4);">favorite</span>
        <p>Sign in to keep lodges you like.</p>
        <a href="auth-seeker.html" class="btn-gate" style="margin-top:12px;display:inline-flex;">Sign in</a>
      </div>`;
    return;
  }
  const saved = seekerState.listings.filter((l) => seekerState.loved.has(l.id));
  if (!saved.length) {
    API.social.favorites().then(async (fav) => {
      seekerState.loved = new Set(fav.ids || []);
      const ids = [...seekerState.loved];
      if (!ids.length) {
        container.innerHTML = `<div class="empty"><p>No saved lodges yet. Tap the heart on a listing.</p></div>`;
        return;
      }
      try {
        const all = await API.listings.list({});
        seekerState.listings = all.listings || [];
        const items = seekerState.listings.filter((l) => seekerState.loved.has(l.id));
        container.innerHTML = items.map((l, i) => renderSeekerListingCard(l, i)).join('')
          || `<div class="empty"><p>No saved lodges yet.</p></div>`;
      } catch {
        container.innerHTML = `<div class="empty"><p>Could not load saved lodges.</p></div>`;
      }
    }).catch(() => {
      container.innerHTML = `<div class="empty"><p>Could not load saved lodges.</p></div>`;
    });
    return;
  }
  container.innerHTML = saved.map((l, i) => renderSeekerListingCard(l, i)).join('');
}

async function renderProfile() {
  const cont = document.getElementById('profile-cont');
  if (!cont) return;
  const session = getSession();
  if (!session?.loggedIn) {
    cont.innerHTML = `
      <div class="profile-card">
        <div class="profile-top">
          <div class="profile-av">G</div>
          <div>
            <div class="profile-name">Guest</div>
            <div class="profile-role">Browsing without an account</div>
          </div>
        </div>
        <p class="profile-meta">You can inquire on WhatsApp without signing up. Sign in only to save lodges and sync across devices.</p>
        <a href="auth-seeker.html" class="btn-profile teal">
          <span class="material-symbols-rounded ms" style="font-size:1rem;">login</span>
          Sign in / Create account
        </a>
      </div>`;
    return;
  }
  cont.innerHTML = `
    <div class="profile-card">
      <div class="profile-top">
        <div class="profile-av">${(session.name || 'S').charAt(0).toUpperCase()}</div>
        <div>
          <div class="profile-name">${escapeHtml(session.name || 'Student')}</div>
          <div class="profile-role">Student account</div>
        </div>
      </div>
      <div class="profile-row"><span class="material-symbols-rounded ms">mail</span>${escapeHtml(session.email || '—')}</div>
      <div class="profile-row"><span class="material-symbols-rounded ms">call</span>${escapeHtml(session.phone || '—')}</div>
      <button type="button" class="btn-profile outline" onclick="setStudentMode('lodge', document.getElementById('mode-lodge')); skTab('home', document.getElementById('bn-home'));">
        Browse lodges
      </button>
      <button type="button" class="btn-profile outline" onclick="setStudentMode('stay', document.getElementById('mode-stay')); skTab('home', document.getElementById('bn-home'));">
        Browse short stays
      </button>
      <button type="button" class="btn-profile danger" onclick="signOut()">Sign out</button>
    </div>`;
}
