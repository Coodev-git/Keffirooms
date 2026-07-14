/* Shared Leaflet map pin picker for hotel registration / owner details */

const KEFFI_CENTER = { lat: 8.8486, lng: 7.8736 };

function ensureHotelPinAssets() {
  if (!document.getElementById('leaflet-css')) {
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }
  if (!window.L) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Map failed to load'));
      document.head.appendChild(s);
    });
  }
  return Promise.resolve();
}

async function reverseHotelPin(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.display_name || null;
  } catch {
    return null;
  }
}

/**
 * Mount a pin picker into containerEl.
 * options: { lat, lng, onChange({lat,lng,acc,address}) }
 */
async function mountHotelPinMap(containerEl, options = {}) {
  if (!containerEl) return null;
  await ensureHotelPinAssets();

  const startLat = options.lat != null ? Number(options.lat) : KEFFI_CENTER.lat;
  const startLng = options.lng != null ? Number(options.lng) : KEFFI_CENTER.lng;
  const hasStart = options.lat != null && options.lng != null;

  containerEl.innerHTML = `
    <div class="ht-pin-wrap">
      <div class="ht-pin-toolbar">
        <button type="button" class="ht-pin-btn" id="ht-pin-gps">
          <span class="material-symbols-rounded">my_location</span>
          Use my location
        </button>
        <span class="ht-pin-hint" id="ht-pin-status">${hasStart ? 'Pin set — drag or tap to adjust' : 'Tap the map to pin your hotel'}</span>
      </div>
      <div class="ht-pin-map" id="ht-pin-map"></div>
      <div class="ht-pin-coords" id="ht-pin-coords">${hasStart ? `${startLat.toFixed(6)}, ${startLng.toFixed(6)}` : 'No pin yet'}</div>
    </div>`;

  const map = L.map(containerEl.querySelector('#ht-pin-map'), {
    zoomControl: true,
    attributionControl: true,
  }).setView([startLat, startLng], hasStart ? 16 : 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);

  let marker = null;
  const state = {
    lat: hasStart ? startLat : null,
    lng: hasStart ? startLng : null,
    acc: options.acc || null,
    address: options.address || null,
  };

  async function setPin(lat, lng, acc = null) {
    state.lat = Number(Number(lat).toFixed(6));
    state.lng = Number(Number(lng).toFixed(6));
    state.acc = acc;
    if (!marker) {
      marker = L.marker([state.lat, state.lng], { draggable: true }).addTo(map);
      marker.on('dragend', async () => {
        const p = marker.getLatLng();
        await setPin(p.lat, p.lng, state.acc);
      });
    } else {
      marker.setLatLng([state.lat, state.lng]);
    }
    map.setView([state.lat, state.lng], Math.max(map.getZoom(), 16));
    const coordsEl = containerEl.querySelector('#ht-pin-coords');
    const statusEl = containerEl.querySelector('#ht-pin-status');
    if (coordsEl) coordsEl.textContent = `${state.lat}, ${state.lng}${acc ? ` (±${acc})` : ''}`;
    if (statusEl) statusEl.textContent = 'Looking up address…';
    const label = await reverseHotelPin(state.lat, state.lng);
    state.address = label || `Map pin near Keffi (${state.lat}, ${state.lng})`;
    if (statusEl) statusEl.textContent = 'Pin locked — drag marker to fine-tune';
    if (typeof options.onChange === 'function') options.onChange({ ...state });
    setTimeout(() => map.invalidateSize(), 80);
  }

  map.on('click', (e) => setPin(e.latlng.lat, e.latlng.lng));

  containerEl.querySelector('#ht-pin-gps')?.addEventListener('click', async () => {
    const statusEl = containerEl.querySelector('#ht-pin-status');
    if (statusEl) statusEl.textContent = 'Getting GPS…';
    if (!navigator.geolocation) {
      if (statusEl) statusEl.textContent = 'GPS not available — tap the map instead';
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => setPin(p.coords.latitude, p.coords.longitude, `${Math.round(p.coords.accuracy)}m`),
      () => {
        if (statusEl) statusEl.textContent = 'GPS denied — tap the map to pin instead';
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });

  if (hasStart) await setPin(startLat, startLng, options.acc || null);

  // Leaflet needs a resize after sheet animation
  setTimeout(() => map.invalidateSize(), 200);

  return {
    getPin: () => (state.lat != null ? { ...state } : null),
    setPin,
    map,
  };
}
