/* HotelSpace — shop storefront + stepped WhatsApp booking */

function fmtNg(n) {
  return `₦${Number(n || 0).toLocaleString('en-NG')}`;
}

function escapeHs(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hotelCover(hotel) {
  return hotel.photos?.[0] || hotel.proofPhotos?.[0] || hotel.rooms?.[0]?.photos?.[0] || null;
}

function shortDesc(text, n = 110) {
  const t = String(text || '').trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n).trim()}…`;
}

function hotelAreaLine(h) {
  const parts = [h.area, h.landmark].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Keffi · near NSUK';
}

function nightsBetween(checkin, checkout) {
  if (!checkin || !checkout) return 0;
  const a = new Date(`${checkin}T12:00:00`);
  const b = new Date(`${checkout}T12:00:00`);
  const diff = Math.round((b - a) / 86400000);
  return diff > 0 ? diff : 0;
}

function selectedRoom() {
  const h = hotelDetailState.hotel;
  if (!h) return null;
  return (h.rooms || []).find((r) => r.id === hotelDetailState.selectedRoomId) || null;
}

function bookingEstimate() {
  const room = selectedRoom();
  const nights = nightsBetween(hotelDetailState.checkin, hotelDetailState.checkout);
  if (!room || !nights) return null;
  return { nights, perNight: room.price, total: room.price * nights, room };
}

async function renderHotelList() {
  const grid = document.getElementById('hs-grid');
  if (!grid) return;
  try {
    const { hotels } = await API.hotels.list();
    if (!hotels?.length) {
      grid.innerHTML = `<div class="empty" style="padding:40px 16px;grid-column:1/-1;text-align:center;color:var(--t3);">
        <span class="material-symbols-rounded" style="font-size:2.5rem;display:block;margin-bottom:8px;">hotel</span>
        No hotel shops yet. Check back soon.
      </div>`;
      return;
    }
    grid.innerHTML = hotels.map((h, i) => {
      const cover = hotelCover(h);
      const img = cover
        ? `<img class="hs-card-img" src="${escapeHs(cover)}" alt="${escapeHs(h.name)}" loading="lazy">`
        : `<div class="hs-card-img placeholder"><span class="material-symbols-rounded">hotel</span></div>`;
      const rating = h.rating != null
        ? `<span class="hs-rating"><span class="material-symbols-rounded ms">star</span>${h.rating}</span>`
        : '';
      return `<article class="hs-card" style="animation-delay:${i * 40}ms" onclick="goPage('hotel.html?id=${h.id}')">
        ${img}
        <div class="hs-card-body">
          <div class="hs-card-top">
            <div class="hs-card-name">${escapeHs(h.name)}</div>
            ${rating}
          </div>
          <div class="hs-card-loc">
            <span class="material-symbols-rounded ms">location_on</span>
            ${escapeHs(hotelAreaLine(h))}
          </div>
          <div class="hs-card-desc">${escapeHs(shortDesc(h.description))} · ${h.roomCount || (h.rooms || []).length} room type${(h.roomCount || (h.rooms || []).length) === 1 ? '' : 's'}</div>
          <div class="hs-card-price">from ${fmtNg(h.priceRangeMin)} / night</div>
        </div>
      </article>`;
    }).join('');
  } catch (e) {
    grid.innerHTML = `<div class="empty" style="padding:40px 16px;grid-column:1/-1;text-align:center;color:var(--t3);">${escapeHs(e.message || 'Failed to load hotels')}</div>`;
  }
}

let hotelDetailState = {
  hotel: null,
  selectedRoomId: null,
  step: 1,
  checkin: '',
  checkout: '',
  studentName: '',
  studentPhone: '',
};

async function renderHotelDetail(id) {
  const root = document.getElementById('hs-detail-root');
  if (!root) return;
  try {
    const { hotel } = await API.hotels.get(id);
    const params = new URLSearchParams(location.search);
    hotelDetailState = {
      hotel,
      selectedRoomId: hotel.rooms?.[0]?.id || null,
      step: params.get('checkin') && params.get('checkout') ? 2 : 1,
      checkin: params.get('checkin') || '',
      checkout: params.get('checkout') || '',
      studentName: '',
      studentPhone: '',
    };
    paintHotelDetail();
  } catch (e) {
    root.innerHTML = `<div class="empty" style="padding:40px 16px;text-align:center;color:var(--t3);">${escapeHs(e.message || 'Hotel not found')}</div>`;
  }
}

function selectHotelRoom(roomId) {
  hotelDetailState.selectedRoomId = roomId;
  paintHotelDetail();
}

function persistBookFormFields() {
  const name = document.getElementById('hs-student-name');
  const phone = document.getElementById('hs-student-phone');
  const cin = document.getElementById('hs-checkin');
  const cout = document.getElementById('hs-checkout');
  if (name) hotelDetailState.studentName = name.value;
  if (phone) hotelDetailState.studentPhone = phone.value;
  if (cin) hotelDetailState.checkin = cin.value;
  if (cout) hotelDetailState.checkout = cout.value;
}

function hsSetStep(step) {
  persistBookFormFields();
  const rooms = (hotelDetailState.hotel?.rooms || []).filter((r) => r.isAvailable);
  if (step >= 2 && !hotelDetailState.selectedRoomId) {
    showToast('Pick a room type first');
    return;
  }
  if (step >= 3) {
    const nights = nightsBetween(hotelDetailState.checkin, hotelDetailState.checkout);
    if (!hotelDetailState.checkin || !hotelDetailState.checkout || nights < 1) {
      showToast('Choose check-in and check-out');
      return;
    }
  }
  if (!rooms.length && step > 1) {
    showToast('No rooms available right now');
    return;
  }
  hotelDetailState.step = Math.max(1, Math.min(3, step));
  paintHotelDetail();
  document.getElementById('hs-book-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function onStayDatesChange() {
  persistBookFormFields();
  const est = bookingEstimate();
  const el = document.getElementById('hs-nights-est');
  if (!el) return;
  if (!est) {
    el.innerHTML = 'Select check-out after check-in to see nights &amp; estimate.';
    return;
  }
  el.innerHTML = `<strong>${est.nights} night${est.nights > 1 ? 's' : ''}</strong> · ${fmtNg(est.perNight)}/night · est. <strong>${fmtNg(est.total)}</strong>`;
  const cout = document.getElementById('hs-checkout');
  if (cout && hotelDetailState.checkin) {
    const next = new Date(`${hotelDetailState.checkin}T12:00:00`);
    next.setDate(next.getDate() + 1);
    cout.min = next.toISOString().slice(0, 10);
  }
}

function paintHotelDetail() {
  const root = document.getElementById('hs-detail-root');
  const h = hotelDetailState.hotel;
  if (!root || !h) return;

  const shopPhotos = (h.photos || []).length
    ? h.photos.slice(0, 6)
    : (h.proofPhotos || []).slice(0, 6);
  const gallery = shopPhotos.length
    ? `<div class="hs-detail-gallery">${shopPhotos.map((p) => `<img src="${escapeHs(p)}" alt="">`).join('')}</div>`
    : `<div class="hs-detail-gallery"><div class="hs-card-img placeholder" style="grid-column:1/-1;aspect-ratio:16/9;border-radius:12px;"><span class="material-symbols-rounded">storefront</span></div></div>`;

  const rating = h.rating != null
    ? `<span class="hs-rating"><span class="material-symbols-rounded ms">star</span>${h.rating}</span>`
    : '';

  const amenities = (h.amenities || []).map((a) => `<span class="hs-amenity">${escapeHs(a)}</span>`).join('');
  const rooms = (h.rooms || []).filter((r) => r.isAvailable);
  const proof = (h.proofPhotos || []).slice(0, 8);
  const step = hotelDetailState.step;
  const today = new Date().toISOString().slice(0, 10);
  const est = bookingEstimate();
  const room = selectedRoom();

  const productHtml = rooms.length
    ? `<div class="hs-product-grid">${rooms.map((r) => {
        const on = hotelDetailState.selectedRoomId === r.id ? ' on' : '';
        const thumb = r.photos?.[0];
        const media = thumb
          ? `<img src="${escapeHs(thumb)}" alt="">`
          : `<div class="hs-product-ph"><span class="material-symbols-rounded">bed</span></div>`;
        return `<button type="button" class="hs-product${on}" onclick="selectHotelRoom('${r.id}')">
          <div class="hs-product-media">${media}</div>
          <div class="hs-product-body">
            <div class="hs-room-type">${escapeHs(r.roomType)}</div>
            <div class="hs-room-meta">${escapeHs(r.description || 'Ready for short stay')}</div>
            <div class="hs-room-price">${fmtNg(r.price)}<span>/night</span></div>
            ${(r.photos || []).length > 1 ? `<div class="hs-product-mini">${r.photos.slice(1, 4).map((p) => `<img src="${escapeHs(p)}" alt="">`).join('')}</div>` : ''}
          </div>
        </button>`;
      }).join('')}</div>`
    : `<div class="hs-note">No room types available right now. Check back later.</div>`;

  const proofStrip = proof.length
    ? `<div class="hs-proof">
        <div class="hs-card-name" style="margin-bottom:8px;">Room photos</div>
        <div class="hs-proof-strip">${proof.map((p) => `<img src="${escapeHs(p)}" alt="Room photo">`).join('')}</div>
      </div>`
    : '';

  const stepsBar = `
    <div class="hs-steps" aria-label="Booking steps">
      <div class="hs-step${step === 1 ? ' on' : ''}${step > 1 ? ' done' : ''}"><span>1</span> Room</div>
      <div class="hs-step${step === 2 ? ' on' : ''}${step > 2 ? ' done' : ''}"><span>2</span> Dates</div>
      <div class="hs-step${step === 3 ? ' on' : ''}"><span>3</span> WhatsApp</div>
    </div>`;

  let bookBody = '';
  if (step === 1) {
    bookBody = `
      <div class="hs-card-name" style="margin-bottom:10px;">Choose a room type</div>
      ${productHtml}
      <button class="hs-book-btn" type="button" onclick="hsSetStep(2)" ${rooms.length ? '' : 'disabled'}>
        Continue to dates
        <span class="material-symbols-rounded">arrow_forward</span>
      </button>`;
  } else if (step === 2) {
    bookBody = `
      <div class="hs-card-name" style="margin-bottom:4px;">When are you staying?</div>
      <p class="hs-step-hint">Selected: <strong>${escapeHs(room?.roomType || 'Room')}</strong> · ${fmtNg(room?.price || 0)}/night</p>
      <div class="hs-form-grid hs-form-2">
        <label>Check-in
          <input type="date" id="hs-checkin" min="${today}" value="${escapeHs(hotelDetailState.checkin)}" onchange="onStayDatesChange()" required>
        </label>
        <label>Check-out
          <input type="date" id="hs-checkout" min="${today}" value="${escapeHs(hotelDetailState.checkout)}" onchange="onStayDatesChange()" required>
        </label>
      </div>
      <div class="hs-nights-est" id="hs-nights-est">${est
    ? `<strong>${est.nights} night${est.nights > 1 ? 's' : ''}</strong> · ${fmtNg(est.perNight)}/night · est. <strong>${fmtNg(est.total)}</strong>`
    : 'Select check-out after check-in to see nights &amp; estimate.'}</div>
      <div class="hs-step-actions">
        <button class="hs-btn-ghost" type="button" onclick="hsSetStep(1)">Back</button>
        <button class="hs-book-btn" type="button" onclick="hsSetStep(3)" ${est ? '' : 'disabled'}>
          Continue
          <span class="material-symbols-rounded">arrow_forward</span>
        </button>
      </div>`;
  } else {
    bookBody = `
      <div class="hs-card-name" style="margin-bottom:4px;">Confirm on WhatsApp</div>
      <p class="hs-step-hint">We’ll create a booking code, then open WhatsApp to our coordinator — no account needed.</p>
      <div class="hs-summary">
        <div><span>Hotel</span><strong>${escapeHs(h.name)}</strong></div>
        <div><span>Area</span><strong>${escapeHs(hotelAreaLine(h))}</strong></div>
        <div><span>Room</span><strong>${escapeHs(room?.roomType || '—')}</strong></div>
        <div><span>Stay</span><strong>${escapeHs(hotelDetailState.checkin)} → ${escapeHs(hotelDetailState.checkout)}${est ? ` (${est.nights}n)` : ''}</strong></div>
        <div><span>Est. total</span><strong>${est ? fmtNg(est.total) : '—'}</strong></div>
      </div>
      <div class="hs-form-grid">
        <label>Your name
          <input type="text" id="hs-student-name" placeholder="Full name" maxlength="120" value="${escapeHs(hotelDetailState.studentName)}" required>
        </label>
        <label>WhatsApp phone
          <input type="tel" id="hs-student-phone" placeholder="08012345678" value="${escapeHs(hotelDetailState.studentPhone)}" required>
        </label>
      </div>
      <div class="hs-note"><strong>Privacy:</strong> exact pin / street address stays hidden until payment is confirmed on WhatsApp.</div>
      <div class="hs-step-actions">
        <button class="hs-btn-ghost" type="button" onclick="hsSetStep(2)">Back</button>
        <button class="hs-book-btn" id="hs-book-btn" type="button" onclick="submitHotelBooking()">
          <span class="material-symbols-rounded">chat</span>
          Book &amp; open WhatsApp
        </button>
      </div>`;
  }

  root.innerHTML = `
    ${gallery}
    <div class="hs-detail-section">
      <div class="hs-shop-kicker">Hotel shop</div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <div class="hs-card-price">from ${fmtNg(h.priceRangeMin)} / night</div>
        ${rating}
      </div>
      <h1 class="hs-detail-title">${escapeHs(h.name)}</h1>
      <div class="hs-card-loc" style="margin-bottom:8px;">
        <span class="material-symbols-rounded ms">location_on</span>
        ${escapeHs(hotelAreaLine(h))}
      </div>
      <p class="hs-detail-desc">${escapeHs(h.description || '')}</p>
      ${amenities ? `<div class="hs-amenity-row">${amenities}</div>` : ''}
      <div class="hs-note"><strong>Exact address is hidden</strong> until payment is confirmed by KeffiRooms on WhatsApp.</div>
    </div>
    ${proofStrip ? `<div class="hs-detail-section" style="padding-top:0;">${proofStrip}</div>` : ''}
    <div class="hs-detail-section" id="hs-book-section" style="padding-top:0;">
      ${stepsBar}
      ${bookBody}
    </div>
  `;
  if (step === 2) onStayDatesChange();
}

async function submitHotelBooking() {
  persistBookFormFields();
  const h = hotelDetailState.hotel;
  const roomId = hotelDetailState.selectedRoomId;
  if (!h || !roomId) {
    showToast('Select a room first');
    return;
  }
  const studentName = hotelDetailState.studentName?.trim();
  const studentPhone = hotelDetailState.studentPhone?.trim();
  const requestedCheckinDate = hotelDetailState.checkin;
  const requestedCheckoutDate = hotelDetailState.checkout;
  if (!studentName || !studentPhone || !requestedCheckinDate || !requestedCheckoutDate) {
    showToast('Fill in all booking fields');
    return;
  }
  if (nightsBetween(requestedCheckinDate, requestedCheckoutDate) < 1) {
    showToast('Check-out must be after check-in');
    return;
  }
  const btn = document.getElementById('hs-book-btn');
  if (btn) btn.disabled = true;
  try {
    const { booking } = await API.hotels.book({
      roomId,
      studentName,
      studentPhone,
      requestedCheckinDate,
      requestedCheckoutDate,
    });
    const est = bookingEstimate();
    const root = document.getElementById('hs-detail-root');
    root.innerHTML = `<div class="hs-success">
      <span class="material-symbols-rounded" style="font-size:3rem;color:var(--teal-l);">check_circle</span>
      <div class="hs-card-name" style="margin-top:8px;">Almost done</div>
      <div class="hs-success-code">${escapeHs(booking.bookingCode)}</div>
      <p class="hs-detail-desc">Your request for <strong>${escapeHs(h.name)}</strong>${est ? ` (${est.nights} night${est.nights > 1 ? 's' : ''}, est. ${fmtNg(est.total)})` : ''} is ready. Send this code on WhatsApp and arrange transfer — address unlocks after confirmation.</p>
      <ol class="hs-success-steps">
        <li>Open WhatsApp with the message pre-filled</li>
        <li>Send payment as the coordinator instructs</li>
        <li>Get the exact address once confirmed</li>
      </ol>
      <a class="hs-wa-btn" href="${escapeHs(booking.whatsappUrl)}" target="_blank" rel="noopener">
        <span class="material-symbols-rounded">chat</span> Open WhatsApp
      </a>
      <div style="margin-top:16px;">
        <button class="hs-btn-ghost" type="button" onclick="goPage('seeker.html?mode=stay')">Back to short stays</button>
      </div>
    </div>`;
    if (booking.whatsappUrl) {
      window.open(booking.whatsappUrl, '_blank', 'noopener');
    }
  } catch (e) {
    showToast(e.message || 'Booking failed');
    if (btn) btn.disabled = false;
  }
}
