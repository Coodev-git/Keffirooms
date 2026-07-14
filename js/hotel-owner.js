/* Hotel owner portal — manage shop (storefront + room products) */

let hoState = { hotel: null, bookings: [], tab: 'shop' };

document.addEventListener('DOMContentLoaded', async () => {
  applyTheme();
  await initPlatform();
  const session = await requireAuthAsync('hotel');
  if (!session) return;
  if (session.role !== 'hotel' && session.role !== 'admin') {
    showToast('Hotel owner access only');
    goPage('auth-hotel.html');
    return;
  }
  if (session.role === 'hotel' && session.hotelOwnerStatus !== 'approved') {
    showToast('Awaiting admin approval');
    goPage('index.html');
    return;
  }
  await loadOwnerHotel();
});

async function loadOwnerHotel() {
  try {
    const { hotel } = await API.hotelOwner.mine();
    hoState.hotel = hotel;
    document.getElementById('ho-title').textContent = hotel.name;
    document.getElementById('ho-sub').textContent = `Your shop · ${hotel.area || 'Keffi'}${hotel.landmark ? ' · ' + hotel.landmark : ''} · pin stays private until payment`;
    const badge = document.getElementById('ho-badge');
    if (hotel.isActive && hotel.verifyStatus === 'verified') {
      badge.innerHTML = `<span class="ho-badge live"><span class="material-symbols-rounded" style="font-size:.9rem;">storefront</span> Shop live</span>`;
    } else {
      badge.innerHTML = `<span class="ho-badge wait"><span class="material-symbols-rounded" style="font-size:.9rem;">schedule</span> ${escapeHtml(hotel.verifyStatus || 'pending')}</span>`;
    }
    renderHoTab();
  } catch (e) {
    showToast(e.message || 'Could not load hotel');
  }
}

function hoTab(tab, el) {
  hoState.tab = tab;
  document.querySelectorAll('.ho-tab').forEach((b) => b.classList.remove('on'));
  el.classList.add('on');
  renderHoTab();
}

function roomThumbHtml(r) {
  const src = r.photos?.[0];
  if (src) return `<img src="${escapeHtml(src)}" alt="">`;
  return `<div class="ho-room-ph"><span class="material-symbols-rounded">bed</span></div>`;
}

async function renderHoTab() {
  const panel = document.getElementById('ho-panel');
  if (!panel || !hoState.hotel) return;

  if (hoState.tab === 'shop') {
    const rooms = hoState.hotel.rooms || [];
    const covers = (hoState.hotel.photos || []).slice(0, 6);
    panel.innerHTML = `
      <div class="ho-shop-intro">
        <div class="hs-card-name">Storefront</div>
        <p class="ho-hint">Cover photos (max 6) + room types with proof photos (max 4 each). Students browse like a shop, then book via WhatsApp.</p>
        ${covers.length ? `<div class="ho-cover-strip">${covers.map((p) => `<img src="${escapeHtml(p)}" alt="">`).join('')}</div>` : '<div class="hs-note">No cover photos yet — add them under Storefront tab.</div>'}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin:16px 0 10px;">
        <div class="hs-card-name">Room types (${rooms.length})</div>
        <button type="button" class="hs-btn-teal" onclick="hoOpenRoomForm()">+ Add room</button>
      </div>
      ${rooms.length ? rooms.map((r) => `
        <div class="ho-product-card">
          <div class="ho-product-media">${roomThumbHtml(r)}</div>
          <div class="ho-product-body">
            <div class="hs-adm-card-title">${escapeHtml(r.roomType)} · ₦${fmtN(r.price)}/night</div>
            <div class="hs-adm-meta">${escapeHtml(r.description || 'No description')} · ${r.isAvailable ? 'In stock' : 'Unavailable'} · ${(r.photos || []).length}/4 photos</div>
            <div class="ho-photo-row">
              ${(r.photos || []).map((p) => `<img src="${escapeHtml(p)}" alt="">`).join('') || '<span class="ho-hint">Add room photos for social proof</span>'}
            </div>
            <div class="hs-adm-actions">
              <button type="button" class="hs-btn-ghost" onclick="hoOpenRoomForm('${r.id}')">Edit</button>
              <button type="button" class="hs-btn-ghost" onclick="hoToggleRoom('${r.id}',${!r.isAvailable})">${r.isAvailable ? 'Mark unavailable' : 'Mark available'}</button>
            </div>
          </div>
        </div>`).join('') : '<div class="hs-note">Add at least one room type so students can book from your shop.</div>'}
      <div id="ho-room-modal" class="ho-modal" style="display:none;"></div>`;
    return;
  }

  if (hoState.tab === 'bookings') {
    panel.innerHTML = '<div class="hs-note">Loading bookings…</div>';
    try {
      const { bookings } = await API.hotelOwner.bookings();
      hoState.bookings = bookings || [];
    } catch {
      hoState.bookings = [];
    }
    if (!hoState.bookings.length) {
      panel.innerHTML = '<div class="empty" style="padding:24px;text-align:center;color:var(--t3);">No bookings yet. When students book, KeffiRooms coordinates on WhatsApp.</div>';
      return;
    }
    panel.innerHTML = hoState.bookings.map((b) => `
      <div class="hs-adm-card">
        <div class="hs-adm-card-title">${escapeHtml(b.bookingCode)} · ${escapeHtml(b.roomType)}</div>
        <div class="hs-adm-meta">
          <span class="hs-status ${escapeHtml(b.status)}">${escapeHtml(b.status.replace(/_/g, ' '))}</span>
          · ${String(b.requestedCheckinDate).slice(0, 10)} → ${String(b.requestedCheckoutDate).slice(0, 10)}
          · Guest: ${escapeHtml(b.studentName)}
        </div>
        <div class="hs-note" style="margin-top:8px;">Student phone is withheld. Reply to KeffiRooms on WhatsApp when asked about availability.</div>
      </div>`).join('');
    return;
  }

  // storefront details
  const h = hoState.hotel;
  panel.innerHTML = `
    <form class="hs-form-grid" onsubmit="hoSaveDetails(event)">
      <label>Shop name <input name="name" required value="${escapeHtml(h.name || '')}"></label>
      <label>Description <input name="description" value="${escapeHtml(h.description || '')}"></label>
      <label>Area (public) <input name="area" required value="${escapeHtml(h.area || '')}"></label>
      <label>Landmark (public) <input name="landmark" value="${escapeHtml(h.landmark || '')}"></label>
      <label>Location pin (private)
        <div id="ho-pin-mount"></div>
        <input type="hidden" name="pinLat" id="ho-pin-lat" value="${h.pinLat ?? ''}">
        <input type="hidden" name="pinLng" id="ho-pin-lng" value="${h.pinLng ?? ''}">
        <input type="hidden" name="pinAcc" id="ho-pin-acc" value="${escapeHtml(h.pinAcc || '')}">
        <input type="hidden" name="locationAddress" id="ho-pin-address" value="${escapeHtml(h.locationAddress || '')}">
      </label>
      <label>Price from <input name="priceRangeMin" type="number" required value="${h.priceRangeMin ?? ''}"></label>
      <label>Price up to <input name="priceRangeMax" type="number" required value="${h.priceRangeMax ?? ''}"></label>
      <label>Amenities (comma) <input name="amenities" value="${escapeHtml((h.amenities || []).join(', '))}"></label>
      <label>Cover photos (max 6 total)
        ${(h.photos || []).length ? `<div class="ho-cover-strip" style="margin:8px 0;">${h.photos.map((p) => `<img src="${escapeHtml(p)}" alt="">`).join('')}</div>` : ''}
        <input name="photos" type="file" accept="image/*" multiple>
      </label>
      <button type="submit" class="hs-btn-teal">Save storefront</button>
    </form>
    <div class="hs-note">Students see area + landmark + cover/room photos. Map pin is for admin and post-payment directions only.</div>`;
  mountHotelPinMap(document.getElementById('ho-pin-mount'), {
    lat: h.pinLat,
    lng: h.pinLng,
    acc: h.pinAcc,
    address: h.locationAddress,
    onChange(pin) {
      document.getElementById('ho-pin-lat').value = pin.lat;
      document.getElementById('ho-pin-lng').value = pin.lng;
      document.getElementById('ho-pin-acc').value = pin.acc || '';
      document.getElementById('ho-pin-address').value = pin.address || '';
    },
  }).catch(() => showToast('Map failed to load'));
}

function hoOpenRoomForm(roomId) {
  const room = roomId ? (hoState.hotel.rooms || []).find((r) => r.id === roomId) : null;
  const modal = document.getElementById('ho-room-modal');
  if (!modal) return;
  modal.style.display = 'block';
  modal.innerHTML = `
    <div class="ho-modal-card">
      <div class="hs-card-name">${room ? 'Edit room type' : 'Add room type'}</div>
      <form class="hs-form-grid" onsubmit="hoSaveRoom(event,'${room ? room.id : ''}')">
        <label>Room type <input name="roomType" required placeholder="Single / Double / Deluxe" value="${escapeHtml(room?.roomType || '')}"></label>
        <label>Price / night (₦) <input name="price" type="number" min="1" required value="${room?.price ?? ''}"></label>
        <label>Short description <input name="description" placeholder="AC, Wi‑Fi, ensuite…" value="${escapeHtml(room?.description || '')}"></label>
        <label>Room photos (max 4 — social proof)
          ${room?.photos?.length ? `<div class="ho-photo-row">${room.photos.map((p) => `<img src="${escapeHtml(p)}" alt="">`).join('')}</div>` : ''}
          <input name="photos" type="file" accept="image/*" multiple>
        </label>
        <div class="hs-adm-actions">
          <button type="submit" class="hs-btn-teal">${room ? 'Save' : 'Add to shop'}</button>
          <button type="button" class="hs-btn-ghost" onclick="document.getElementById('ho-room-modal').style.display='none'">Cancel</button>
        </div>
      </form>
    </div>`;
}

async function hoSaveRoom(e, roomId) {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData();
  fd.append('roomType', form.roomType.value.trim());
  fd.append('price', form.price.value);
  fd.append('description', form.description.value.trim());
  const files = form.photos?.files;
  if (files?.length) {
    const max = roomId
      ? Math.max(0, 4 - ((hoState.hotel.rooms || []).find((r) => r.id === roomId)?.photos?.length || 0))
      : 4;
    for (let i = 0; i < Math.min(files.length, max || 4); i += 1) fd.append('photos', files[i]);
  }
  try {
    if (roomId) await API.hotelOwner.updateRoom(roomId, fd);
    else await API.hotelOwner.addRoom(fd);
    showToast(roomId ? 'Room updated' : 'Room added to shop');
    await loadOwnerHotel();
  } catch (err) {
    showToast(err.message || 'Failed');
  }
}

async function hoToggleRoom(id, isAvailable) {
  try {
    await API.hotelOwner.updateRoom(id, { isAvailable });
    showToast('Room updated');
    await loadOwnerHotel();
  } catch (e) {
    showToast(e.message || 'Failed');
  }
}

async function hoSaveDetails(e) {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData();
  ['name', 'description', 'area', 'landmark', 'locationAddress', 'priceRangeMin', 'priceRangeMax', 'pinLat', 'pinLng', 'pinAcc'].forEach((k) => {
    if (form[k]) fd.append(k, form[k].value);
  });
  if (!form.pinLat?.value || !form.pinLng?.value) {
    showToast('Pin your hotel on the map');
    return;
  }
  const am = String(form.amenities.value || '').split(',').map((s) => s.trim()).filter(Boolean);
  fd.append('amenities', JSON.stringify(am));
  const files = form.photos?.files;
  if (files?.length) {
    const left = Math.max(0, 6 - (hoState.hotel.photos?.length || 0));
    for (let i = 0; i < Math.min(files.length, left || 6); i += 1) fd.append('photos', files[i]);
  }
  try {
    await API.hotelOwner.updateMine(fd);
    showToast('Storefront saved');
    await loadOwnerHotel();
  } catch (err) {
    showToast(err.message || 'Save failed');
  }
}
