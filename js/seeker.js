/* ═══════════════════════════════════════
   KEFFIROOMS — SEEKER.JS
   Seeker portal — API-backed
═══════════════════════════════════════ */

let seekerState = {
  area: 'all',
  vOnly: false,
  maxPrice: 500000,
  loved: new Set(),
  listings: [],
  currentListing: null,
  conversationId: null,
};

document.addEventListener('DOMContentLoaded', async () => {
  await initPlatform();
  applyTheme();
  await bootstrapAuth();
  const session = getSession();
  const chip = document.getElementById('mode-chip-label');
  if (chip) chip.textContent = session?.loggedIn ? 'Seeker Mode' : 'Guest Mode';

  if (session?.loggedIn) {
    try {
      const fav = await API.social.favorites();
      seekerState.loved = new Set(fav.ids || []);
    } catch { /* guest */ }
  }

  await renderListings();
  renderProfile();
  const vTgl = document.getElementById('v-toggle');
  if (vTgl) vTgl.className = seekerState.vOnly ? 'tgl on' : 'tgl';
});

function setArea(area, el) {
  seekerState.area = area;
  document.querySelectorAll('.area-row').forEach(b => b.classList.remove('on'));
  el.classList.add('on');
  renderListings();
}

function toggleVerified() {
  seekerState.vOnly = !seekerState.vOnly;
  const tgl = document.getElementById('v-toggle');
  if (tgl) tgl.className = seekerState.vOnly ? 'tgl on' : 'tgl';
  showToast(seekerState.vOnly ? 'Showing verified listings only' : 'Showing all listings — green = verified, red = not verified');
  renderListings();
}

function updatePrice(el) {
  const v = parseInt(el.value, 10);
  seekerState.maxPrice = v;
  const pct = ((v - 80000) / (500000 - 80000) * 100).toFixed(1);
  el.style.setProperty('--pct', pct + '%');
  const lbl = document.getElementById('price-val');
  if (lbl) lbl.textContent = 'N' + fmtN(v);
  renderListings();
}

function resetFilters() {
  seekerState.area = 'all';
  seekerState.vOnly = false;
  seekerState.maxPrice = 500000;
  document.querySelectorAll('.area-row').forEach((b, i) => b.classList.toggle('on', i === 0));
  const tgl = document.getElementById('v-toggle');
  if (tgl) tgl.className = 'tgl';
  const ps = document.getElementById('price-slider');
  if (ps) { ps.value = 500000; ps.style.setProperty('--pct', '100%'); }
  const pv = document.getElementById('price-val');
  if (pv) pv.textContent = 'N500,000';
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
  if (cnt) cnt.innerHTML = `Showing <strong>${items.length}</strong> Room${items.length !== 1 ? 's' : ''}`;

  const container = document.getElementById('listings-cont');
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `
      <div class="empty">
        <span class="material-symbols-rounded" style="font-size:3rem;color:var(--t4);">search_off</span>
        <p>No rooms found.<br>Try different filters.</p>
      </div>`;
    return;
  }

  container.innerHTML = items.map((l, i) => renderSeekerListingCard(l, i)).join('');
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
          <div class="price-tag-dark">N${fmtN(l.price)}<span>/yr</span></div>
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
    showToast('Sign in to save listings');
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
    if (document.getElementById('sk-panel-saved')?.style.display !== 'none') {
      renderSavedListings();
    }
    if (document.getElementById('sk-panel-profile')?.style.display !== 'none') {
      renderProfile();
    }
  } catch (e) {
    showToast(e.message || 'Could not update favorite');
  }
}

function openDetail(id) {
  const l = seekerState.listings.find(x => x.id === id);
  if (!l) return;
  seekerState.currentListing = l;

  const dsImg = document.getElementById('ds-img');
  if (dsImg) {
    const galleryId = `ds-${l.id}`;
    dsImg.innerHTML = l.photos && l.photos.length
      ? `${listingPhotoGalleryHtml(l.photos, galleryId, {
          detail: true,
          alt: l.title,
          overlayHtml: `<div class="ds-price-row">
            <div class="ds-price">N${fmtN(l.price)}/year</div>
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
  if (dsLoc) dsLoc.innerHTML = `<span class="material-symbols-rounded" style="font-size:.9rem;">location_on</span>${escapeHtml(l.area)}${l.distance ? ' • ' + escapeHtml(l.distance) : ''}${l.landmark ? ' — ' + escapeHtml(l.landmark) : ''}`;
  const dsDesc = document.getElementById('ds-desc');
  if (dsDesc) dsDesc.textContent = l.description || 'No description provided.';
  const dsMapLbl = document.getElementById('ds-map-lbl');
  if (dsMapLbl) dsMapLbl.textContent = (l.area || 'NSUK') + ', Keffi, Nasarawa';

  const dsStale = document.getElementById('ds-stale');
  if (dsStale) {
    const ts = l.createdAt || l.created_at;
    dsStale.innerHTML = isStale(ts)
      ? `<div class="stale-warn"><span class="material-symbols-rounded" style="font-size:.85rem;">warning</span>Posted 60+ days ago. Confirm availability with agent before visiting.</div>`
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
            This listing was reviewed and approved by KeffiRooms admin. Contact our coordinator to arrange a viewing.
          </div>
        </div>`
      : `<div class="trust-env">
          <div class="te-header">
            <span class="material-symbols-rounded" style="font-size:.85rem;">schedule</span>
            Pending Verification
          </div>
          <div class="te-body">
            Admin is still reviewing this listing. You can inquire through KeffiRooms and we will confirm availability with the agent.
          </div>
        </div>`;
  }

  const dsAmenities = document.getElementById('ds-amenities');
  if (dsAmenities) {
    dsAmenities.innerHTML = l.amenities && l.amenities.length
      ? l.amenities.map(a => `
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
    } else if (session?.loggedIn) {
      const pendingNote = l.status !== 'verified'
        ? `<div class="pending-inquiry-note">
            <span class="material-symbols-rounded">info</span>
            Not verified yet — you can still inquire. KeffiRooms will confirm availability with the agent.
          </div>`
        : '';
      dsContact.innerHTML = `
        ${pendingNote}
        <div class="contact-block">
          <div class="cb-top">
            <div class="cb-av">${(l.agentName || 'A').charAt(0).toUpperCase()}</div>
            <div class="cb-info">
              <div class="cb-name">${escapeHtml(l.agentName || 'Agent')}</div>
              <div class="cb-role">Via KeffiRooms coordinator</div>
            </div>
          </div>
          <div class="cb-btns">
            <button class="btn-contact-wa" onclick="contactViaWhatsApp()">
              <span class="material-symbols-rounded" style="font-size:1rem;">chat</span>
              Send Inquiry via WhatsApp
            </button>
            <button class="btn-call-sm" onclick="callAgent()">
              <span class="material-symbols-rounded" style="font-size:1rem;">call</span>
            </button>
          </div>
        </div>`;
    } else {
      dsContact.innerHTML = `
        <div class="login-gate">
          <div class="gate-icon">
            <span class="material-symbols-rounded" style="font-size:1.5rem;color:var(--teal-l);">lock</span>
          </div>
          <div class="gate-title">Sign in to Contact Agent</div>
          <div class="gate-sub">Create a free account to unlock agent contacts and save listings you love.</div>
          <a href="auth-seeker.html" class="btn-gate">Sign In — It's Free</a>
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
  if (!session?.loggedIn) {
    goPage('auth-seeker.html');
    return;
  }

  try {
    const inq = await API.social.createInquiry({ listingId: l.id });
    seekerState.conversationId = inq.conversationId;
  } catch { /* continue to chat page */ }

  sessionStorage.setItem('kr6_chat_listing', JSON.stringify(sanitizeListingForSeeker(l)));
  if (seekerState.conversationId) {
    sessionStorage.setItem('kr6_conversation_id', seekerState.conversationId);
  }

  const ov = document.getElementById('detail-overlay');
  if (ov) ov.classList.remove('open');
  goPage('chat.html');
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
  const msg = encodeURIComponent(`Report on KeffiRooms: ${formatListingTag(l?.serialNumber) || ''} "${l ? l.title : ''}". Reason: `);
  window.open(`https://wa.me/${ADMIN_WA}?text=${msg}`, '_blank');
}

function skTab(tab, el) {
  document.querySelectorAll('.bn').forEach(b => b.classList.remove('on'));
  el.classList.add('on');

  const panels = { home: 'sk-panel-home', saved: 'sk-panel-saved', profile: 'sk-panel-profile' };
  Object.values(panels).forEach(id => {
    const p = document.getElementById(id);
    if (p) p.style.display = 'none';
  });
  const active = document.getElementById(panels[tab]);
  if (active) active.style.display = 'block';

  if (tab === 'saved') renderSavedListings();
  if (tab === 'profile') renderProfile();
  if (tab === 'home') window.scrollTo(0, 0);
}

function renderSavedListings() {
  const container = document.getElementById('saved-cont');
  if (!container) return;
  const session = getSession();

  if (!session?.loggedIn) {
    container.innerHTML = `
      <div class="empty" style="padding:30px 0;">
        <span class="material-symbols-rounded" style="font-size:3rem;color:var(--t4);">lock</span>
        <p>Sign in to save and view your favourite listings.</p>
        <button class="btn-profile teal" style="max-width:260px;margin:14px auto 0;" onclick="goPage('auth-seeker.html')">
          Sign In — It's Free
        </button>
      </div>`;
    return;
  }

  const saved = seekerState.listings.filter(l => seekerState.loved.has(l.id));
  if (!saved.length) {
    container.innerHTML = `
      <div class="empty" style="padding:30px 0;">
        <span class="material-symbols-rounded" style="font-size:3rem;color:var(--t4);">favorite_border</span>
        <p>No saved listings yet.<br>Tap the heart on any room to save it here.</p>
      </div>`;
    return;
  }

  container.innerHTML = saved.map((l, i) => renderSeekerListingCard(l, i)).join('');
}

async function renderProfile() {
  const container = document.getElementById('profile-cont');
  if (!container) return;

  let session = getSession();
  if (!session?.loggedIn && localStorage.getItem(KR_CONFIG.tokenKey)) {
    session = await bootstrapAuth();
  }

  if (!session?.loggedIn) {
    container.innerHTML = `
      <div class="profile-card">
        <div class="profile-top">
          <div class="profile-av">G</div>
          <div>
            <div class="profile-name">Guest</div>
            <div class="profile-role">Browsing without account</div>
          </div>
        </div>
        <p style="font-size:.78rem;color:var(--t3);line-height:1.6;margin-bottom:14px;">
          Sign in to contact agents, save listings, and track your inquiries securely.
        </p>
        <button class="btn-profile teal" onclick="goPage('auth-seeker.html')">
          <span class="material-symbols-rounded ms" style="font-size:1rem;">login</span>
          Sign In / Create Account
        </button>
        <button class="btn-profile outline" onclick="goPage('index.html')">
          <span class="material-symbols-rounded ms" style="font-size:1rem;">home</span>
          Back to Home
        </button>
      </div>`;
    return;
  }

  let user = session;
  try {
    const data = await API.auth.me();
    if (data.user) {
      user = { ...session, ...mapApiUser(data.user) };
      setSession(user);
    }
  } catch { /* use cached session */ }

  const initial = (user.name || 'S').charAt(0).toUpperCase();
  container.innerHTML = `
    <div class="profile-card">
      <div class="profile-top">
        <div class="profile-av">${initial}</div>
        <div>
          <div class="profile-name">${escapeHtml(user.name || 'Student')}</div>
          <div class="profile-role">NSUK Student Seeker</div>
        </div>
      </div>
      ${user.email ? `<div class="profile-row"><span class="material-symbols-rounded ms">mail</span>${escapeHtml(user.email)}</div>` : ''}
      ${user.phone ? `<div class="profile-row"><span class="material-symbols-rounded ms">phone</span>${escapeHtml(user.phone)}</div>` : ''}
      <div class="profile-row"><span class="material-symbols-rounded ms">favorite</span>${seekerState.loved.size} saved listing${seekerState.loved.size !== 1 ? 's' : ''}</div>
    </div>
    <div class="profile-card">
      <button class="btn-profile outline" onclick="skTab('saved', document.getElementById('bn-saved'))">
        <span class="material-symbols-rounded ms">favorite</span>
        View Saved Listings
      </button>
      <button class="btn-profile outline" onclick="goPage('reset-password.html')">
        <span class="material-symbols-rounded ms">lock_reset</span>
        Change Password
      </button>
      <button class="btn-profile danger" onclick="signOut()">
        <span class="material-symbols-rounded ms">logout</span>
        Sign Out
      </button>
    </div>`;
}
