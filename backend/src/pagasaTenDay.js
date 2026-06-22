import { fromArrayBuffer } from 'geotiff';
import { isPhilippines } from './weather.js';

/**
 * PAGASA's official 10-Day (TenDay) forecast, sampled at a point.
 *
 * PAGASA publishes the TenDay forecast only as GeoTIFF map rasters (no point
 * JSON API). We download the daily TMAX/TMIN rasters and sample the pixel at
 * the user's lat/lon. The rasters are continuous 8-bit values linearly scaled
 * over the variable's domain ([0,40] °C for both TMAX and TMIN). Rasters are
 * cached per issuance so repeat lookups are cheap.
 *
 * NOTE: this is GFS-derived (same basis as our main forecast) and slightly
 * quantized vs the live API — it's surfaced as PAGASA's *official* outlook.
 */
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120 Safari/537.36';
const REFERER = 'https://tenday.pagasa.dost.gov.ph/';
const ISSUANCE_URL = 'https://tenday.pagasa.dost.gov.ph/api/v1/tenday/issuance';
const S3 = 'https://tendayforecast.s3.ap-southeast-1.amazonaws.com';
const TEMP_DOMAIN_MAX = 40; // °C; rasters are 0..255 linear over [0,40]

const rasterCache = new Map(); // `${o}/${v}/${dy}` -> ArrayBuffer
let issuanceCache = { t: 0, value: null };

const ymd = (dateStr) => dateStr.replace(/-/g, '');
const addDays = (dateStr, n) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// PAGASA's issuance API is occasionally down; fall back to probing S3 for the
// latest available issuance folder (the issuance date is also the start date).
async function probeIssuanceFromS3() {
  const phNow = new Date(Date.now() + 8 * 3600 * 1000); // Asia/Manila
  for (let i = 0; i < 5; i++) {
    const d = new Date(phNow);
    d.setUTCDate(d.getUTCDate() - i);
    const date = d.toISOString().slice(0, 10);
    const dy = ymd(date);
    try {
      const res = await fetch(`${S3}/${dy}/TMAX/TMAX_${dy}.tif`, {
        headers: { 'User-Agent': UA, Referer: REFERER, Range: 'bytes=0-0' },
      });
      if (res.ok || res.status === 206) return { latest_date: date, start_date: date };
    } catch {
      /* try older date */
    }
  }
  return null;
}

async function getIssuance() {
  if (issuanceCache.value && Date.now() - issuanceCache.t < 30 * 60 * 1000) {
    return issuanceCache.value;
  }
  let j = null;
  try {
    const res = await fetch(ISSUANCE_URL, { headers: { 'User-Agent': UA } });
    if (res.ok) j = await res.json();
  } catch {
    /* fall through to S3 probe */
  }
  if (!j || !j.start_date) j = await probeIssuanceFromS3();
  if (!j) throw new Error('issuance unavailable (API + S3)');
  issuanceCache = { t: Date.now(), value: j };
  return j;
}

async function rasterBuffer(o, v, dy) {
  const key = `${o}/${v}/${dy}`;
  if (rasterCache.has(key)) return rasterCache.get(key);
  const res = await fetch(`${S3}/${o}/${v}/${v}_${dy}.tif`, {
    headers: { 'User-Agent': UA, Referer: REFERER },
  });
  if (!res.ok) throw new Error(`${key} HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  if (rasterCache.size > 80) rasterCache.clear(); // drop stale issuances
  rasterCache.set(key, buf);
  return buf;
}

async function samplePixel(buf, lat, lon) {
  const tiff = await fromArrayBuffer(buf);
  const img = await tiff.getImage();
  const [ox, oy] = img.getOrigin();
  const [rx, ry] = img.getResolution();
  const px = Math.round((lon - ox) / rx);
  const py = Math.round((lat - oy) / ry);
  if (px < 0 || py < 0 || px >= img.getWidth() || py >= img.getHeight()) return null;
  const d = await img.readRasters({ window: [px, py, px + 1, py + 1] });
  const raw = d[0][0];
  return raw == null ? null : raw;
}

const toTemp = (raw) => (raw == null ? null : Math.round((raw / 255) * TEMP_DOMAIN_MAX));

/**
 * Returns { issued, days: [{date, tmax, tmin}] } sampled at lat/lon, or null.
 * Only for Philippine locations.
 */
export async function getPagasaTenDay(lat, lon, nDays = 6) {
  if (!isPhilippines(lat, lon)) return null;
  try {
    const iss = await getIssuance();
    const o = ymd(iss.latest_date);
    const dates = Array.from({ length: nDays }, (_, i) => addDays(iss.start_date, i));

    // Fetch all needed rasters in parallel (cached across calls).
    await Promise.all(
      dates.flatMap((date) => ['TMAX', 'TMIN'].map((v) => rasterBuffer(o, v, ymd(date)))),
    );

    const days = [];
    for (const date of dates) {
      const dy = ymd(date);
      const tmax = toTemp(await samplePixel(await rasterBuffer(o, 'TMAX', dy), lat, lon));
      const tmin = toTemp(await samplePixel(await rasterBuffer(o, 'TMIN', dy), lat, lon));
      days.push({ date, tmax, tmin });
    }
    return { issued: iss.latest_date, days };
  } catch (err) {
    console.error('[pagasa tenday]', err.message);
    return null;
  }
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${WD[d.getUTCDay()]} ${MO[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** A ready-to-send text panel of PAGASA's official TenDay temps, or null. */
export async function pagasaTenDayPanel(loc, nDays = 6) {
  const td = await getPagasaTenDay(loc.latitude, loc.longitude, nDays);
  if (!td || !td.days.some((d) => d.tmax != null)) return null;
  const rows = td.days
    .filter((d) => d.tmax != null)
    .map((d) => `${shortDate(d.date)}: ${d.tmax}° / ${d.tmin}°`);
  return (
    `🇵🇭 PAGASA TenDay — official outlook (issued ${td.issued})\n` +
    rows.join('\n')
  );
}
