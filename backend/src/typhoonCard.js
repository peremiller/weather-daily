import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

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
const GEO = { lonMin: 112, lonMax: 150, latMin: 3, latMax: 27 };

// PAR polygon (lon, lat) — PAGASA's official boundary.
const PAR = [
  [120, 25], [135, 25], [135, 5], [115, 5], [115, 15], [120, 21], [120, 25],
];

// Real coastlines (simplified Natural Earth 50m outlines), loaded once. Each is
// an array of rings; each ring an array of [lon, lat]. Falls back to [] if the
// data file is missing (map just omits that land).
const loadOutline = (name) => {
  try {
    return JSON.parse(readFileSync(join(__dirname, 'geo', name), 'utf8'));
  } catch {
    return [];
  }
};
const PH_OUTLINE = loadOutline('philippinesOutline.json');
const TW_OUTLINE = loadOutline('taiwanOutline.json');

const alertColor = (a) =>
  a === 'Red' ? '#e53935' : a === 'Orange' ? '#fb8c00' : '#43a047';

// Intensity-category colours (PAGASA scale) for track markers + legend.
const CAT_COLOR = { STY: '#e53935', TY: '#fb8c00', STS: '#fdd835', TS: '#43a047', TD: '#42a5f5' };
const CAT_LABEL = { TD: 'TD', TS: 'TS', STS: 'STS', TY: 'TY', STY: 'STY' };
const CAT_FULL = {
  TD: 'Tropical Depression',
  TS: 'Tropical Storm',
  STS: 'Severe Tropical Storm',
  TY: 'Typhoon',
  STY: 'Super Typhoon',
};
// PAGASA wind-speed bands (10-min max sustained). ASCII only (font-safe).
const CAT_RANGE = {
  TD: 'up to 61 km/h',
  TS: '62-88 km/h',
  STS: '89-117 km/h',
  TY: '118-184 km/h',
  STY: '185+ km/h',
};

// ---- date/time: everything renders in the user's location timezone ----------
// Format a UTC instant in the user's IANA timezone (e.g. "Asia/Manila").
// Returns { label:"WED JUL 8", time:"8 AM", tzAbbr:"GMT+8" }. All date/time on
// the card runs through this so it reflects the USER's current location.
function localParts(ms, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).formatToParts(new Date(ms));
  const g = (type) => (parts.find((p) => p.type === type) || {}).value || '';
  const minute = g('minute');
  const time = minute === '00' ? `${g('hour')} ${g('dayPeriod')}` : `${g('hour')}:${minute} ${g('dayPeriod')}`;
  return { label: `${g('weekday')} ${g('month')} ${g('day')}`.toUpperCase(), time, tzAbbr: g('timeZoneName') };
}

// "JULY 6, 2026" in the user's timezone (footer date).
function dateLabel(tz, d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).formatToParts(d);
  const g = (type) => (parts.find((p) => p.type === type) || {}).value || '';
  return `${g('month')} ${g('day')}, ${g('year')}`.toUpperCase();
}

/** Render the typhoon postcard as a PNG Buffer. `t` = getTyphoonWatch() result. */
export async function renderTyphoonCard(t, opts = {}) {
  const { createCanvas } = await loadCanvas();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const approaching = t.status === 'approaching';
  const ac = alertColor(t.alert);
  // User's location timezone (IANA). Defaults to Manila — this is a PAR card.
  const tz = opts.tz || 'Asia/Manila';

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
  const subline =
    t.status === 'inside'
      ? 'INSIDE PAR'
      : t.status === 'exited'
        ? 'HAS EXITED PAR'
        : 'APPROACHING PAR — NOT YET INSIDE';
  ctx.fillText(subline, 58, 176);
  // Philippine local name — "expected" until it's actually inside PAR (PAGASA
  // assigns the official name on entry).
  if (t.localName) {
    ctx.font = '30px RobotoBold';
    ctx.fillStyle = '#ffe08a';
    const nameLabel = t.status === 'inside' ? 'PH NAME (PAGASA)' : 'EXPECTED PH NAME';
    ctx.fillText(`${nameLabel}: ${t.localName.toUpperCase()}`, 58, 220);
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

  // Equal-aspect (cos-latitude) projection so the PAR / PH / storm keep TRUE
  // geographic proportions. A plain lon/lat stretch made 1° of longitude wider
  // than 1° of latitude, distorting the (roughly square) PAR into a wide box.
  const midLat = (GEO.latMin + GEO.latMax) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180);
  const lonSpanEq = (GEO.lonMax - GEO.lonMin) * cosLat;
  const latSpan = GEO.latMax - GEO.latMin;
  const scale = Math.min(pw / lonSpanEq, ph / latSpan); // px per degree of latitude
  const ox = px + (pw - lonSpanEq * scale) / 2; // centre the map in the panel
  const oy = py + (ph - latSpan * scale) / 2;
  const gx = (lon) => ox + (lon - GEO.lonMin) * cosLat * scale;
  const gy = (lat) => oy + (GEO.latMax - lat) * scale; // north up
  const gr = (deg) => deg * cosLat * scale; // ° -> px in the x direction

  // faint lat/lon grid
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let lon = 115; lon <= 150; lon += 5) {
    ctx.beginPath(); ctx.moveTo(gx(lon), py); ctx.lineTo(gx(lon), py + ph); ctx.stroke();
  }
  for (let lat = 0; lat <= 30; lat += 5) {
    ctx.beginPath(); ctx.moveTo(px, gy(lat)); ctx.lineTo(px + pw, gy(lat)); ctx.stroke();
  }

  // Real coastlines. The Philippines is the subject (green); neighbours like
  // Taiwan are drawn in a muted grey so they read as geographic CONTEXT — most
  // of Taiwan genuinely sits inside PAR (its 25°N edge runs through Taipei), so
  // the dimmer tone keeps that from looking like it's "part of" the PH area.
  const lands = [
    { outline: PH_OUTLINE, fill: '#6f9e78', stroke: 'rgba(255,255,255,0.18)' },
    { outline: TW_OUTLINE, fill: '#525f59', stroke: 'rgba(255,255,255,0.10)' },
  ];
  for (const { outline, fill, stroke } of lands) {
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    for (const ring of outline) {
      ctx.beginPath();
      ring.forEach(([lon, lat], i) => {
        const X = gx(lon), Y = gy(lat);
        i === 0 ? ctx.moveTo(X, Y) : ctx.lineTo(X, Y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  // land labels
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '22px RobotoBold';
  ctx.save();
  ctx.translate(gx(121.2), gy(12.5));
  ctx.rotate(-Math.PI / 2.3);
  ctx.fillText('PHILIPPINES', 0, 0);
  ctx.restore();
  if (TW_OUTLINE.length) {
    ctx.font = '17px RobotoBold';
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; // dimmer — it's context, not subject
    ctx.fillText('TAIWAN', gx(120.9), gy(23.6));
  }

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

  const nameTag = t.localName ? `${t.catAbbr} ${t.name} · ${t.localName}` : `${t.catAbbr} ${t.name}`;
  const track = t.timing && t.timing.track;

  if (track && track.length >= 2) {
    // ---- JMA forecast track (ScienceKonek-style) ----
    const pts = track.map((p) => ({ ...p, x: gx(p.lon), y: gy(p.lat) }));

    // Forecast-uncertainty cone: JMA probability circles (metres -> px). Drawn
    // as ONE union path so overlaps don't darken, giving a uniform soft swath.
    // Uses the dedicated `cone` layer when the track itself carries no radii
    // (i.e. when JTWC supplies the positions/winds).
    const conePts = (t.timing.cone || track).map((p) => ({ ...p, x: gx(p.lon), y: gy(p.lat) }));
    ctx.save();
    ctx.fillStyle = 'rgba(229,80,57,0.2)';
    ctx.beginPath();
    for (const p of conePts) {
      if (p.radiusM) {
        const rpx = (p.radiusM / 111000) * scale;
        ctx.moveTo(p.x + rpx, p.y);
        ctx.arc(p.x, p.y, rpx, 0, Math.PI * 2);
      }
    }
    ctx.fill();
    ctx.restore();

    // track line through the forecast positions
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 9]);
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // dated markers at each forecast position (i=0 is the current analysis).
    // Markers are colour-coded by intensity category; pills add the max wind
    // when JTWC winds are available.
    const hasWinds = pts.some((p) => p.windKph != null);
    // A dot at EVERY forecast point, but a label only on a spaced subset (every
    // other point + the last) so the denser JTWC track doesn't collide.
    let li = 0;
    pts.forEach((p, i) => {
      if (i === 0) return;
      const col = CAT_COLOR[p.cat] || '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      const labelThis = i % 2 === 0 || i === pts.length - 1;
      if (!labelThis) return;
      const d = localParts(p.ms, tz);
      // Alternate labels to opposite corners so neighbours don't stack; points
      // very near the storm are forced left to clear the swirl.
      const k = li++;
      const left = p.lon >= 143 ? true : k % 2 === 1;
      const vOff = k % 2 === 0 ? -40 : 40;
      trackLabel(
        ctx, p.x, p.y,
        d.label.toUpperCase(), // include the weekday, e.g. "WED JUL 8"
        d.time,
        p.windKph != null ? `${p.windKph} km/h` : null,
        col, left, vOff,
      );
    });

    // current position — the cyclone symbol + name tag (below-left, clear of labels)
    const c0 = pts[0];
    cyclone(ctx, c0.x, c0.y, gr(2.0), ac);
    tag(ctx, nameTag, c0.x - gr(1.5), c0.y + gr(2.0) + 26, ac);

    // "Forecast Intensity" key (bottom-left): colour · abbreviation · full name
    // · PAGASA wind band, so the TD/TS/STS/TY/STY acronyms + speeds are on-image.
    if (hasWinds) {
      const order = ['TD', 'TS', 'STS', 'TY', 'STY'];
      ctx.save();
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.font = '18px Roboto';
      let nameW = 0;
      let rangeW = 0;
      for (const c of order) {
        nameW = Math.max(nameW, ctx.measureText(CAT_FULL[c]).width);
        rangeW = Math.max(rangeW, ctx.measureText(CAT_RANGE[c]).width);
      }
      const abbrX = 34; // relative to box left
      const nameX = 82;
      const rangeX = nameX + nameW + 22;
      const rowH = 27;
      const titleH = 26;
      const boxW = rangeX + rangeW + 16;
      const boxH = titleH + order.length * rowH + 10;
      // Right side (bottom-right), so it never covers the Philippine map (left).
      const bx = px + pw - boxW - 16;
      const by = py + ph - boxH - 14;
      roundRect(ctx, bx, by, boxW, boxH, 10);
      ctx.fillStyle = 'rgba(8,20,30,0.85)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '15px RobotoBold';
      ctx.fillText('FORECAST INTENSITY', bx + 14, by + 16);
      let ry = by + titleH + rowH / 2;
      for (const c of order) {
        ctx.beginPath();
        ctx.arc(bx + 20, ry, 6, 0, Math.PI * 2);
        ctx.fillStyle = CAT_COLOR[c];
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '18px RobotoBold';
        ctx.fillText(c, bx + abbrX, ry + 1);
        ctx.fillStyle = 'rgba(255,255,255,0.82)';
        ctx.font = '18px Roboto';
        ctx.fillText(CAT_FULL[c], bx + nameX, ry + 1);
        ctx.fillStyle = CAT_COLOR[c];
        ctx.font = '17px RobotoBold';
        ctx.fillText(CAT_RANGE[c], bx + rangeX, ry + 1);
        ry += rowH;
      }
      ctx.restore();
    }
  } else {
    // ---- no official track: simple swirl + motion arrow ----
    const sLon = Math.min(t.lon, GEO.lonMax - 6.5);
    const scx = gx(sLon), scy = gy(t.lat);
    if (approaching) {
      ctx.strokeStyle = 'rgba(255,220,120,0.9)';
      ctx.lineWidth = 5;
      ctx.setLineDash([16, 12]);
      const tx = gx(132), ty = gy(t.lat + 2.5);
      ctx.beginPath(); ctx.moveTo(scx, scy); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.setLineDash([]);
      arrowHead(ctx, tx, ty, Math.atan2(ty - scy, tx - scx), 'rgba(255,220,120,0.95)');
    }
    cyclone(ctx, scx, scy, gr(6), ac);
    tag(ctx, nameTag, scx, scy + gr(6) + 26, ac);
  }

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
  // Past-tense the header once it has happened (tied to status, so it can never
  // disagree with the banner): a past entry reads "ENTERED PAR", not "PAR ENTRY".
  const entered = t.status === 'inside' || t.status === 'exited';
  const tcells = [
    [entered ? 'ENTERED PAR' : 'PAR ENTRY', fmtTiming(t.timing, 'entry', tz)],
    [t.status === 'exited' ? 'EXITED PAR' : 'PAR EXIT', fmtTiming(t.timing, 'exit', tz)],
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
  ctx.fillText(`FORECAST · ${opts.date || dateLabel(tz)}`, 40, stripY + 34);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '24px Roboto';
  const src = t.timing?.source === 'JTWC'
    ? 'Source: GDACS · track & winds JTWC/JMA · Follow official PAGASA bulletins'
    : t.timing?.source === 'JMA (RSMC Tokyo)'
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

// A cell's ENTRY/EXIT text: official JMA/JTWC time (in the user's timezone), a
// labelled estimate, or a PAGASA-defers message — never a fabricated time.
function fmtTiming(timing, which, tz) {
  if (!timing || !timing[which]) {
    return { main: 'PAGASA advises', sub: which === 'exit' ? 'beyond forecast' : 'on approach' };
  }
  const seg = timing[which];
  const isEst = timing.source === 'estimate' || seg.estimate;
  const d = localParts(seg.ms, tz);
  if (isEst) {
    return { main: `~${d.label}`, sub: `est. · assumed ${timing.assumedKmh || 20} km/h`, estimate: true };
  }
  const srcAbbr = seg.src || (timing.source === 'JTWC' ? 'JTWC' : timing.source && timing.source.startsWith('JMA') ? 'JMA' : 'fcst');
  return { main: d.label, sub: `${d.time} ${d.tzAbbr} · ${srcAbbr}` };
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

// Compact pill (DATE / time / wind) beside a track marker, with a leader line.
// `windStr` (optional) is drawn in the marker's category colour. `left` places
// it to the marker's left (near the storm); `vOff` de-overlaps neighbours.
function trackLabel(ctx, x, y, dateStr, timeStr, windStr, catColor, left = false, vOff = 34) {
  ctx.save();
  ctx.font = '18px RobotoBold';
  const w =
    Math.max(
      ctx.measureText(dateStr).width,
      ctx.measureText(timeStr).width,
      windStr ? ctx.measureText(windStr).width : 0,
    ) + 18;
  const h = windStr ? 60 : 44;
  const lx = left ? x - 12 - w : x + 12;
  const ly = y + vOff - h / 2;
  // leader from marker to pill
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(left ? lx + w : lx, ly + h / 2);
  ctx.stroke();
  roundRect(ctx, lx, ly, w, h, 8);
  ctx.fillStyle = 'rgba(10,22,34,0.85)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffe08a';
  ctx.font = '18px RobotoBold';
  ctx.fillText(dateStr, lx + w / 2, ly + 14);
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.font = '16px Roboto';
  ctx.fillText(timeStr, lx + w / 2, ly + 31);
  if (windStr) {
    ctx.fillStyle = catColor || '#fff';
    ctx.font = '17px RobotoBold';
    ctx.fillText(windStr, lx + w / 2, ly + 48);
  }
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
