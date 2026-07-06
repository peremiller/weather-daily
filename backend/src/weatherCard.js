import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeCode } from './weather.js';
import { config } from './config.js';

// @napi-rs/canvas is a native module — load it LAZILY so that, if it fails to
// load in a given environment, only the image card is skipped (the rest of the
// bot keeps working). Fonts are registered once on first successful load.
const __dirname = dirname(fileURLToPath(import.meta.url));
const FONTS = join(__dirname, 'assets', 'fonts');
let _canvas = null;
async function loadCanvas() {
  if (_canvas) return _canvas;
  const mod = await import('@napi-rs/canvas');
  mod.GlobalFonts.registerFromPath(join(FONTS, 'roboto-400.woff2'), 'Roboto');
  mod.GlobalFonts.registerFromPath(join(FONTS, 'roboto-700.woff2'), 'RobotoBold');
  _canvas = mod;
  return mod;
}

const W = 1080;
const BASE_H = 640;
const R = '#ffffff';

// Gradient palette per weather category (matches the app's mood).
function gradientFor(code) {
  const k = kind(code);
  if (k === 'sun' || k === 'partly') return ['#2b86c5', '#6dd5fa'];
  if (k === 'rain' || k === 'storm') return ['#3a6073', '#5a86a8'];
  if (k === 'snow') return ['#5d8bb0', '#a7c7df'];
  return ['#3a7bd5', '#6aa6d8']; // cloud / default
}

function kind(code) {
  if (code === 0 || code === 1) return 'sun';
  if (code === 2) return 'partly';
  if (code >= 71 && code <= 86) return 'snow';
  if (code >= 95) return 'storm';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  return 'cloud';
}

// ---- weather glyphs (vector, so no emoji font needed) ----------------------
function sun(ctx, cx, cy, r, color = '#ffd23f') {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, r * 0.14);
  ctx.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 1.35, cy + Math.sin(a) * r * 1.35);
    ctx.lineTo(cx + Math.cos(a) * r * 1.85, cy + Math.sin(a) * r * 1.85);
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function cloud(ctx, cx, cy, w, color = R) {
  ctx.save();
  ctx.fillStyle = color;
  const u = w / 3;
  ctx.beginPath();
  ctx.arc(cx - u, cy, u * 0.8, 0, Math.PI * 2);
  ctx.arc(cx, cy - u * 0.5, u * 1.05, 0, Math.PI * 2);
  ctx.arc(cx + u, cy, u * 0.85, 0, Math.PI * 2);
  ctx.rect(cx - u * 1.8, cy, u * 3.6, u * 1.1);
  ctx.arc(cx - u * 1.8, cy + u * 0.55, u * 0.55, 0, Math.PI * 2);
  ctx.arc(cx + u * 1.8, cy + u * 0.55, u * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drops(ctx, cx, cy, w, n = 3, color = '#cfe8ff') {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, w * 0.05);
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = cx - w * 0.4 + (i * w * 0.8) / (n - 1 || 1);
    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.lineTo(x - w * 0.06, cy + w * 0.28);
    ctx.stroke();
  }
  ctx.restore();
}

function bolt(ctx, cx, cy, w, color = '#ffd23f') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.05, cy);
  ctx.lineTo(cx - w * 0.18, cy + w * 0.28);
  ctx.lineTo(cx, cy + w * 0.28);
  ctx.lineTo(cx - w * 0.08, cy + w * 0.55);
  ctx.lineTo(cx + w * 0.22, cy + w * 0.2);
  ctx.lineTo(cx + w * 0.03, cy + w * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Draw a weather glyph centred at (cx, cy) sized to ~`s`.
function glyph(ctx, code, cx, cy, s) {
  const k = kind(code);
  if (k === 'sun') return sun(ctx, cx, cy, s * 0.5);
  if (k === 'partly') {
    sun(ctx, cx - s * 0.35, cy - s * 0.3, s * 0.32);
    cloud(ctx, cx + s * 0.12, cy + s * 0.1, s * 0.95);
    return;
  }
  cloud(ctx, cx, cy - s * 0.12, s);
  if (k === 'rain') drops(ctx, cx, cy + s * 0.42, s);
  else if (k === 'storm') bolt(ctx, cx, cy + s * 0.4, s);
  else if (k === 'snow') drops(ctx, cx, cy + s * 0.42, s, 3, '#ffffff');
}

const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayAbbr = (dateStr) => wd[new Date(`${dateStr}T00:00:00Z`).getUTCDay()];
const unit = () => (config.units.temperature === 'fahrenheit' ? '°F' : '°C');

// "2026-06-19T05:26" -> "5:26 AM"
function fmt12(iso) {
  const t = (iso || '').split('T')[1] || '';
  let [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return '';
  const ap = h < 12 ? 'AM' : 'PM';
  h = h % 12 || 12;
  return `${h}:${String(m || 0).padStart(2, '0')} ${ap}`;
}

// A small "sun on the horizon" icon for sunrise/sunset.
function sunHorizon(ctx, cx, cy, color) {
  sun(ctx, cx, cy - 4, 11, color);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 20, cy + 14);
  ctx.lineTo(cx + 20, cy + 14);
  ctx.stroke();
  ctx.restore();
}

/** Render the weather card as a PNG Buffer (async: loads canvas lazily). */
export async function renderWeatherCard(w) {
  const { createCanvas } = await loadCanvas();
  const alert = !!(w.pagasa && w.pagasa.active);
  const bannerH = alert ? 76 : 0;
  const H = BASE_H + bannerH;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Full-bleed gradient background (opaque to every corner) — a rounded card
  // left transparent corners that some chat apps composite to white.
  const [c0, c1] = gradientFor(w.current.code);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // PAGASA tropical-cyclone alert strip across the top (only when active).
  if (alert) drawAlertBanner(ctx, w.pagasa, bannerH);

  // shift the rest of the card below the alert strip
  ctx.save();
  ctx.translate(0, bannerH);

  ctx.textBaseline = 'top';

  // location
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '34px Roboto';
  ctx.fillText(trunc(w.location.name, 44), 56, 48);

  // hero glyph + big temperature
  glyph(ctx, w.current.code, 150, 215, 130);
  ctx.fillStyle = R;
  ctx.font = '150px RobotoBold';
  const temp = `${Math.round(w.current.temp)}°`;
  ctx.fillText(temp, 270, 130);
  const tw = ctx.measureText(temp).width;
  ctx.font = '40px Roboto';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(unit(), 270 + tw + 12, 160);

  // condition + min/max (right aligned)
  const cur = describeCode(w.current.code);
  ctx.textAlign = 'right';
  ctx.fillStyle = R;
  ctx.font = '46px RobotoBold';
  ctx.fillText(trunc(cur.label, 22), W - 56, 150);
  ctx.font = '32px Roboto';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(
    `min ${Math.round(w.today.tempMin)}°   max ${Math.round(w.today.tempMax)}°`,
    W - 56,
    214
  );
  ctx.textAlign = 'left';

  // sunrise / sunset (middle band)
  const srTxt = `Sunrise ${fmt12(w.today.sunrise)}`;
  const ssTxt = `Sunset ${fmt12(w.today.sunset)}`;
  ctx.font = '30px Roboto';
  const iconW = 46;
  const srW = iconW + ctx.measureText(srTxt).width;
  const ssW = iconW + ctx.measureText(ssTxt).width;
  const total = srW + 70 + ssW;
  let sx2 = (W - total) / 2;
  const midY = 312;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  sunHorizon(ctx, sx2 + 16, midY, '#ffd23f');
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText(srTxt, sx2 + iconW, midY);
  sx2 += srW + 70;
  sunHorizon(ctx, sx2 + 16, midY, '#ff9e5e');
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText(ssTxt, sx2 + iconW, midY);
  ctx.textBaseline = 'top';

  // divider
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(56, 372);
  ctx.lineTo(W - 56, 372);
  ctx.stroke();

  // Day row — today first, then the next 6 — with the driest day highlighted.
  const days = [w.today, ...(w.days || [])].slice(0, 7);
  const colW = (W - 112) / days.length;
  let driestIdx = 0;
  for (let i = 1; i < days.length; i++) {
    if ((days[i].precipProb ?? 101) < (days[driestIdx].precipProb ?? 101)) driestIdx = i;
  }
  ctx.textAlign = 'center';
  days.forEach((d, i) => {
    const cx = 56 + colW * (i + 0.5);
    if (i === driestIdx) {
      // highlight the column
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      roundRect(ctx, cx - colW * 0.42, 400, colW * 0.84, 188, 18);
      ctx.fill();
      ctx.restore();
      // "☀ Driest" indicator above the column
      ctx.font = '22px RobotoBold';
      const label = 'Driest';
      const tw2 = ctx.measureText(label).width;
      const sx = cx - (16 + 8 + tw2) / 2;
      sun(ctx, sx + 7, 390, 7);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffe08a';
      ctx.fillText(label, sx + 22, 380);
      ctx.textAlign = 'center';
    }
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '30px RobotoBold';
    ctx.fillText(i === 0 ? 'Today' : dayAbbr(d.date), cx, 410);
    glyph(ctx, d.code, cx, 480, 44);
    ctx.fillStyle = R;
    ctx.font = '30px RobotoBold';
    ctx.fillText(`${Math.round(d.tempMax)}°`, cx, 522);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '28px Roboto';
    ctx.fillText(`${Math.round(d.tempMin)}°`, cx, 556);
  });

  // footer (its own line at the bottom)
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '24px Roboto';
  ctx.fillText('My Daily Weather', W / 2, 600);

  ctx.restore();
  return canvas.toBuffer('image/png');
}

// Red PAGASA tropical-cyclone alert strip (rounded top corners, flat bottom).
function drawAlertBanner(ctx, pagasa, bannerH) {
  ctx.save();
  ctx.fillStyle = '#d32f2f';
  ctx.beginPath();
  ctx.moveTo(0, bannerH);
  ctx.lineTo(0, 36);
  ctx.arcTo(0, 0, 36, 0, 36);
  ctx.lineTo(W - 36, 0);
  ctx.arcTo(W, 0, W, 36, 36);
  ctx.lineTo(W, bannerH);
  ctx.closePath();
  ctx.fill();

  // warning triangle
  const cy = bannerH / 2;
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.moveTo(56, cy - 22);
  ctx.lineTo(80, cy + 18);
  ctx.lineTo(32, cy + 18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#7a1f1f';
  ctx.font = '28px RobotoBold';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', 56, cy + 3);

  const sig =
    pagasa.signals && pagasa.signals.length ? '  ·  ' + pagasa.signals.join(', ') : '';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.font = '30px RobotoBold';
  ctx.fillText(trunc(`PAGASA: ${pagasa.name}${sig}`, 50), 100, cy + 2);
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

function trunc(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
