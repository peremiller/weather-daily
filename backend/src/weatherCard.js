import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeCode } from './weather.js';
import { config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONTS = join(__dirname, 'assets', 'fonts');
GlobalFonts.registerFromPath(join(FONTS, 'roboto-400.woff2'), 'Roboto');
GlobalFonts.registerFromPath(join(FONTS, 'roboto-700.woff2'), 'RobotoBold');

const W = 1080;
const H = 640;
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

/** Render the weather card as a PNG Buffer. */
export function renderWeatherCard(w) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // rounded card with gradient
  const [c0, c1] = gradientFor(w.current.code);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  ctx.fillStyle = g;
  roundRect(ctx, 0, 0, W, H, 36);
  ctx.fill();

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

  // divider
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(56, 372);
  ctx.lineTo(W - 56, 372);
  ctx.stroke();

  // 6-day row — with the driest day (lowest rain chance) highlighted.
  const days = (w.days || []).slice(0, 6);
  const colW = (W - 112) / 6;
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
    ctx.fillText(dayAbbr(d.date), cx, 410);
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

  return canvas.toBuffer('image/png');
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
