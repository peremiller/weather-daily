/**
 * Typhoon Watch — tropical cyclones INSIDE or APPROACHING the Philippine Area
 * of Responsibility (PAR).
 *
 * PAGASA's own bulletin (pagasa.js) only covers cyclones already inside PAR and
 * gives it the local name. To warn about a system that's still out in the
 * Western Pacific and *about to enter* PAR, we use GDACS — a key-less, HTTPS,
 * multi-agency feed (the same source disaster-watch uses). We keep only TCs
 * near/approaching PAR and return structured, clearly-sourced details.
 *
 * We never invent intensities or tracks: every number here comes straight from
 * GDACS, and the card/message attribute it. No clickbait.
 */

import { getParTiming, estimateParEntry } from './typhoonForecast.js';

const GDACS_URL =
  'https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP';
const UA = 'Mozilla/5.0 (weather-daily typhoon-watch)';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

let cache = { t: 0, value: undefined };

// PAR polygon (lon, lat), PAGASA's official boundary.
const PAR = [
  [120, 25], [135, 25], [135, 5], [115, 5], [115, 15], [120, 21], [120, 25],
];

// Ray-casting point-in-polygon.
function inPolygon(lon, lat, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const hit =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

// PAGASA intensity categories by 10-min max sustained wind (km/h).
function categorize(kph) {
  if (kph == null) return { cat: 'Tropical Cyclone', abbr: 'TC' };
  if (kph >= 185) return { cat: 'Super Typhoon', abbr: 'STY' };
  if (kph >= 118) return { cat: 'Typhoon', abbr: 'TY' };
  if (kph >= 89) return { cat: 'Severe Tropical Storm', abbr: 'STS' };
  if (kph >= 62) return { cat: 'Tropical Storm', abbr: 'TS' };
  return { cat: 'Tropical Depression', abbr: 'TD' };
}

// Classify a system's relationship to PAR from its position.
function parStatus(lon, lat) {
  if (inPolygon(lon, lat, PAR)) return 'inside';
  // East of the 135°E boundary and within the latitude band → approaching.
  if (lon > 135 && lon <= 158 && lat >= 3 && lat <= 30) return 'approaching';
  return 'outside';
}

const cleanName = (n) => String(n || '').replace(/-\d{2}$/, ''); // "BAVI-26" -> "BAVI"

// PAGASA assigns a Philippine local name from its fixed yearly list the moment a
// system ENTERS PAR. A system still approaching has no OFFICIAL local name yet —
// but the sequence makes the incoming name predictable, so we surface it as the
// "expected" PH name (mapped from the international name) until PAGASA confirms
// it on entry. Extend this map as new systems approach.
const EXPECTED_PH_NAME = {
  BAVI: 'Inday', // 9th name on PAGASA's 2026 list
};
const expectedLocalName = (intlName) =>
  EXPECTED_PH_NAME[String(intlName || '').toUpperCase()] || null;

/**
 * Returns the most relevant system for the PH, or { active:false }.
 * Shape when active:
 *   { active:true, name, category, catAbbr, alert,
 *     maxWindKph, maxWindMph, lat, lon, status, degToPAR, source }
 * null on fetch error (callers should treat as "unknown", not "all clear").
 */
export async function getTyphoonWatch() {
  const now = Date.now();
  if (cache.value !== undefined && now - cache.t < CACHE_TTL_MS) {
    return cache.value;
  }
  try {
    const res = await fetch(GDACS_URL, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const alertRank = { Red: 3, Orange: 2, Green: 1 };
    const systems = (data.features || [])
      .map((f) => {
        const p = f.properties || {};
        if (p.eventtype !== 'TC') return null;
        const coords = (f.geometry && f.geometry.coordinates) || [];
        const [lon, lat] = coords;
        if (lon == null || lat == null) return null;
        const status = parStatus(lon, lat);
        if (status === 'outside') return null; // not PH-relevant
        const kph = p.severitydata && Math.round(p.severitydata.severity);
        const { cat, abbr } = categorize(kph);
        const nm = cleanName(p.eventname || p.name);
        return {
          active: true,
          name: nm,
          localName: expectedLocalName(nm), // expected PAGASA name, or null
          category: cat,
          catAbbr: abbr,
          alert: p.alertlevel || null,
          maxWindKph: kph ?? null,
          maxWindMph: kph != null ? Math.round(kph / 1.609) : null,
          lat: Math.round(lat * 10) / 10,
          lon: Math.round(lon * 10) / 10,
          status, // 'inside' | 'approaching'
          degToPAR: status === 'approaching' ? Math.round((lon - 135) * 10) / 10 : 0,
          source: 'GDACS',
        };
      })
      .filter(Boolean)
      // Prefer inside-PAR over approaching, then higher alert, then stronger wind.
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'inside' ? -1 : 1;
        const r = (alertRank[b.alert] || 0) - (alertRank[a.alert] || 0);
        if (r) return r;
        return (b.maxWindKph || 0) - (a.maxWindKph || 0);
      });

    const value = systems[0] || { active: false };
    // Attach PAR entry/exit timing: prefer the official JMA forecast track,
    // fall back to a labelled kinematic estimate. Best-effort; never fatal.
    if (value.active) {
      try {
        value.timing =
          (await getParTiming(value.name)) || estimateParEntry(value) || null;
      } catch {
        value.timing = estimateParEntry(value) || null;
      }
    }
    cache = { t: now, value };
    return value;
  } catch (err) {
    console.error('[typhoon-watch] GDACS fetch failed:', err.message);
    cache = { t: now, value: null };
    return null;
  }
}

/** One-line summary for the text message, or null. */
export function typhoonWatchLine(t) {
  if (!t || !t.active) return null;
  const w = t.maxWindKph ? ` · ${t.maxWindKph} km/h winds` : '';
  const ph = t.localName ? ` (expected PH name: ${t.localName})` : '';
  if (t.status === 'inside') {
    return `🌀 ${t.category} ${t.name}${ph} is inside PAR${w} (${t.source}). Follow PAGASA bulletins.`;
  }
  return `🌀 ${t.category} ${t.name}${ph} is approaching PAR from the east${w} (${t.source}). Not yet inside — official name & timing come from PAGASA on entry.`;
}
