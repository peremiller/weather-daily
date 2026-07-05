import { describeCode } from './weather.js';
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Daily-weather "postcard" — a rich, share-ready summary card matching the
 * My Daily Weather template (cream layout: NOW card, Next-6-days, Driest days,
 * PAGASA TenDay). Built as self-contained HTML so it can be rendered to a PNG
 * by any headless browser (Chrome/Chromium) — faithful to the design without a
 * pixel-by-pixel canvas re-implementation.
 *
 * buildPostcardHTML(w, tenday) -> full HTML string.
 *   w      = getForecast() result
 *   tenday = getPagasaTenDay() result (or null)
 */

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const utc = (s) => new Date(`${String(s).slice(0, 10)}T00:00:00Z`);
const dayName = (s) => WD[utc(s).getUTCDay()];
const moDay = (s) => `${MO[utc(s).getUTCMonth()]} ${utc(s).getUTCDate()}`;
const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function fmt12(iso) {
  const t = (iso || '').split('T')[1] || '';
  let [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return '';
  const ap = h < 12 ? 'AM' : 'PM';
  h = h % 12 || 12;
  return `${h}:${String(m || 0).padStart(2, '0')} ${ap}`;
}
const r = (n) => Math.round(n);

// Split "Las Piñas, Metro Manila" -> { city:"Las Piñas", region:"Metro Manila" }
function splitPlace(name) {
  const parts = String(name || '').split(',').map((s) => s.trim()).filter(Boolean);
  return { city: parts[0] || 'Your location', region: parts.slice(1).join(', ') };
}

export function buildPostcardHTML(w, tenday = null) {
  const { city, region } = splitPlace(w.location.name);
  const cur = describeCode(w.current.code);
  const today = describeCode(w.today.code);

  // header date from "now"
  const now = w.now || '';
  const hdrDate = `${dayName(now)} · ${moDay(now)}, ${utc(now).getUTCFullYear()}`;

  // rain windows + main band
  const slots = (w.today.rainSlots || []).join(', ');
  let band = '';
  if (w.rain && w.rain.type === 'start' && w.rain.changeAt) band = `Main band ~${fmt12(w.rain.changeAt.split('T')[1] ? w.rain.changeAt : '')}`.replace('~', '~');
  const bandTxt = w.rain && w.rain.changeAt
    ? ` · Main band ~${fmt12(w.rain.changeAt)}`
    : '';

  // 6-day strip — today first, then the next 5.
  const stripDays = [w.today, ...(w.days || [])].slice(0, 6);
  const dayRows = stripDays
    .map((d, i) => {
      const e = describeCode(d.code).emoji;
      const pp = d.precipProb ?? 0;
      const slot = (d.rainSlots || []).length ? `☂ rain ${(d.rainSlots || []).join(', ')}` : '';
      return `
      <div class="drow">
        <div class="dname"><b>${i === 0 ? 'Today' : dayName(d.date)}</b><span>${moDay(d.date)}</span></div>
        <div class="dmid">
          <div class="dtemps">${e} <b>${r(d.tempMax)}°</b> <s>/ ${r(d.tempMin)}°</s></div>
          <div class="bar"><i style="width:${Math.max(4, pp)}%"></i></div>
          ${slot ? `<div class="dslot">${esc(slot)}</div>` : ''}
        </div>
        <div class="drain">${pp}%</div>
      </div>`;
    })
    .join('');

  // driest days ahead (future days only), top 3
  const driest = [...(w.days || []).slice(0, 6)]
    .sort((a, b) => (a.precipProb ?? 101) - (b.precipProb ?? 101) || a.date.localeCompare(b.date))
    .slice(0, 3)
    .map((d, i) => `
      <div class="frow">
        <span class="rank">${i + 1}</span>
        <span class="fday"><b>${dayName(d.date)}</b> · ${moDay(d.date)}</span>
        <span class="fpct">💧 ${d.precipProb ?? 0}%</span>
      </div>`)
    .join('');

  // PAGASA status pill
  const tc = w.pagasa;
  const pill = tc && tc.active
    ? `<span class="pill pill--warn">⚠ PAGASA · ${esc(tc.name)}</span>`
    : `<span class="pill pill--ok">● PAGASA · No active tropical cyclone</span>`;

  // PAGASA TenDay panel
  let tenPanel = '';
  if (tenday && tenday.days && tenday.days.some((d) => d.tmax != null)) {
    const rows = tenday.days
      .filter((d) => d.tmax != null)
      .slice(0, 6)
      .map((d) => `
        <div class="trow">
          <span><b>${dayName(d.date)}</b> · ${moDay(d.date)}</span>
          <span class="tmax">${r(d.tmax)}°</span><span class="tmin">/ ${r(d.tmin)}°</span>
        </div>`)
      .join('');
    tenPanel = `
      <div class="panel panel--dark">
        <div class="phead">🇵🇭 PAGASA TenDay</div>
        <div class="psub">Official outlook · issued ${esc(tenday.issued)}</div>
        ${rows}
      </div>`;
  }

  const model = w.gfsModel ? '🛰️ Forecast: GFS + blend (PAGASA 10-day basis)' : '';

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  :root{--ink:#241f19;--muted:#8a7a63;--accent:#c0662a;--cream:#f4e7cf;--card:#fffdf7;--line:#e7d8bd;--blue:#3f6fd6;--dark:#2a2420;}
  *{margin:0;padding:0;box-sizing:border-box;font-family:-apple-system,"SF Pro Text",Helvetica,Arial,sans-serif}
  body{width:960px;height:560px;background:linear-gradient(160deg,#faf1de,#f1e2c6);color:var(--ink);padding:22px 24px}
  .head{display:flex;justify-content:space-between;align-items:flex-start}
  .kicker{color:var(--accent);font-weight:800;font-size:11px;letter-spacing:2px;text-transform:uppercase}
  h1{font-size:34px;font-weight:800;line-height:1.05;margin-top:2px}
  .sub{color:var(--muted);font-weight:600;font-size:13px;margin-left:2px}
  .htitle{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
  .hright{text-align:right}
  .pill{display:inline-block;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:700;color:#fff}
  .pill--ok{background:#3c9a5f}.pill--warn{background:#d0492e}
  .model{color:var(--muted);font-size:11px;font-weight:600;margin-top:7px}
  .grid{display:grid;grid-template-columns:302px 320px 1fr;gap:16px;margin-top:14px}
  /* ---- left ---- */
  .now{background:var(--dark);color:#fff;border-radius:16px;padding:14px 16px}
  .now .toprow{display:flex;justify-content:space-between;font-size:11px;font-weight:700;letter-spacing:1px}
  .now .lbl{color:#f0a45e;text-transform:uppercase}.now .cond{color:#d9ccbb}
  .now .big{display:flex;align-items:center;gap:10px;margin:4px 0 2px}
  .now .emoji{font-size:44px}.now .temp{font-size:56px;font-weight:800;line-height:1}
  .now .feels{color:#cbbfae;font-size:13px}
  .now .boxes{display:flex;gap:8px;margin-top:12px}
  .now .box{flex:1;background:rgba(255,255,255,.08);border-radius:10px;padding:7px 8px}
  .now .box .k{color:#f0a45e;font-size:9px;font-weight:800;letter-spacing:.5px}
  .now .box .v{font-size:16px;font-weight:800;margin-top:2px}
  .duo{display:flex;gap:10px;margin-top:10px}
  .mini{flex:1;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:9px 11px}
  .mini .k{color:var(--muted);font-size:9px;font-weight:800;letter-spacing:.5px;text-transform:uppercase}
  .mini .v{font-size:16px;font-weight:800;margin-top:1px}
  .band{background:linear-gradient(135deg,#3f6fd6,#5a86e0);color:#fff;border-radius:12px;padding:10px 12px;margin-top:10px}
  .band .t{font-weight:800;font-size:14px}.band .s{color:#dbe6ff;font-size:11px;margin-top:2px}
  .note{color:var(--muted);font-size:11px;font-weight:600;margin-top:10px;line-height:1.35}
  /* ---- middle ---- */
  .col h2{font-size:15px;font-weight:800;display:flex;align-items:center;gap:6px}
  .legend{color:var(--muted);font-size:10px;font-weight:700;float:right}
  .drow{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:8px 11px;margin-top:8px;display:flex;align-items:center;gap:10px}
  .dname{width:52px}.dname b{display:block;font-size:14px}.dname span{color:var(--muted);font-size:10px}
  .dmid{flex:1}.dtemps{font-size:13px}.dtemps s{color:var(--muted);text-decoration:none}
  .bar{height:6px;background:#e9dcc4;border-radius:6px;margin:5px 0 3px;overflow:hidden}
  .bar i{display:block;height:100%;background:linear-gradient(90deg,#5a86e0,#3f6fd6);border-radius:6px}
  .dslot{color:var(--accent);font-size:10px;font-weight:600}
  .drain{font-weight:800;color:var(--blue);font-size:13px}
  /* ---- right ---- */
  .panel{border-radius:14px;padding:12px 13px;margin-bottom:12px}
  .panel--cream{background:#fbf1dc;border:1px solid var(--line)}
  .panel--dark{background:var(--dark);color:#fff}
  .phead{font-weight:800;font-size:14px}
  .psub{color:#b0a291;font-size:10px;margin:2px 0 6px}
  .panel--cream .psub{color:var(--muted)}
  .frow{display:flex;align-items:center;gap:8px;padding:5px 0;border-top:1px dashed #e7d8bd}
  .frow:first-of-type{border-top:none}
  .rank{width:20px;height:20px;border-radius:50%;background:var(--accent);color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center}
  .fday{flex:1;font-size:13px}.fpct{font-weight:800;color:var(--blue);font-size:12px}
  .trow{display:flex;align-items:center;gap:8px;font-size:12px;padding:4px 0;border-top:1px solid rgba(255,255,255,.08)}
  .trow:first-of-type{border-top:none}.trow span:first-child{flex:1;color:#e7dccb}
  .tmax{color:#f0a45e;font-weight:800}.tmin{color:#b0a291}
  .foot{color:var(--muted);font-size:11px;font-weight:600;margin-top:2px}
  </style></head><body>
  <div class="head">
    <div>
      <div class="kicker">My Daily Weather · ${esc(hdrDate)}</div>
      <div class="htitle"><h1>${esc(city)}</h1><span class="sub">${esc(region)} 🇵🇭</span></div>
    </div>
    <div class="hright">${pill}<div class="model">${esc(model)}</div></div>
  </div>

  <div class="grid">
    <!-- LEFT -->
    <div class="col">
      <div class="now">
        <div class="toprow"><span class="lbl">Now</span><span class="cond">${esc(cur.label)}</span></div>
        <div class="big"><span class="emoji">${cur.emoji}</span><span class="temp">${r(w.current.temp)}°</span></div>
        <div class="feels">Feels like ${r(w.current.feelsLike)}°C</div>
        <div class="boxes">
          <div class="box"><div class="k">HIGH</div><div class="v">${r(w.today.tempMax)}°C</div></div>
          <div class="box"><div class="k">LOW</div><div class="v">${r(w.today.tempMin)}°C</div></div>
          <div class="box"><div class="k">RAIN CHANCE</div><div class="v">${w.today.precipProb ?? 0}%</div></div>
        </div>
      </div>
      <div class="duo">
        <div class="mini"><div class="k">💧 Humidity</div><div class="v">${w.current.humidity}%</div></div>
        <div class="mini"><div class="k">🌬 Wind</div><div class="v">up to ${r(w.today.windMax)} km/h</div></div>
      </div>
      <div class="band">
        <div class="t">${today.emoji} ${esc(today.label)} today</div>
        <div class="s">${slots ? `Rain windows: ${esc(slots)}` : 'No rain windows expected'}${esc(bandTxt)}</div>
      </div>
      <div class="duo">
        <div class="mini"><div class="k">☀️ Today</div><div class="v" style="font-size:13px">↑ ${fmt12(w.today.sunrise)} · ↓ ${fmt12(w.today.sunset)}</div></div>
        ${w.tomorrow ? `<div class="mini"><div class="k">🌙 Tomorrow</div><div class="v" style="font-size:13px">↑ ${fmt12(w.tomorrow.sunrise)} · ↓ ${fmt12(w.tomorrow.sunset)}</div></div>` : ''}
      </div>
      <div class="note">📄 See the full 12-day forecast — and switch your location anytime — in the My Daily Weather app.</div>
    </div>

    <!-- MIDDLE -->
    <div class="col">
      <h2><span class="legend">high / low · rain%</span>🗓 6-day forecast</h2>
      ${dayRows}
    </div>

    <!-- RIGHT -->
    <div class="col">
      <div class="panel panel--cream">
        <div class="phead">💧 Driest days ahead</div>
        <div class="psub">Lowest rain chance in the outlook</div>
        ${driest}
      </div>
      ${tenPanel}
      <div class="foot">📍 Moved? Message the bot <b>/changelocation</b> to update.</div>
    </div>
  </div>
  </body></html>`;
}

// Common headless-Chrome/Chromium locations. Override with env CHROME_PATH.
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

function findChrome() {
  return CHROME_CANDIDATES.find((p) => existsSync(p)) || null;
}

/**
 * Render the postcard HTML to a PNG Buffer using a local headless Chrome.
 * Returns null if no Chrome/Chromium is found (so callers degrade gracefully —
 * e.g. the bot falls back to the lightweight canvas card). On Railway/Docker,
 * install chromium and set CHROME_PATH to enable this.
 */
export async function renderPostcardPNG(w, tenday = null, opts = {}) {
  const chrome = opts.chromePath || findChrome();
  if (!chrome) {
    console.error('[postcard] no Chrome/Chromium found — set CHROME_PATH to enable');
    return null;
  }
  const stamp = `${process.pid}-${w.location?.latitude ?? 'x'}`;
  const htmlPath = join(tmpdir(), `postcard-${stamp}.html`);
  const pngPath = join(tmpdir(), `postcard-${stamp}.png`);
  writeFileSync(htmlPath, buildPostcardHTML(w, tenday));
  const args = [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    `--force-device-scale-factor=${opts.scale || 2}`,
    '--window-size=960,560', '--default-background-color=00000000',
    `--screenshot=${pngPath}`, `file://${htmlPath}`,
  ];
  try {
    await new Promise((resolve, reject) => {
      const p = spawn(chrome, args, { stdio: 'ignore' });
      const to = setTimeout(() => { p.kill(); reject(new Error('chrome timeout')); }, 20000);
      p.on('exit', (code) => { clearTimeout(to); code === 0 ? resolve() : reject(new Error(`chrome exit ${code}`)); });
      p.on('error', reject);
    });
    return readFileSync(pngPath);
  } catch (err) {
    console.error('[postcard] render failed:', err.message);
    return null;
  } finally {
    try { unlinkSync(htmlPath); } catch {}
    try { unlinkSync(pngPath); } catch {}
  }
}
