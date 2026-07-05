import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Typhoon "postcard" — a bold, share-ready forecast card for a tropical cyclone
 * inside or approaching PAR. Visual language is inspired by Philippine weather
 * pages, but every figure is REAL and attributed (GDACS / PAGASA): no invented
 * winds, no "Yolanda v2.0" clickbait. Public-safety info stays honest.
 *
 * Canvas is loaded lazily (native module) so a load failure only skips the
 * image, never crashes the bot. See weatherCard.js for the same pattern.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const FONTS = join(__dirname, 'assets', 'fonts');
let _canvas = null;
async function loadCanvas() {
  if (_canvas) return _canvas;
  const mod = await import('@napi-rs/canvas');
  try {
    mod.GlobalFonts.registerFromPath(join(FONTS, 'roboto-400.woff2'), 'Roboto');
    mod.GlobalFonts.registerFromPath(join(FONTS, 'roboto-700.woff2'), 'RobotoBold');
  } catch { /* fonts may already be registered */ }
  _canvas = mod;
  return mod;
}

const W = 1080;
const H = 1480; // taller to fit the PAR entry/exit band

// Geographic window the map panel spans (lon/lat). Includes PH (~120°E) and the
// Western Pacific approach corridor (~150°E).
const GEO = { lonMin: 112, lonMax: 150, latMin: -2, latMax: 30 };

// PAR polygon (lon, lat) — PAGASA's official boundary.
const PAR = [
  [120, 25], [135, 25], [135, 5], [115, 5], [115, 15], [120, 21], [120, 25],
];

// Very rough Philippine landmass blobs (lon, lat, radius°) — stylised, just
// enough to read as "the Philippines", not a survey map.
const PH_BLOBS = [
  [121.0, 17.0, 2.2], [121.3, 15.0, 2.0], [120.9, 13.3, 1.6], // Luzon
  [123.6, 11.0, 1.7], [125.0, 11.4, 1.1],                     // Visayas
  [124.8, 8.0, 2.1], [125.4, 6.6, 1.6],                       // Mindanao
];

const alertColor = (a) =>
  a === 'Red' ? '#e53935' : a === 'Orange' ? '#fb8c00' : '#43a047';

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
function dateLabel(d = new Date()) {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Render the typhoon postcard as a PNG Buffer. `t` = getTyphoonWatch() result. */
export async function renderTyphoonCard(t, opts = {}) {
  const { createCanvas } = await loadCanvas();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const approaching = t.status === 'approaching';
  const ac = alertColor(t.alert);

  // ---- background: deep stormy gradient ----
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0b1622');
  bg.addColorStop(0.55, '#12283a');
  bg.addColorStop(1, '#0a1a1a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ================= HEADLINE BANNER =================
  const banH = t.localName ? 252 : 210; // extra row for the expected PH name
  const bgrad = ctx.createLinearGradient(0, 0, W, banH);
  bgrad.addColorStop(0, '#7a1418');
  bgrad.addColorStop(1, ac);
  ctx.fillStyle = bgrad;
  ctx.fillRect(0, 0, W, banH);

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  // small kicker with a drawn warning triangle (no emoji font needed)
  warnTri(ctx, 70, 54, 26);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '34px RobotoBold';
  ctx.fillText('TYPHOON WATCH', 100, 54);

  // storm name — big
  ctx.fillStyle = '#ffffff';
  ctx.font = '92px RobotoBold';
  const title = `${t.category.toUpperCase()} ${t.name}`;
  fitText(ctx, title, 56, 118, W - 112, 92);

  // sub-line: relationship to PAR
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = '40px RobotoBold';
  ctx.fillText(
    approaching ? 'APPROACHING PAR — NOT YET INSIDE' : 'INSIDE PAR',
    58,
    176
  );
  // expected Philippine local name (PAGASA names on entry)
  if (t.localName) {
    ctx.font = '30px RobotoBold';
    ctx.fillStyle = '#ffe08a';
    ctx.fillText(`EXPECTED PH NAME: ${t.localName.toUpperCase()}`, 58, 220);
  }

  // ================= MAP PANEL =================
  const px = 40, py = banH + 34, pw = W - 80, ph = 640;
  // red frame like the reference postcards
  ctx.save();
  roundRect(ctx, px - 6, py - 6, pw + 12, ph + 12, 20);
  ctx.fillStyle = ac;
  ctx.fill();
  // ocean
  roundRect(ctx, px, py, pw, ph, 16);
  ctx.clip();
  const ocean = ctx.createLinearGradient(px, py, px, py + ph);
  ocean.addColorStop(0, '#123a4a');
  ocean.addColorStop(1, '#0c2733');
  ctx.fillStyle = ocean;
  ctx.fillRect(px, py, pw, ph);

  // map coords helpers (north up)
  const gx = (lon) => px + ((lon - GEO.lonMin) / (GEO.lonMax - GEO.lonMin)) * pw;
  const gy = (lat) => py + ((GEO.latMax - lat) / (GEO.latMax - GEO.latMin)) * ph;
  const gr = (deg) => (deg / (GEO.lonMax - GEO.lonMin)) * pw; // ° -> px (x scale)

  // faint lat/lon grid
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let lon = 115; lon <= 150; lon += 5) {
    ctx.beginPath(); ctx.moveTo(gx(lon), py); ctx.lineTo(gx(lon), py + ph); ctx.stroke();
  }
  for (let lat = 0; lat <= 30; lat += 5) {
    ctx.beginPath(); ctx.moveTo(px, gy(lat)); ctx.lineTo(px + pw, gy(lat)); ctx.stroke();
  }

  // Philippines landmass (stylised blobs)
  ctx.fillStyle = 'rgba(120,170,140,0.9)';
  ctx.beginPath();
  for (const [lon, lat, rad] of PH_BLOBS) {
    ctx.moveTo(gx(lon) + gr(rad), gy(lat));
    ctx.arc(gx(lon), gy(lat), gr(rad), 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '26px RobotoBold';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.translate(gx(122.2), gy(12.2));
  ctx.rotate(-Math.PI / 2.6);
  ctx.fillText('PHILIPPINES', 0, 0);
  ctx.restore();

  // PAR boundary (dashed)
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 8]);
  ctx.beginPath();
  PAR.forEach(([lon, lat], i) => {
    const X = gx(lon), Y = gy(lat);
    i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '30px RobotoBold';
  ctx.textAlign = 'left';
  ctx.fillText('PAR', gx(133.4), gy(23));

  // storm position (clamp so the full swirl stays inside the panel)
  const sLon = Math.min(t.lon, GEO.lonMax - 6.5);
  const scx = gx(sLon), scy = gy(t.lat);

  // forecast motion arrow: storm -> WNW toward PAR (dashed)
  if (approaching) {
    ctx.strokeStyle = 'rgba(255,220,120,0.9)';
    ctx.lineWidth = 5;
    ctx.setLineDash([16, 12]);
    const tx = gx(132), ty = gy(t.lat + 2.5);
    ctx.beginPath(); ctx.moveTo(scx, scy); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.setLineDash([]);
    arrowHead(ctx, tx, ty, Math.atan2(ty - scy, tx - scx), 'rgba(255,220,120,0.95)');
  }

  // the cyclone swirl
  cyclone(ctx, scx, scy, gr(6), ac);

  // storm name tag on the map (int'l name + expected PH name)
  tag(ctx, t.localName ? `${t.catAbbr} ${t.name} · ${t.localName}` : `${t.catAbbr} ${t.name}`,
    scx, scy + gr(6) + 26, ac);

  ctx.restore(); // end panel clip

  // ================= STAT ROW =================
  const sy = py + ph + 40;
  const cells = [
    ['CATEGORY', `${t.category}`],
    ['MAX WINDS', t.maxWindKph ? `${t.maxWindKph} km/h` : '—'],
    ['ALERT', (t.alert || '—').toUpperCase()],
  ];
  const cw = (W - 80 - 24 * 2) / 3;
  cells.forEach(([k, v], i) => {
    const x = 40 + i * (cw + 24);
    roundRect(ctx, x, sy, cw, 128, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.strokeStyle = i === 2 ? ac : 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2; ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '24px RobotoBold';
    ctx.textBaseline = 'top';
    ctx.fillText(k, x + cw / 2, sy + 22);
    ctx.fillStyle = i === 2 ? ac : '#ffffff';
    ctx.font = '40px RobotoBold';
    fitText(ctx, v, x + 12, sy + 66, cw - 24, 40, 'center');
  });

  // ================= PAR ENTRY / EXIT BAND =================
  const bandY = sy + 128 + 22;
  const bandH = 132;
  const tcells = [
    ['PAR ENTRY', fmtTiming(t.timing, 'entry')],
    ['PAR EXIT', fmtTiming(t.timing, 'exit')],
  ];
  const tcw = (W - 80 - 24) / 2;
  tcells.forEach(([k, val], i) => {
    const x = 40 + i * (tcw + 24);
    roundRect(ctx, x, bandY, tcw, bandH, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '24px RobotoBold';
    ctx.fillText(k, x + tcw / 2, bandY + 16);
    ctx.fillStyle = '#ffffff';
    ctx.font = '36px RobotoBold';
    fitText(ctx, val.main, x + 14, bandY + 52, tcw - 28, 36, 'center');
    if (val.sub) {
      ctx.fillStyle = val.estimate ? '#ffd23f' : 'rgba(255,255,255,0.6)';
      ctx.font = '22px Roboto';
      fitText(ctx, val.sub, x + 14, bandY + 98, tcw - 28, 22, 'center', false);
    }
  });

  // position + status line (auto-fit to width)
  const posY = bandY + bandH + 30;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  const ns = t.lat >= 0 ? 'N' : 'S';
  const status = approaching
    ? `approaching PAR · ~${t.degToPAR}° E of boundary`
    : 'inside PAR';
  fitText(
    ctx,
    `Center ${Math.abs(t.lat)}°${ns} ${t.lon}°E · ${status}`,
    40, posY, W - 80, 32, 'center', false
  );

  // ================= BOTTOM STRIP =================
  const stripY = H - 96;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0, stripY, W, 96);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd23f';
  ctx.font = '34px RobotoBold';
  ctx.fillText(`FORECAST · ${opts.date || dateLabel()}`, 40, stripY + 34);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '24px Roboto';
  const src = t.timing?.source === 'JMA (RSMC Tokyo)'
    ? 'Source: GDACS + JMA forecast · Follow official PAGASA bulletins'
    : t.timing?.source === 'estimate'
      ? 'Entry estimated · Source: GDACS · Follow official PAGASA bulletins'
      : 'Source: GDACS · Follow official PAGASA bulletins';
  ctx.fillText(src, 40, stripY + 68);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '28px RobotoBold';
  ctx.fillText('My Daily Weather', W - 40, stripY + 50);

  return canvas.toBuffer('image/png');
}

// Convert a UTC ms to Philippine time (UTC+8) parts for display.
function pht(ms) {
  const d = new Date(ms + 8 * 3600 * 1000); // shift, then read UTC fields
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  const mo = MONTHS[d.getUTCMonth()];
  let h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ap = h < 12 ? 'AM' : 'PM';
  h = h % 12 || 12;
  const time = m ? `${h}:${String(m).padStart(2, '0')} ${ap}` : `${h} ${ap}`;
  return { label: `${wd} ${mo} ${d.getUTCDate()}`, time };
}

// A cell's ENTRY/EXIT text: official JMA time, a labelled estimate, or a
// PAGASA-defers message — never a fabricated precise time.
function fmtTiming(timing, which) {
  if (!timing || !timing[which]) {
    return { main: 'PAGASA advises', sub: which === 'exit' ? 'beyond forecast' : 'on approach' };
  }
  const seg = timing[which];
  const isEst = timing.source === 'estimate' || seg.estimate;
  const d = pht(seg.ms);
  if (isEst) {
    return { main: `~${d.label}`, sub: `est. · assumed ${timing.assumedKmh || 20} km/h`, estimate: true };
  }
  return { main: d.label, sub: `${d.time} PHT · JMA` };
}

// ---- drawing helpers -------------------------------------------------------

// A cyclone: banded spiral arms + bright eye.
function cyclone(ctx, cx, cy, r, tint = '#e53935') {
  ctx.save();
  ctx.translate(cx, cy);
  // outer glow
  const glow = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r * 1.15);
  glow.addColorStop(0, 'rgba(255,255,255,0.35)');
  glow.addColorStop(0.5, 'rgba(200,225,255,0.16)');
  glow.addColorStop(1, 'rgba(200,225,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(0, 0, r * 1.15, 0, Math.PI * 2); ctx.fill();

  // spiral arms (logarithmic), a few, rotated
  const arms = 5;
  ctx.lineCap = 'round';
  for (let a = 0; a < arms; a++) {
    ctx.beginPath();
    const base = (a / arms) * Math.PI * 2;
    for (let s = 0; s <= 1; s += 0.04) {
      const ang = base + s * Math.PI * 1.7;
      const rad = r * 0.15 + s * r * 0.95;
      const x = Math.cos(ang) * rad;
      const y = Math.sin(ang) * rad;
      s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(235,244,255,${0.5 - a * 0.05})`;
    ctx.lineWidth = r * 0.16;
    ctx.stroke();
  }
  // eye
  ctx.fillStyle = '#fffbe6';
  ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = tint;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function arrowHead(ctx, x, y, ang, color) {
  const s = 22;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-s, -s * 0.5);
  ctx.lineTo(-s, s * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function tag(ctx, text, cx, cy, color) {
  ctx.save();
  ctx.font = '26px RobotoBold';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 28;
  roundRect(ctx, cx - w / 2, cy - 20, w, 40, 10);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(text, cx, cy + 1);
  ctx.restore();
}

// Shrink font until text fits maxW (single line).
function fitText(ctx, text, x, y, maxW, size, align = 'left', bold = true) {
  const prev = ctx.textAlign;
  const fam = bold ? 'RobotoBold' : 'Roboto';
  ctx.textAlign = align;
  let s = size;
  do {
    ctx.font = `${s}px ${fam}`;
    if (ctx.measureText(text).width <= maxW || s <= 20) break;
    s -= 2;
  } while (true);
  const drawX = align === 'center' ? x + maxW / 2 : x;
  ctx.fillText(text, drawX, y);
  ctx.textAlign = prev;
}

// A filled warning triangle with an exclamation mark, centred at (cx, cy).
function warnTri(ctx, cx, cy, size) {
  ctx.save();
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.moveTo(cx, cy - size * 0.55);
  ctx.lineTo(cx + size * 0.6, cy + size * 0.5);
  ctx.lineTo(cx - size * 0.6, cy + size * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#7a1418';
  ctx.font = `${Math.round(size * 0.7)}px RobotoBold`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', cx, cy + size * 0.13);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
