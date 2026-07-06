/**
 * Official PAR entry/exit timing for a tropical cyclone, from the JMA (RSMC
 * Tokyo) forecast track — the authoritative forecaster for the Western Pacific.
 * JMA publishes forecast positions with VALID TIMES, so we can honestly compute
 * when the storm's forecast track crosses INTO PAR and back OUT (any edge —
 * west boundary, or the 25°N north boundary on recurvature).
 *
 * getParTiming(intlName) resolves the storm by international name and returns
 *   { source:'JMA (RSMC Tokyo)', issued, entry:{ms,lat,lon}, exit:{ms,lat,lon}|null }
 * or null if JMA has no matching forecast (caller then falls back to a labelled
 * kinematic estimate). Never throws.
 *
 * We do NOT invent numbers: entry/exit come straight from JMA's forecast track;
 * if the track doesn't reach/leave PAR within the window, that field is null and
 * the card says so ("beyond forecast — PAGASA advises").
 */

const JMA_LIST = 'https://www.jma.go.jp/bosai/typhoon/data/targetTc.json';
const jmaForecastUrl = (tc) =>
  `https://www.jma.go.jp/bosai/typhoon/data/${tc}/forecast.json`;
const UA = 'Mozilla/5.0 (weather-daily typhoon-forecast)';
const CACHE_TTL_MS = 30 * 60 * 1000;

// PAGASA's PAR polygon (lon, lat) — must match typhoonWatch.js.
const PAR = [
  [120, 25], [135, 25], [135, 5], [115, 5], [115, 15], [120, 21], [120, 25],
];
function inPolygon(lon, lat, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const hit = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}
const inPar = (lat, lon) => inPolygon(lon, lat, PAR);

const cache = new Map(); // intlName -> { t, value }

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Pull the forecast track for a storm by international name (e.g. "BAVI").
async function jmaTrack(intlName) {
  const target = String(intlName || '').trim().toLowerCase();
  const list = await fetchJson(JMA_LIST);
  for (const item of Array.isArray(list) ? list : []) {
    const tc = item.tropicalCyclone;
    if (!tc) continue;
    let fc;
    try {
      fc = await fetchJson(jmaForecastUrl(tc));
    } catch {
      continue;
    }
    const title = (fc || []).find((p) => p.part === 'title');
    const name = title?.name?.en?.trim().toLowerCase();
    if (!name || name !== target) continue;

    // Build the ordered track: analysis + forecast points with valid times.
    const track = [];
    for (const part of fc) {
      const c = part.center; // [lat, lon]
      const utc = part.validtime?.UTC;
      if (Array.isArray(c) && utc && part.advancedHours != null) {
        track.push({
          ms: Date.parse(utc),
          lat: c[0],
          lon: c[1],
          ah: part.advancedHours,
          // forecast-uncertainty circle radius (metres) — powers the cone.
          radiusM: part.probabilityCircle?.radius ?? null,
        });
      }
    }
    track.sort((a, b) => a.ah - b.ah);
    return { track, issued: title?.issue?.UTC || null };
  }
  return null;
}

// Interpolate the boundary-crossing point along segment a→b by sampling (robust
// for any PAR edge — west 135°E, north 25°N, etc.).
function crossingPoint(a, b) {
  const N = 24;
  let prevIn = inPar(a.lat, a.lon);
  for (let k = 1; k <= N; k++) {
    const f = k / N;
    const lat = a.lat + (b.lat - a.lat) * f;
    const lon = a.lon + (b.lon - a.lon) * f;
    const isin = inPar(lat, lon);
    if (isin !== prevIn) {
      const fm = f - 0.5 / N; // midpoint of the sub-step
      return {
        ms: Math.round(a.ms + (b.ms - a.ms) * fm),
        lat: +(a.lat + (b.lat - a.lat) * fm).toFixed(1),
        lon: +(a.lon + (b.lon - a.lon) * fm).toFixed(1),
      };
    }
    prevIn = isin;
  }
  return { ms: b.ms, lat: b.lat, lon: b.lon };
}

function crossings(track) {
  let entry = null;
  let exit = null;
  if (track.length && inPar(track[0].lat, track[0].lon)) {
    entry = { ms: track[0].ms, lat: track[0].lat, lon: track[0].lon, atStart: true };
  }
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1];
    const b = track[i];
    const ain = inPar(a.lat, a.lon);
    const bin = inPar(b.lat, b.lon);
    if (!ain && bin && !entry) entry = crossingPoint(a, b);
    else if (ain && !bin && entry && !exit) exit = crossingPoint(a, b);
  }
  return { entry, exit };
}

export async function getParTiming(intlName) {
  const key = String(intlName || '').toUpperCase();
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.t < CACHE_TTL_MS) return hit.value;
  let value = null;
  try {
    const res = await jmaTrack(intlName);
    if (res && res.track.length >= 2) {
      const { entry, exit } = crossings(res.track);
      if (entry || exit) {
        value = {
          source: 'JMA (RSMC Tokyo)',
          issued: res.issued,
          entry,
          exit,
          track: res.track, // full forecast track for the map (positions + radii)
        };
      }
    }
  } catch (err) {
    console.error('[typhoon-forecast] JMA fetch failed:', err.message);
    value = null;
  }
  cache.set(key, { t: now, value });
  return value;
}

/**
 * Fallback when no official forecast track is available: a transparent kinematic
 * ESTIMATE of PAR entry from the current distance to the 135°E boundary and a
 * stated typical approach speed. Exit is NOT estimated (recurvature/landfall
 * make it unreliable) — PAGASA advises. Returns null unless approaching.
 */
export function estimateParEntry(t, nowMs = Date.now()) {
  if (!t || t.status !== 'approaching') return null;
  const deg = t.lon - 135;
  if (deg <= 0) return null;
  const assumedKmh = 20; // climatological WNW approach speed
  const km = deg * 111.32 * Math.cos((t.lat * Math.PI) / 180);
  const hours = km / assumedKmh;
  return {
    source: 'estimate',
    assumedKmh,
    entry: { ms: Math.round(nowMs + hours * 3600 * 1000), estimate: true },
    exit: null,
  };
}
