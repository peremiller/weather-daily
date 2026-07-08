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
// JTWC warning text (has forecast positions WITH max winds). We resolve the WPnn
// storm number by matching the current position against the open ATCF best-track
// (b-deck) files mirrored at UCAR RAL.
const jtwcWarningUrl = (nn, yy) =>
  `https://www.metoc.navy.mil/jtwc/products/wp${nn}${yy}web.txt`;
const ucarBdeckDir = (yr) =>
  `https://hurricanes.ral.ucar.edu/repository/data/bdecks_open/${yr}/`;
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
async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// PAGASA-scale category from a 1-min max sustained wind (knots).
function categoryKt(kt) {
  if (kt == null) return null;
  if (kt >= 100) return 'STY'; // Super Typhoon (~>=185 km/h)
  if (kt >= 64) return 'TY';
  if (kt >= 48) return 'STS';
  if (kt >= 34) return 'TS';
  return 'TD';
}

// ATCF lat/lon tokens are tenths of a degree with a hemisphere suffix:
// "137N" -> 13.7, "1461E" -> 146.1.
function atcfDeg(tok) {
  const m = /^(\d+)([NSEW])$/.exec(String(tok).trim());
  if (!m) return null;
  let v = parseInt(m[1], 10) / 10;
  if (m[2] === 'S' || m[2] === 'W') v = -v;
  return v;
}

/**
 * Resolve the JTWC WPnn number for the storm nearest (lat, lon) by scanning the
 * open ATCF best-track files. Returns { nn, yy, anchor } where anchor is the
 * b-deck's latest YYYYMMDDHH (used to date the DDHHMM-only warning stamps).
 */
async function resolveJtwc(lat, lon) {
  const yr = new Date().getUTCFullYear();
  const dir = await fetchText(ucarBdeckDir(yr));
  const nums = [
    ...new Set([...dir.matchAll(new RegExp(`bwp(\\d\\d)${yr}\\.dat`, 'g'))].map((m) => m[1])),
  ].filter((n) => parseInt(n, 10) < 80); // skip 90-99 invests
  let best = null;
  for (const nn of nums) {
    try {
      const b = await fetchText(`${ucarBdeckDir(yr)}bwp${nn}${yr}.dat`);
      const lines = b.trim().split('\n').filter(Boolean);
      const f = lines[lines.length - 1].split(',').map((s) => s.trim());
      const blat = atcfDeg(f[6]);
      const blon = atcfDeg(f[7]);
      if (blat == null || blon == null) continue;
      const d = Math.hypot(blat - lat, blon - lon);
      if (d < 3 && (!best || d < best.d)) {
        best = { nn, yy: String(yr).slice(2), anchor: f[2], d, text: b };
      }
    } catch {
      /* skip unreadable deck */
    }
  }
  if (best) best.observed = parseBdeck(best.text);
  return best;
}

// Parse an ATCF best-track (b-deck) into an OBSERVED track: one point per fix
// time. This is fixed history — unlike the forecast, it doesn't shift on reissue.
function parseBdeck(txt) {
  const seen = new Set();
  const pts = [];
  for (const line of String(txt).trim().split('\n')) {
    const f = line.split(',').map((s) => s.trim());
    if (f[4] !== 'BEST') continue;
    const ymdh = f[2];
    if (!ymdh || seen.has(ymdh)) continue; // dedupe repeated wind-radii rows
    seen.add(ymdh);
    const lat = atcfDeg(f[6]);
    const lon = atcfDeg(f[7]);
    if (lat == null || lon == null) continue;
    const kt = parseInt(f[8], 10);
    pts.push({
      ms: Date.UTC(+ymdh.slice(0, 4), +ymdh.slice(4, 6) - 1, +ymdh.slice(6, 8), +ymdh.slice(8, 10)),
      lat,
      lon,
      windKt: Number.isFinite(kt) ? kt : null,
      windKph: Number.isFinite(kt) ? Math.round(kt * 1.852) : null,
      cat: categoryKt(Number.isFinite(kt) ? kt : null),
    });
  }
  pts.sort((a, b) => a.ms - b.ms);
  return pts;
}

// Build a UTC ms from a JTWC "DDHHMM" stamp using the b-deck anchor (YYYYMMDDHH)
// for year/month, rolling to next month when the day wraps backwards.
function jtwcTime(ddhhmm, anchor) {
  const yr = parseInt(anchor.slice(0, 4), 10);
  let mo = parseInt(anchor.slice(4, 6), 10); // 1-12
  const anchorDay = parseInt(anchor.slice(6, 8), 10);
  const dd = parseInt(ddhhmm.slice(0, 2), 10);
  const hh = parseInt(ddhhmm.slice(2, 4), 10);
  const mm = parseInt(ddhhmm.slice(4, 6), 10);
  if (dd < anchorDay - 3) mo += 1; // day wrapped into next month
  return Date.UTC(yr, mo - 1, dd, hh, mm);
}

// Parse a JTWC warning into a track of { ms, lat, lon, windKt, windKph, cat }.
function parseJtwcWarning(txt, anchor) {
  const pts = [];
  const cur = /WARNING POSITION:\s*(\d{6})Z\s*---\s*NEAR\s*([\d.]+)N\s*([\d.]+)E/.exec(txt);
  const curW = /WARNING POSITION:[\s\S]*?MAX SUSTAINED WINDS\s*-\s*(\d+)\s*KT/.exec(txt);
  const push = (ddhhmm, latS, lonS, ktS) => {
    const kt = ktS != null ? parseInt(ktS, 10) : null;
    pts.push({
      ms: jtwcTime(ddhhmm, anchor),
      lat: parseFloat(latS),
      lon: parseFloat(lonS),
      windKt: kt,
      windKph: kt != null ? Math.round(kt * 1.852) : null,
      cat: categoryKt(kt),
    });
  };
  if (cur) push(cur[1], cur[2], cur[3], curW ? curW[1] : null);
  const re =
    /(\d+)\s*HRS?,\s*VALID AT:\s*(\d{6})Z\s*---\s*([\d.]+)N\s*([\d.]+)E[\s\S]*?MAX SUSTAINED WINDS\s*-\s*(\d+)\s*KT/g;
  let m;
  while ((m = re.exec(txt))) push(m[2], m[3], m[4], m[5]);
  pts.sort((a, b) => a.ms - b.ms);
  return pts;
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

// Interpolate a track (timestamped points) to a given instant → { lat, lon,
// windKph }. Clamps to the first/last point outside the track window.
export function positionAt(track, ms) {
  if (!track || !track.length) return null;
  if (ms <= track[0].ms) return { ...track[0] };
  const last = track[track.length - 1];
  if (ms >= last.ms) return { ...last };
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1];
    const b = track[i];
    if (ms >= a.ms && ms <= b.ms) {
      const f = b.ms === a.ms ? 0 : (ms - a.ms) / (b.ms - a.ms);
      const w =
        a.windKph != null && b.windKph != null
          ? Math.round(a.windKph + (b.windKph - a.windKph) * f)
          : a.windKph ?? b.windKph ?? null;
      return { ms, lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f, windKph: w };
    }
  }
  return { ...last };
}

/**
 * The storm's CURRENT position + PAR status from the forecast track at `nowMs`
 * — used to override a stale GDACS fix. Returns { status, pos } where status is
 * 'inside' | 'approaching' | 'exited'.
 */
export function currentState(timing, nowMs = Date.now()) {
  if (!timing) return null;
  const pos = timing.track ? positionAt(timing.track, nowMs) : null;
  const entry = timing.entry != null ? timing.entry.ms : null;
  const exit = timing.exit != null ? timing.exit.ms : null;
  let status;
  // Prefer the forecast crossing TIMES so status can never disagree with the
  // entry/exit shown on the card (both come from the same track).
  if (entry != null) {
    if (nowMs < entry) status = 'approaching';
    else if (exit != null && nowMs >= exit) status = 'exited';
    else status = 'inside';
  } else if (pos) {
    status = inPar(pos.lat, pos.lon) ? 'inside' : 'approaching';
  } else {
    return null;
  }
  return { status, pos };
}

/**
 * PAR entry/exit timing + forecast track. Prefers JTWC (positions WITH per-point
 * max winds), then JMA (positions only), then null (caller estimates). Pass the
 * current position so JTWC can be resolved by best-track match.
 */
export async function getParTiming(intlName, curLat, curLon) {
  const key = String(intlName || '').toUpperCase();
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.t < CACHE_TTL_MS) return hit.value;

  // Observed best-track history (UCAR b-deck). It is FIXED — unlike the forecast
  // it doesn't shift on reissue — and reachable even when the JTWC warning server
  // 403s. Prepending it to any forecast anchors a PAST entry to real observations
  // so the "ENTERED PAR" time stops wobbling. Crossings run on observed+forecast.
  let observed = [];
  let jtwcMeta = null;
  if (curLat != null && curLon != null) {
    try {
      jtwcMeta = await resolveJtwc(curLat, curLon);
      observed = (jtwcMeta && jtwcMeta.observed) || [];
    } catch (err) {
      console.error('[typhoon-forecast] b-deck resolve failed:', err.message);
    }
  }
  const combinedCrossings = (fc) =>
    crossings([...observed.filter((p) => p.ms < fc[0].ms), ...fc]);

  // Forecast track: JTWC warning (per-point 1-min winds) preferred, else JMA.
  let forecast = null;
  let source = null;
  let windSource = null;
  if (jtwcMeta) {
    try {
      const f = parseJtwcWarning(await fetchText(jtwcWarningUrl(jtwcMeta.nn, jtwcMeta.yy)), jtwcMeta.anchor);
      if (f.length >= 2) {
        forecast = f;
        source = 'JTWC';
        windSource = 'JTWC (1-min winds)';
      }
    } catch (err) {
      console.error('[typhoon-forecast] JTWC warning failed:', err.message);
    }
  }
  let jmaRes = null;
  if (!forecast) {
    try {
      jmaRes = await jmaTrack(intlName);
      if (jmaRes && jmaRes.track.length >= 2) {
        forecast = jmaRes.track;
        source = 'JMA (RSMC Tokyo)';
      }
    } catch (err) {
      console.error('[typhoon-forecast] JMA failed:', err.message);
    }
  }

  let value = null;
  if (forecast) {
    const { entry, exit } = combinedCrossings(forecast);
    if (entry || exit) {
      value = { source, windSource, issued: new Date(forecast[0].ms).toISOString(), entry, exit, track: forecast };
    }
  } else if (observed.length >= 2) {
    // No forecast anywhere — fall back to observed history only.
    const { entry, exit } = crossings(observed);
    if (entry || exit) {
      value = { source: 'JTWC best-track', issued: new Date(observed[observed.length - 1].ms).toISOString(), entry, exit, track: observed };
    }
  }

  // When JTWC supplies the forecast (no probability radii), pull JMA to supply the
  // uncertainty CONE and backfill the EXIT if JTWC's window ends inside PAR.
  if (value && source === 'JTWC') {
    try {
      const res = jmaRes || (await jmaTrack(intlName));
      if (res && res.track.length >= 2) {
        if (!value.exit) {
          const { exit } = combinedCrossings(res.track);
          if (exit) value.exit = { ...exit, src: 'JMA' };
        }
        value.cone = res.track; // JMA probability circles -> cone
      }
    } catch (err) {
      console.error('[typhoon-forecast] JMA cone/exit failed:', err.message);
    }
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
