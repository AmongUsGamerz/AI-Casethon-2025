"use strict";

/* ====== Small polyfills ====== */
if (!Array.prototype.flatMap) {
  Array.prototype.flatMap = function(cb, thisArg) {
    return this.reduce((acc, x, i, arr) => acc.concat(cb.call(thisArg, x, i, arr)), []);
  };
}

/* ====== Error helper ====== */
function showError(msg) {
  const el = document.getElementById('errBanner');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  console.error(msg);
}

/* ====== Unknown label helper ====== */
function clearNoData() {
  const el = document.getElementById('noDataMsg');
  if (!el) return;
  el.classList.add('hidden');
  el.textContent = '';
}
function setNoData(label) {
  const el = document.getElementById('noDataMsg');
  if (!el) return;
  el.innerHTML = `No data available for <span class="font-semibold">${String(label)}</span> on this page. Use the nav to switch groups.`;
  el.classList.remove('hidden');
}

/* Global error capture */
window.addEventListener('error', (e) => {
  showError(`Runtime error: ${e && e.message ? e.message : 'Unknown script error'}`);
});

/* ====== Constants & state ====== */
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DATA_SRC = { SAMPLE: 'sample', FATHOMNET: 'fathomnet' };

let map = null, heatLayer = null, routeGroup = null;
let mapReady = false;
let activeIndex = null;
let __uiReady = false;
let __queuedLabel = null;
let activeDataSource = DATA_SRC.SAMPLE; // default

/* Sanitizers */
function isValidLatLng(p) {
  if (!Array.isArray(p) || p.length < 2) return false;
  const lat = Number(p[0]); const lng = Number(p[1]);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat <= 90 && lat >= -90 && lng <= 180 && lng >= -180;
}
function sanitizePoints(arr) {
  return (Array.isArray(arr) ? arr.filter(isValidLatLng) : []);
}

/* FathomNet fetch (via backend proxy) */
async function fetchFathomNetPoints(concept) {
  const status = document.getElementById('srcStatus');
  try {
    if (!concept) return { hotspots: [], migrations: [] };
    status && (status.textContent = `Fetching FathomNet for ${concept}…`);
    const res = await fetch(`/api/fathomnet?concept=${encodeURIComponent(concept)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    status && (status.textContent = `FathomNet: ${data.hotspots?.length||0} points`);
    return { hotspots: Array.isArray(data.hotspots)? data.hotspots: [], migrations: Array.isArray(data.migrations)? data.migrations: [] };
  } catch (e) {
    status && (status.textContent = `FathomNet error: ${e.message}`);
    return { hotspots: [], migrations: [] };
  }
}

/* Map init (lazy) */
function ensureMap() {
  if (mapReady) return true;
  try {
    if (typeof L === 'undefined') {
      showError('Map library failed to load. Check network/CSP. Map will be disabled.');
      return false;
    }
    const panel = document.getElementById('panel');
    if (panel && panel.classList.contains('hidden')) {
      panel.classList.remove('hidden');
      panel.dataset.__tempReveal = '1';
    }
    map = L.map('map', { zoomControl: true, attributionControl: false }).setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 6 }).addTo(map);
    if (L.heatLayer) {
      heatLayer = L.heatLayer([], { radius: 20, blur: 15, maxZoom: 6 }).addTo(map);
    } else {
      showError('Heatmap plugin not available; density layer disabled.');
    }
    routeGroup = L.layerGroup().addTo(map);
    mapReady = true;
    if (panel && panel.dataset.__tempReveal === '1') {
      panel.classList.add('hidden');
      delete panel.dataset.__tempReveal;
    }
    return true;
  } catch (err) {
    showError('Map init error: ' + err.message);
    mapReady = false;
    return false;
  }
}

/* UI builders */
function buildTypeGallery() {
  const gal = document.getElementById('typeGallery');
  if (!gal) return;
  gal.innerHTML = '';
  const types = (window.SPECIES_DATA && Array.isArray(window.SPECIES_DATA.types)) ? window.SPECIES_DATA.types : [];
  if (!types.length) {
    gal.innerHTML = `<div class="text-slate-300">No species loaded for <span class="font-semibold">${window.SPECIES_NAME || '—'}</span> yet.</div>`;
    return;
  }
  types.forEach((t, i) => {
    const card = document.createElement('button');
    card.className = 'text-left bg-slate-800/70 ring-1 ring-slate-700 rounded-2xl p-3 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400';
    const sci = t && t.scientific ? t.scientific : '';
    const regs = (t && Array.isArray(t.regions)) ? t.regions.join(', ') : '';
    card.innerHTML = `
      <div class="text-base font-semibold">${t && t.common ? t.common : '—'}</div>
      <div class="text-xs text-slate-400 mt-1">${sci}</div>
      <div class="text-xs text-slate-400 mt-1">${regs}</div>
    `;
    card.onclick = () => { activeIndex = i; clearNoData(); renderPanel(); };
    gal.appendChild(card);
  });
}

async function renderPanel() {
  const panel = document.getElementById('panel');
  const monthInputEl = document.getElementById('monthInput');
  if (!panel || !monthInputEl) return;

  const types = (window.SPECIES_DATA && Array.isArray(window.SPECIES_DATA.types)) ? window.SPECIES_DATA.types : [];
  const t = (Number.isInteger(activeIndex) && activeIndex >= 0 && activeIndex < types.length) ? types[activeIndex] : null;
  if (!t) { panel.classList.add('hidden'); return; }

  panel.classList.remove('hidden');
  const monthVal = Number(monthInputEl.value || 1);

  const titleEl = document.getElementById('panelTitle');
  const descEl = document.getElementById('panelDesc');
  const sciEl = document.getElementById('panelSci');
  const famEl = document.getElementById('panelFamily');
  const regEl = document.getElementById('panelRegions');
  const monEl = document.getElementById('panelMonths');
  if (titleEl) titleEl.textContent = t.common || '—';
  if (descEl) descEl.textContent = t.info || '';
  if (sciEl) sciEl.textContent = t.scientific || '—';
  if (famEl) famEl.textContent = t.family || '—';
  if (regEl) regEl.textContent = Array.isArray(t.regions) ? t.regions.join(', ') : '—';
  if (monEl) monEl.textContent = Array.isArray(t.monthsBest) ? t.monthsBest.join(' • ') : '—';

  if (!ensureMap()) return;

  try {
    const useFathom = activeDataSource === DATA_SRC.FATHOMNET && t.fathomnetConcept;
    const data = useFathom ? await fetchFathomNetPoints(t.fathomnetConcept) : { hotspots: t.hotspots || [], migrations: t.migrations || [] };

    const heatDataRaw = Array.isArray(data.hotspots) ? data.hotspots.map(h => [h[0], h[1], h[2] || 0.5]) : [];
    const heatData = sanitizePoints(heatDataRaw).map(([la,ln,wt]) => [la,ln,wt]);
    if (heatLayer && typeof heatLayer.setLatLngs === 'function') {
      heatLayer.setLatLngs(heatData);
    }

    if (routeGroup && typeof routeGroup.clearLayers === 'function' && typeof L !== 'undefined') {
      routeGroup.clearLayers();
      (Array.isArray(t.migrations) ? t.migrations : []).forEach(r => {
        if (!r || !Array.isArray(r.path)) return;
        if (!r.months || r.months.includes(monthVal)) {
          const path = sanitizePoints(r.path);
          if (path.length && L.polyline) {
            L.polyline(path, { weight: 3, opacity: 0.9 }).addTo(routeGroup).bindTooltip(r.name || 'migration');
          }
        }
      });
    }

    const ptsA = heatData.map(h => [h[0], h[1]]);
    const migPts = (Array.isArray(t.migrations) ? t.migrations : []).flatMap(r => Array.isArray(r.path) ? sanitizePoints(r.path) : []);
    const allPts = sanitizePoints(ptsA.concat(migPts));
    if (allPts.length && typeof L !== 'undefined' && L.latLngBounds) {
      const bounds = L.latLngBounds(allPts);
      map.fitBounds(bounds.pad(0.2));
    } else {
      map.setView([20,0], 2);
    }
    setTimeout(() => { if (map && map.invalidateSize) map.invalidateSize(); }, 50);
  } catch (err) {
    showError('Map render error: ' + err.message);
  }
}

function setMonthLabel(val) {
  const i = Math.min(Math.max(1, Number(val || 1)), 12) - 1;
  const lbl = document.getElementById('monthLabel');
  if (lbl) lbl.textContent = MONTHS[i];
}

/* Public API */
window.setDetectedLabel = function(label) {
  try {
    if (!__uiReady) { __queuedLabel = label; return; }
    const banner = document.getElementById('detectedLabel');
    if (banner) banner.textContent = label || '—';
    clearNoData();
    const types = (window.SPECIES_DATA && Array.isArray(window.SPECIES_DATA.types)) ? window.SPECIES_DATA.types : [];
    const idx = types.findIndex(t => t && typeof t.common === 'string' && t.common.toLowerCase() === String(label||'').toLowerCase());
    if (idx >= 0) {
      activeIndex = idx;
      renderPanel();
    } else {
      setNoData(label);
      activeIndex = null;
      const panel = document.getElementById('panel');
      if (panel) panel.classList.add('hidden');
    }
  } catch (err) {
    showError('setDetectedLabel error: ' + err.message);
  }
};

/* Toggle sample vs fathomnet */
function wireDataSourceToggle(){
  const sample = document.getElementById('srcSample');
  const fathom = document.getElementById('srcFathomNet');
  const status = document.getElementById('srcStatus');
  if (!sample || !fathom) return;
  const set = () => {
    activeDataSource = fathom.checked ? DATA_SRC.FATHOMNET : DATA_SRC.SAMPLE;
    if (status) status.textContent = fathom.checked ? 'Using FathomNet (requires backend /api/fathomnet)' : 'Using bundled sample data';
    if (activeIndex != null) renderPanel();
  };
  sample.addEventListener('change', set);
  fathom.addEventListener('change', set);
  set();
}

/* Init */
function __initUI() {
  try {
    // Page title injection
    const h1 = document.querySelector('header h1');
    if (h1 && window.SPECIES_NAME) h1.textContent = `${h1.textContent} — ${window.SPECIES_NAME}`;

    buildTypeGallery();

    const monthInput = document.getElementById('monthInput');
    setMonthLabel(monthInput ? monthInput.value : 1);
    if (monthInput) {
      monthInput.addEventListener('input', (e) => {
        setMonthLabel(e.target.value);
        if (activeIndex != null) renderPanel();
      });
    }

    wireDataSourceToggle();

    // If URL has ?label=..., auto-select that species
    try {
      const url = new URL(window.location.href);
      const qLabel = url.searchParams.get('label');
      if (qLabel) { setTimeout(() => window.setDetectedLabel(qLabel), 0); }
    } catch (_e) { /* ignore */ }

    __uiReady = true;
    if (__queuedLabel) { const q = __queuedLabel; __queuedLabel = null; window.setDetectedLabel(q); }

    // Self-tests
    console.group('%cSelf-tests','color:#10b981');
    setMonthLabel(1); console.assert(document.getElementById('monthLabel').textContent === 'Jan', 'Month label Jan failed');
    setMonthLabel(12); console.assert(document.getElementById('monthLabel').textContent === 'Dec', 'Month label Dec failed');
    console.groupEnd();
  } catch (e) {
    showError('Init error: ' + (e && e.message ? e.message : e));
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', __initUI, { once: true });
} else {
  __initUI();
}

