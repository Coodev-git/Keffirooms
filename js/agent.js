/* ═══════════════════════════════════════
   KEFFIROOMS — AGENT.JS
   Agent hub — API-backed
═══════════════════════════════════════ */

let agentState = {
  photos: [],
  trustMeta: null,
  listings: [],
  trust: null,
  editListingId: null,
  existingPhotos: [],
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const session = await requireAuthAsync('agent');
    if (!session) return;
    if (session.role === 'agent' && session.agentStatus === 'pending') {
      showToast('Awaiting admin approval — check WhatsApp');
      setTimeout(() => goPage('index.html'), 2200);
      return;
    }
    if (session.role === 'agent' && session.agentStatus === 'denied') {
      showToast('Agent access denied');
      await signOut();
      return;
    }
    await initPlatform();
    applyTheme();
    setupDualRolePortal('agent');
    await loadAgentListings(session);
    if (window.location.hash === '#post') {
      showPostForm();
    }
  } catch (e) {
    console.error('Agent hub init failed:', e);
    showToast('Could not load agent hub — refresh the page');
  }
});

async function loadAgentListings(session) {
  try {
    const data = await API.listings.mine();
    agentState.listings = data.listings || [];
    agentState.trust = data.trust || null;
  } catch {
    agentState.listings = [];
    agentState.trust = null;
  }
  renderAgentHub(session);
}

function renderTrustScore() {
  const trust = agentState.trust;
  const scoreEl = document.getElementById('ag-trust-score');
  const subEl = document.getElementById('ag-trust-sub');
  const leadsEl = document.getElementById('ag-leads');

  if (scoreEl) {
    scoreEl.textContent = trust?.trustScore != null ? `${trust.trustScore}%` : '—';
    scoreEl.className = `ah-stat-n ${trustScoreColorClass(trust?.trustScore)}`;
  }
  if (subEl) {
    subEl.textContent = trust?.trustLabel || 'Based on your listings & reviews';
  }
  if (leadsEl && trust?.inquiryCount != null) {
    animateCount(leadsEl, trust.inquiryCount);
  }
}

function trustScoreColorClass(score) {
  if (score == null) return 'teal';
  if (score >= 85) return 'teal';
  if (score >= 70) return 'teal';
  if (score >= 50) return 'gold';
  return 'white';
}

function renderAgentHub(session) {
  const mine = agentState.listings;
  const verified = mine.filter(l => l.status === 'verified').length;
  const pending = mine.filter(l => l.status === 'pending').length;
  const active = mine.filter(l => ['verified', 'pending'].includes(l.status)).length;

  const nameEl = document.getElementById('ah-agent-name');
  if (nameEl) nameEl.textContent = session.name;

  const totEl = document.getElementById('ag-total');
  if (totEl) animateCount(totEl, active);
  const verEl = document.getElementById('ag-verified');
  if (verEl) animateCount(verEl, verified);
  const pndEl = document.getElementById('ag-pending');
  if (pndEl) animateCount(pndEl, pending);
  const subEl = document.getElementById('ag-stat-sub');
  if (subEl) subEl.textContent = `${verified} verified, ${pending} pending review`;

  renderTrustScore();
  renderPropTable(mine);
}

function renderPropTable(items) {
  const c = document.getElementById('ag-props-list');
  if (!c) return;
  if (!items.length) {
    c.innerHTML = `<div class="empty">
      <span class="material-symbols-rounded" style="font-size:3rem;color:var(--t4);">list_alt</span>
      <p>No listings yet.<br>Tap <strong>List New Room</strong> to get started.</p>
    </div>`;
    return;
  }
  c.innerHTML = items.map(l => `
    <div class="prop-row">
      <div class="prop-row-info">
        <div class="prop-thumb">
          ${listingPhotoThumbHtml(l.photos, `ag-${l.id}`, {
            emptyHtml: `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
              <span class="material-symbols-rounded" style="font-size:1.2rem;color:var(--t4);">image</span>
            </div>`,
          })}
        </div>
        <div class="prop-row-main">
          <div class="prop-name">${l.serialNumber ? `<span class="listing-tag">${formatListingTag(l.serialNumber)}</span> ` : ''}${escapeHtml(l.title)}</div>
          <div class="prop-by">${listingAgentStatusHtml(l.status)}</div>
        </div>
      </div>
      <div><span class="prop-loc">${escapeHtml(l.area)}</span></div>
      <div class="prop-price">N${fmtN(l.price)}</div>
      <div class="prop-row-actions">
        ${['pending', 'verified', 'unavailable', 'rejected'].includes(l.status)
          ? `<button type="button" class="btn-prop-edit" onclick="openEditForm('${l.id}')" title="Fix typos or update details">
              <span class="material-symbols-rounded">edit</span> Edit
            </button>`
          : ''}
        ${['verified', 'pending'].includes(l.status)
          ? `<button type="button" class="btn-prop-unlist" onclick="agentUnlist('${l.id}')" title="Hide from seekers — property no longer available">
              <span class="material-symbols-rounded">visibility_off</span> Unlist
            </button>`
          : ''}
        ${l.status === 'unavailable'
          ? `<button type="button" class="btn-prop-relist" onclick="agentRelist('${l.id}')" title="Submit for verification again">
              <span class="material-symbols-rounded">publish</span> Relist
            </button>`
          : ''}
      </div>
    </div>`).join('');
}

async function agentUnlist(listingId) {
  const l = agentState.listings.find((x) => x.id === listingId);
  const tag = l ? formatListingTag(l.serialNumber) : 'this listing';
  if (!confirm(`Unlist ${tag}? It will be hidden from students until you relist it.`)) return;
  try {
    await API.listings.unlist(listingId);
    showToast(`${tag} unlisted — hidden from seekers`);
    const session = getSession();
    if (session) await loadAgentListings(session);
  } catch (e) {
    showToast(e.message || 'Could not unlist listing');
  }
}

async function agentRelist(listingId) {
  const l = agentState.listings.find((x) => x.id === listingId);
  const tag = l ? formatListingTag(l.serialNumber) : 'this listing';
  if (!confirm(`Relist ${tag}? It will return to the pending verification queue.`)) return;
  try {
    await API.listings.relist(listingId);
    showToast(`${tag} relisted — pending admin verification`);
    const session = getSession();
    if (session) await loadAgentListings(session);
  } catch (e) {
    showToast(e.message || 'Could not relist listing');
  }
}

function setSelectValue(id, value) {
  const el = document.getElementById(id);
  if (!el || value == null || value === '') return;
  const has = Array.from(el.options).some((o) => o.value === value);
  if (!has) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    el.appendChild(opt);
  }
  el.value = value;
}

function setFormMode(mode, listing = null) {
  const isEdit = mode === 'edit';
  const titleEl = document.getElementById('post-form-title');
  const subEl = document.getElementById('post-form-sub');
  const btnLabel = document.getElementById('btn-dispatch-label');
  const photoHint = document.getElementById('photo-section-hint');
  const photoSection = document.getElementById('photo-section');
  let editNote = document.getElementById('edit-mode-note');

  if (titleEl) titleEl.textContent = isEdit ? 'Edit Listing' : 'List New Room';
  if (subEl) {
    subEl.textContent = isEdit
      ? `Update ${listing?.serialNumber ? formatListingTag(listing.serialNumber) : 'listing'} — verified listings go back for admin review.`
      : 'Fill all required fields. Listing reviewed before publishing.';
  }
  if (btnLabel) btnLabel.textContent = isEdit ? 'Save Changes' : 'Dispatch to Verification Queue';

  if (photoHint) {
    photoHint.textContent = isEdit ? '(existing photos kept)' : '(min 5 required)';
  }
  if (photoSection) photoSection.style.display = isEdit ? 'none' : '';

  if (isEdit && listing?.status === 'verified') {
    if (!editNote) {
      editNote = document.createElement('div');
      editNote.id = 'edit-mode-note';
      editNote.className = 'edit-mode-note';
      document.querySelector('.post-form-header')?.after(editNote);
    }
    editNote.textContent = 'This listing is verified. Saving changes will hide it from students until admin re-approves.';
    editNote.style.display = 'block';
  } else if (editNote) {
    editNote.style.display = 'none';
  }
}

function resetListingFormFields() {
  ['f-title', 'f-type', 'f-price', 'f-desc', 'f-area', 'f-distance', 'f-landmark'].forEach((fid) => {
    const e = document.getElementById(fid);
    if (e) e.value = '';
  });
  document.querySelectorAll('.amenity-check-label input').forEach((i) => { i.checked = false; });
  agentState.photos.forEach((p) => { if (p.preview) URL.revokeObjectURL(p.preview); });
  agentState.photos = [];
  agentState.trustMeta = null;
  agentState.existingPhotos = [];
  agentState.editListingId = null;
  renderPhotoPreviews();
  const mb = document.getElementById('metabox');
  if (mb) mb.style.display = 'none';
  setFormMode('create');
}

function openEditForm(listingId) {
  const l = agentState.listings.find((x) => x.id === listingId);
  if (!l) {
    showToast('Listing not found');
    return;
  }

  agentState.photos.forEach((p) => { if (p.preview) URL.revokeObjectURL(p.preview); });
  agentState.photos = [];
  agentState.trustMeta = null;
  agentState.editListingId = l.id;
  agentState.existingPhotos = [...(l.photos || [])];

  document.getElementById('f-title').value = l.title || '';
  setSelectValue('f-type', l.type);
  document.getElementById('f-price').value = l.price || '';
  document.getElementById('f-desc').value = l.description || '';
  setSelectValue('f-area', l.area);
  setSelectValue('f-distance', l.distance);
  document.getElementById('f-landmark').value = l.landmark || '';
  document.querySelectorAll('.amenity-check-label input').forEach((i) => {
    i.checked = (l.amenities || []).includes(i.value);
  });

  setFormMode('edit', l);
  renderPhotoPreviews();
  showPostForm();
}

function showPostForm() {
  document.getElementById('ag-home-panel').style.display = 'none';
  document.getElementById('ag-post-panel').style.display = 'block';
  document.getElementById('ag-btm-nav').style.display = 'none';
  window.scrollTo(0, 0);
}

function hidePostForm() {
  document.getElementById('ag-home-panel').style.display = 'block';
  document.getElementById('ag-post-panel').style.display = 'none';
  document.getElementById('ag-btm-nav').style.display = 'flex';
  resetListingFormFields();
  const session = getSession();
  if (session) loadAgentListings(session);
}

function agTab(tab, el) {
  document.querySelectorAll('#sag .bn').forEach(b => b.classList.remove('on'));
  if (el) el.classList.add('on');
  if (tab === 'post') {
    resetListingFormFields();
    showPostForm();
  }
  else if (tab === 'browse') goPage('seeker.html');
  else hidePostForm();
}

async function handlePhotos(e) {
  const files = Array.from(e.target.files).slice(0, 12 - agentState.photos.length);
  if (!files.length) return;
  showToast('Attaching GPS metadata...');
  const gps = await getGPS();
  const now = nowStr();
  const dev = getDevice();

  for (const f of files) {
    const obj = {
      file: f,
      preview: URL.createObjectURL(f),
      metadata: {
        time: now,
        gps_lat: gps.lat,
        gps_lng: gps.lng,
        gps_acc: gps.acc,
        device: dev,
        size_kb: Math.round(f.size / 1024),
      },
    };
    agentState.photos.push(obj);
  }
  renderPhotoPreviews();
  showToast(gps.lat ? `GPS ±${gps.acc} captured` : 'Metadata attached (no GPS)');
}

function renderPhotoPreviews() {
  const c = document.getElementById('photo-row');
  if (!c) return;
  const existing = agentState.existingPhotos || [];
  const n = existing.length + agentState.photos.length;
  const lbl = document.getElementById('photo-count-lbl');
  const minRequired = agentState.editListingId ? 0 : 5;
  if (lbl) {
    const ok = n >= 5 || (agentState.editListingId && existing.length >= 5);
    lbl.innerHTML = agentState.editListingId
      ? `<span style="color:var(--t3);">${existing.length} saved photo${existing.length === 1 ? '' : 's'}</span>`
      : `<span style="color:${ok ? 'var(--em)' : 'var(--gold-l)'};">${n} / 12 photos</span> ${!ok ? `<span style="color:var(--gold-l);">(need ${5 - n} more)</span>` : '<span style="color:var(--em);">✓ minimum met</span>'}`;
  }
  const existingHtml = existing.map((url, i) => `
    <div class="photo-wrap existing">
      <img src="${url}" class="photo-thumb" alt="Saved photo ${i + 1}">
      <span class="photo-existing-tag">Saved</span>
    </div>`).join('');
  const newHtml = agentState.photos.map((p, i) => `
    <div class="photo-wrap">
      <img src="${p.preview}" class="photo-thumb" alt="Photo ${i + 1}">
      <button class="photo-del" onclick="deletePhoto(${i})">✕</button>
      <div class="gdot ${p.metadata?.gps_lat ? 'ok' : 'no'}">
        <span class="material-symbols-rounded" style="font-size:.6rem;">${p.metadata?.gps_lat ? 'location_on' : 'schedule'}</span>
      </div>
    </div>`).join('');
  c.innerHTML = existingHtml + newHtml;
}

function deletePhoto(i) {
  const p = agentState.photos[i];
  if (p?.preview) URL.revokeObjectURL(p.preview);
  agentState.photos.splice(i, 1);
  renderPhotoPreviews();
}

async function doCapture() {
  showToast('Capturing location pin — allow GPS access...');
  const gps = await getGPS();
  if (!gps.lat || !gps.lng) {
    showToast('Could not get GPS — try again or enable location in browser settings');
    return;
  }
  const now = nowStr();
  const dev = getDevice();
  agentState.trustMeta = { time: now, gps_lat: gps.lat, gps_lng: gps.lng, gps_acc: gps.acc, device: dev };
  const el = document.getElementById('metabox');
  if (el) {
    el.style.display = 'block';
    el.innerHTML = `<strong>LOCATION PIN LOCKED</strong>GPS: ${gps.lat} N, ${gps.lng} E (±${gps.acc})\nHardware: ${dev}\nTime Signature: ${now}`;
  }
  showToast('Location pin captured');
}

function hasExplicitLocationPin() {
  return !!(agentState.trustMeta?.gps_lat && agentState.trustMeta?.gps_lng);
}

function openGpsWarnModal() {
  const modal = document.getElementById('gps-warn-modal');
  if (modal) modal.classList.add('open');
}

function closeGpsWarnModal(event) {
  if (event && event.target !== event.currentTarget) return;
  const modal = document.getElementById('gps-warn-modal');
  if (modal) modal.classList.remove('open');
}

function gpsWarnPinNow() {
  closeGpsWarnModal();
  doCapture();
  const box = document.querySelector('.trust-capture-box');
  if (box) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function submitListing() {
  const title = document.getElementById('f-title')?.value.trim();
  const type = document.getElementById('f-type')?.value;
  const price = document.getElementById('f-price')?.value;
  const area = document.getElementById('f-area')?.value;
  const distance = document.getElementById('f-distance')?.value;
  const desc = document.getElementById('f-desc')?.value.trim();

  if (!title || !type || !price || !area || !distance) {
    showToast('Fill all required fields');
    return;
  }

  if (agentState.editListingId) {
    await dispatchListingUpdate();
    return;
  }

  if (agentState.photos.length < 5) {
    showToast(`Add at least 5 photos (${agentState.photos.length}/5 uploaded)`);
    return;
  }

  if (!hasExplicitLocationPin()) {
    openGpsWarnModal();
    return;
  }

  await dispatchListing();
}

async function confirmSubmitWithoutPin() {
  closeGpsWarnModal();
  await dispatchListing();
}

function listingContactErrorMessage(err) {
  if (err.code === 'CONTACT_INFO_NOT_ALLOWED') {
    const field = err.details?.[0]?.field || 'text';
    return `Remove contact details from ${field} — use KeffiRooms for student inquiries`;
  }
  return err.details?.[0]?.msg || err.message || 'Failed to save listing';
}

async function dispatchListingUpdate() {
  const amenities = Array.from(document.querySelectorAll('.amenity-check-label input:checked')).map((i) => i.value);
  const body = {
    title: document.getElementById('f-title')?.value.trim(),
    type: document.getElementById('f-type')?.value,
    price: parseInt(document.getElementById('f-price')?.value, 10),
    area: document.getElementById('f-area')?.value,
    distance: document.getElementById('f-distance')?.value,
    description: document.getElementById('f-desc')?.value.trim() || '',
    landmark: document.getElementById('f-landmark')?.value.trim() || '',
    amenities,
  };

  try {
    showToast('Saving changes...');
    const data = await API.listings.update(agentState.editListingId, body);
    const tag = data.listing?.serialNumber ? formatListingTag(data.listing.serialNumber) : 'Listing';
    showToast(`${tag} updated${data.listing?.status === 'pending' ? ' — pending admin review' : ''}`);
    setTimeout(() => hidePostForm(), 1300);
  } catch (e) {
    showToast(listingContactErrorMessage(e));
  }
}

async function dispatchListing() {
  const title = document.getElementById('f-title')?.value.trim();
  const type = document.getElementById('f-type')?.value;
  const price = document.getElementById('f-price')?.value;
  const area = document.getElementById('f-area')?.value;
  const distance = document.getElementById('f-distance')?.value;
  const desc = document.getElementById('f-desc')?.value.trim();
  const pin = agentState.trustMeta;
  const amenities = Array.from(document.querySelectorAll('.amenity-check-label input:checked')).map(i => i.value);
  const form = new FormData();
  form.append('title', title);
  form.append('type', type);
  form.append('price', price);
  form.append('area', area);
  form.append('distance', distance);
  form.append('description', desc || '');
  form.append('landmark', document.getElementById('f-landmark')?.value.trim() || '');
  form.append('amenities', JSON.stringify(amenities));
  form.append('locationPin', JSON.stringify(pin || null));
  form.append('photoMetadata', JSON.stringify(agentState.photos.map(p => ({
    ...p.metadata,
    gps_lat: p.metadata?.gps_lat || pin?.gps_lat || null,
    gps_lng: p.metadata?.gps_lng || pin?.gps_lng || null,
    gps_acc: p.metadata?.gps_acc || pin?.gps_acc || null,
  }))));

  agentState.photos.forEach(p => form.append('photos', p.file));

  try {
    showToast('Uploading listing...');
    const data = await API.listings.create(form);

    ['f-title', 'f-type', 'f-price', 'f-desc', 'f-area', 'f-distance', 'f-landmark'].forEach(fid => {
      const e = document.getElementById(fid);
      if (e) e.value = '';
    });
    document.querySelectorAll('.amenity-check-label input').forEach(i => { i.checked = false; });
    agentState.photos.forEach(p => { if (p.preview) URL.revokeObjectURL(p.preview); });
    agentState.photos = [];
    agentState.trustMeta = null;
    renderPhotoPreviews();
    const mb = document.getElementById('metabox');
    if (mb) mb.style.display = 'none';
    showToast(`Dispatched to verification queue${data.listing?.serialNumber ? ' as ' + formatListingTag(data.listing.serialNumber) : ''}`);
    setTimeout(() => hidePostForm(), 1300);
  } catch (e) {
    showToast(listingContactErrorMessage(e));
  }
}
