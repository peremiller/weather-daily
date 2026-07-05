import { config } from './config.js';
import { getTropicalCyclone } from './pagasa.js';
import { getTyphoonWatch, typhoonWatchLine } from './typhoonWatch.js';

/**
 * Open-Meteo client. No API key required.
 * Docs: https://open-meteo.com/en/docs
 */

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

// WMO weather interpretation codes -> { label, emoji }.
// https://open-meteo.com/en/docs (see "Weather variable documentation")
const WMO = {
  0: ['Clear sky', '☀️'],
  1: ['Mainly clear', '🌤️'],
  2: ['Partly cloudy', '⛅'],
  3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'],
  48: ['Depositing rime fog', '🌫️'],
  51: ['Light drizzle', '🌦️'],
  53: ['Moderate drizzle', '🌦️'],
  55: ['Dense drizzle', '🌧️'],
  56: ['Light freezing drizzle', '🌧️'],
  57: ['Dense freezing drizzle', '🌧️'],
  61: ['Slight rain', '🌦️'],
  63: ['Moderate rain', '🌧️'],
  65: ['Heavy rain', '🌧️'],
  66: ['Light freezing rain', '🌧️'],
  67: ['Heavy freezing rain', '🌧️'],
  71: ['Slight snow', '🌨️'],
  73: ['Moderate snow', '🌨️'],
  75: ['Heavy snow', '❄️'],
  77: ['Snow grains', '🌨️'],
  80: ['Slight rain showers', '🌦️'],
  81: ['Moderate rain showers', '🌧️'],
  82: ['Violent rain showers', '⛈️'],
  85: ['Slight snow showers', '🌨️'],
  86: ['Heavy snow showers', '❄️'],
  95: ['Thunderstorm', '⛈️'],
  96: ['Thunderstorm with slight hail', '⛈️'],
  99: ['Thunderstorm with heavy hail', '⛈️'],
};

export function describeCode(code) {
  const [label, emoji] = WMO[code] || ['Unknown', '🌡️'];
  return { label, emoji };
}

// Codes that already mean snow / thunderstorm — keep their own icon regardless
// of the rain-probability override below.
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const STORM_CODES = new Set([95, 96, 99]);

/**
 * Picks a daily icon that's consistent with the rain probability, so a sunny
 * icon never shows on a high-rain day. Falls back to the weather-code icon when
 * rain is unlikely (and always for snow/thunderstorm).
 */
export function dailyEmoji(code, precipProb) {
  const p = precipProb ?? 0;
  if (SNOW_CODES.has(code) || STORM_CODES.has(code)) return describeCode(code).emoji;
  if (p >= 70) return '🌧️';
  if (p >= 40) return '🌦️';
  return describeCode(code).emoji;
}

const tempUnitSymbol = () => (config.units.temperature === 'fahrenheit' ? '°F' : '°C');
const windUnitSymbol = () => config.units.wind;

/** Resolve a place name to coordinates. Returns {name, latitude, longitude}. */
export async function geocode(name) {
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(name)}&count=1&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status} ${res.statusText}`);
  const data = await res.json();
  if (!data.results || data.results.length === 0) {
    throw new Error(`No location found for "${name}"`);
  }
  const r = data.results[0];
  const parts = [r.name, r.admin1, r.country].filter(Boolean);
  return {
    name: parts.join(', '),
    latitude: r.latitude,
    longitude: r.longitude,
  };
}

/** Resolve the configured location, using lat/lon directly if provided. */
export async function resolveLocation() {
  const { name, latitude, longitude } = config.location;
  if (latitude != null && longitude != null) {
    return { name, latitude, longitude };
  }
  return geocode(name);
}

/**
 * Fetch today's forecast for the given coordinates.
 * Returns a normalised object used by the message formatter.
 */
export function isPhilippines(lat, lon) {
  return lat >= 4.5 && lat <= 21.5 && lon >= 116 && lon <= 127;
}

// Models we average. `best_match` is Open-Meteo's multi-source blend; GFS is
// NOAA's global model (PAGASA's official 10-day forecast is GFS-based). Order
// matters: the first model is the "primary" used for values we don't average
// (sunrise/sunset). Add/remove models here to widen the blend.
const BLEND_MODELS = ['best_match', 'gfs_seamless'];

// Local daytime window used to pick a "representative" condition, so a brief
// afternoon shower no longer labels an otherwise-sunny day as rainy.
const DAY_START = 6; // 6 AM
const DAY_END = 18; // 6 PM

// Average numeric arrays element-wise, ignoring nulls/NaN.
function avgArrays(arrays) {
  const n = Math.max(0, ...arrays.map((a) => a?.length || 0));
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let cnt = 0;
    for (const a of arrays) {
      const v = a?.[i];
      if (v != null && !Number.isNaN(v)) {
        sum += v;
        cnt++;
      }
    }
    out[i] = cnt ? sum / cnt : null;
  }
  return out;
}

// Per-model series for a base key, e.g. "temperature_2m_max" -> [best_match, gfs].
const modelSeries = (obj, base) =>
  BLEND_MODELS.map((m) => obj?.[`${base}_${m}`]).filter(Boolean);
// First available model's series (or the unsuffixed key as a fallback).
const primarySeries = (obj, base) => modelSeries(obj, base)[0] ?? obj?.[base];

// Most frequent code in a list; ties break toward the milder (lower) code.
function modeCode(codes) {
  if (!codes.length) return null;
  const counts = new Map();
  for (const c of codes) counts.set(c, (counts.get(c) || 0) + 1);
  let best = null;
  let bestN = -1;
  for (const [c, n] of counts) {
    if (n > bestN || (n === bestN && c < best)) {
      best = c;
      bestN = n;
    }
  }
  return best;
}

// For each date, the daytime-representative rain % (mean over daytime hours,
// across all models) and condition code (mode of daytime hourly codes).
function daytimeByDate(hourly, dates) {
  const times = hourly?.time || [];
  const probArrays = modelSeries(hourly, 'precipitation_probability');
  const codeArrays = modelSeries(hourly, 'weather_code');
  const probs = {};
  const codes = {};
  for (const d of dates) {
    probs[d] = [];
    codes[d] = [];
  }
  for (let i = 0; i < times.length; i++) {
    const [d, t] = times[i].split('T');
    if (!(d in probs)) continue;
    const hour = parseInt(t.slice(0, 2), 10);
    if (hour < DAY_START || hour > DAY_END) continue;
    for (const arr of probArrays) if (arr[i] != null) probs[d].push(arr[i]);
    for (const arr of codeArrays) if (arr[i] != null) codes[d].push(arr[i]);
  }
  const prob = {};
  const code = {};
  for (const d of dates) {
    const ps = probs[d];
    prob[d] = ps.length ? Math.round(ps.reduce((a, b) => a + b, 0) / ps.length) : null;
    code[d] = modeCode(codes[d]);
  }
  return { prob, code };
}

/**
 * Collapse a multi-model Open-Meteo response back into the classic single-series
 * shape the rest of this module expects, but with blended values:
 *   - daily highs/lows/wind  -> averaged across models
 *   - daily rain % + code    -> daytime-representative (mean %, modal code)
 *   - hourly precipitation   -> averaged (drives rain slots + start/stop)
 *   - sunrise/sunset         -> primary model (astronomical; model-independent)
 *   - current                -> passthrough (Open-Meteo returns one nowcast)
 */
function blendModels(data) {
  const d = data.daily;
  const h = data.hourly;
  if (!d || !h) return data; // nothing to blend (unexpected shape) — use as-is
  const dates = d.time;
  const day = daytimeByDate(h, dates);

  const dailyProbFallback = avgArrays(modelSeries(d, 'precipitation_probability_max'));
  const codeFallback = primarySeries(d, 'weather_code');

  data.daily = {
    time: dates,
    temperature_2m_max: avgArrays(modelSeries(d, 'temperature_2m_max')),
    temperature_2m_min: avgArrays(modelSeries(d, 'temperature_2m_min')),
    wind_speed_10m_max: avgArrays(modelSeries(d, 'wind_speed_10m_max')),
    sunrise: primarySeries(d, 'sunrise'),
    sunset: primarySeries(d, 'sunset'),
    precipitation_probability_max: dates.map(
      (dt, i) => day.prob[dt] ?? Math.round(dailyProbFallback[i] ?? 0),
    ),
    weather_code: dates.map((dt, i) => day.code[dt] ?? codeFallback?.[i] ?? 0),
  };

  data.hourly = {
    time: h.time,
    precipitation: avgArrays(modelSeries(h, 'precipitation')),
  };

  return data;
}

export async function getForecast(loc, timezone = config.timezone) {
  const params = new URLSearchParams({
    latitude: String(loc.latitude),
    longitude: String(loc.longitude),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,wind_speed_10m_max',
    hourly: 'precipitation,precipitation_probability,weather_code',
    timezone,
    temperature_unit: config.units.temperature,
    wind_speed_unit: config.units.wind,
    // 13 days: today + the next 12. Also gives plenty of hourly data to find
    // the next rain start/stop even across midnight.
    forecast_days: '13',
    // Blend two models: the multi-source `best_match` and GFS (PAGASA's 10-day
    // basis). We average their highs/lows and pick a daytime-representative
    // condition, which tracks apps like Google Weather far better than a single
    // model's 24-hour rain maximum. See blendModels().
    models: BLEND_MODELS.join(','),
  });
  const res = await fetch(`${FORECAST_URL}?${params.toString()}`);
  if (!res.ok) throw new Error(`Forecast failed: ${res.status} ${res.statusText}`);
  const data = blendModels(await res.json());

  const cur = data.current;
  const d = data.daily;
  const out = {
    location: loc,
    timezone: data.timezone,
    now: cur.time, // local ISO of "now", used to phrase rain timing
    current: {
      temp: cur.temperature_2m,
      feelsLike: cur.apparent_temperature,
      humidity: cur.relative_humidity_2m,
      code: cur.weather_code,
      wind: cur.wind_speed_10m,
    },
    today: {
      date: d.time[0],
      code: d.weather_code[0],
      tempMax: d.temperature_2m_max[0],
      tempMin: d.temperature_2m_min[0],
      precipProb: d.precipitation_probability_max[0],
      windMax: d.wind_speed_10m_max[0],
      sunrise: d.sunrise[0],
      sunset: d.sunset[0],
      rainSlots: rainSlotsForDate(data.hourly, d.time[0]),
    },
    tomorrow: d.time.length > 1
      ? {
          code: d.weather_code[1],
          tempMax: d.temperature_2m_max[1],
          tempMin: d.temperature_2m_min[1],
          precipProb: d.precipitation_probability_max[1],
          sunrise: d.sunrise[1],
          sunset: d.sunset[1],
        }
      : null,
    // Upcoming days (tomorrow onward) for the multi-day list.
    days: d.time.slice(1).map((date, idx) => {
      const i = idx + 1;
      return {
        date,
        code: d.weather_code[i],
        tempMax: d.temperature_2m_max[i],
        tempMin: d.temperature_2m_min[i],
        precipProb: d.precipitation_probability_max[i],
        rainSlots: rainSlotsForDate(data.hourly, date),
      };
    }),
    rain: computeRainOutlook(data.hourly, cur.time),
  };

  // For PH locations: note the GFS model alignment and attach PAGASA's
  // official tropical-cyclone status (cached, best-effort).
  if (isPhilippines(loc.latitude, loc.longitude)) {
    out.gfsModel = true;
    try {
      out.pagasa = await getTropicalCyclone();
    } catch {
      out.pagasa = null;
    }
    // Systems approaching PAR from the Western Pacific (GDACS) — surfaces a
    // typhoon before PAGASA gives it a local name.
    try {
      out.typhoon = await getTyphoonWatch();
    } catch {
      out.typhoon = null;
    }
  }
  return out;
}

// A measurable-rain threshold in mm/h. Below this we treat the hour as dry.
const RAIN_THRESHOLD_MM = 0.1;

/** Compact slot label from two 0–23 hours, e.g. (13,15) -> "1–3PM". */
function slotLabel(s, e) {
  if (e <= s) e = s + 1;
  const f = (h) => {
    const ap = h % 24 < 12 ? 'AM' : 'PM';
    let d = h % 12;
    if (d === 0) d = 12;
    return { d, ap };
  };
  const a = f(s);
  const b = f(e);
  return a.ap === b.ap ? `${a.d}–${b.d}${b.ap}` : `${a.d}${a.ap}–${b.d}${b.ap}`;
}

/**
 * Contiguous rain windows within one local date, as compact labels.
 * Open-Meteo hourly precipitation is a preceding-hour sum, so a wet hour H
 * means rain during [H-1, H]; windows are offset accordingly.
 */
function rainSlotsForDate(hourly, dateStr, maxSlots = 3) {
  if (!hourly?.time || !hourly?.precipitation) return [];
  const times = hourly.time;
  const precip = hourly.precipitation;
  const slots = [];
  let startH = null;
  let prevH = null;
  for (let i = 0; i < times.length; i++) {
    const [d, t] = times[i].split('T');
    if (d !== dateStr) continue;
    const hour = parseInt(t.slice(0, 2), 10);
    const wet = (precip[i] ?? 0) >= RAIN_THRESHOLD_MM;
    if (wet) {
      if (startH === null) startH = hour;
      prevH = hour;
    } else if (startH !== null) {
      slots.push([Math.max(0, startH - 1), prevH]);
      startH = null;
    }
  }
  if (startH !== null) slots.push([Math.max(0, startH - 1), prevH]);
  return slots.slice(0, maxSlots).map(([s, e]) => slotLabel(s, e));
}

/**
 * From hourly precipitation, work out whether it's raining now and when that
 * changes. Returns { rainingNow, type: 'start'|'stop'|'none', changeAt }.
 *   - not raining now → `changeAt` = first upcoming hour with rain (type 'start')
 *   - raining now     → `changeAt` = first upcoming dry hour (type 'stop')
 *   - changeAt null   → no change within the forecast window.
 */
function computeRainOutlook(hourly, currentTime) {
  if (!hourly?.time || !hourly?.precipitation) return null;
  const times = hourly.time;
  const precip = hourly.precipitation;

  // Index of the hour bucket containing "now" (last hour <= current time).
  let now = 0;
  for (let i = 0; i < times.length; i++) {
    if (times[i] <= currentTime) now = i;
    else break;
  }

  const isWet = (i) => (precip[i] ?? 0) >= RAIN_THRESHOLD_MM;
  const rainingNow = isWet(now);

  if (rainingNow) {
    for (let j = now + 1; j < times.length; j++) {
      if (!isWet(j)) return { rainingNow, type: 'stop', changeAt: times[j] };
    }
    return { rainingNow, type: 'stop', changeAt: null };
  }
  for (let j = now + 1; j < times.length; j++) {
    if (isWet(j)) return { rainingNow, type: 'start', changeAt: times[j] };
  }
  return { rainingNow, type: 'none', changeAt: null };
}

/** Convenience: resolve location + fetch forecast in one call. */
export async function getDailyWeather() {
  const loc = await resolveLocation();
  return getForecast(loc);
}

/**
 * Reverse-geocode coordinates to a readable place name (best effort).
 * Uses BigDataCloud's free, key-less reverse endpoint; falls back gracefully.
 */
export async function reverseGeocode(lat, lon) {
  try {
    const url =
      `https://api.bigdatacloud.net/data/reverse-geocode-client` +
      `?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
    const res = await fetch(url);
    if (res.ok) {
      const d = await res.json();
      const city = d.city || d.locality;
      const parts = [];
      if (city) parts.push(city);
      // Add the region only if it differs from the city (avoids "Tokyo, Tokyo").
      if (d.principalSubdivision && d.principalSubdivision !== city) {
        parts.push(d.principalSubdivision);
      }
      // Fall back to the (verbose) country name only when nothing else exists.
      if (parts.length === 0 && d.countryName) parts.push(d.countryName);
      const name = parts.join(', ');
      if (name) return name;
    }
  } catch {
    /* fall through to default */
  }
  return 'your location';
}

const timeOnly = (iso) => {
  // Open-Meteo returns local ISO like "2026-06-13T05:30"
  const t = iso?.split('T')[1] || '';
  return t.slice(0, 5);
};

/** "15:00" -> "3 PM", "15:30" -> "3:30 PM". */
function formatHour12(time) {
  let [h, m] = time.split(':').map(Number);
  const ampm = h < 12 ? 'AM' : 'PM';
  h = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h} ${ampm}` : `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

// Date-only math via UTC anchor so it never shifts across timezones.
const shiftDate = (dateStr, n) => {
  const dt = new Date(`${dateStr}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};
const weekdayName = (dateStr) =>
  ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
    new Date(`${dateStr}T00:00:00Z`).getUTCDay()
  ];

/** "2026-06-15" -> "Sun Jun 15". */
function shortDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getUTCMonth()
  ];
  return `${wd} ${mo} ${d.getUTCDate()}`;
}

/** "" for today, "tomorrow " or "Friday " otherwise. */
function dayPrefix(targetDate, nowDate) {
  if (targetDate === nowDate) return '';
  if (targetDate === shiftDate(nowDate, 1)) return 'tomorrow ';
  return `${weekdayName(targetDate)} `;
}

/** Builds the "when will rain start/stop" line, or null if unavailable. */
function rainLine(rain, nowIso) {
  if (!rain) return null;
  const nowDate = (nowIso || '').split('T')[0];
  if (rain.type === 'stop') {
    if (!rain.changeAt) return '🌧️ Rain looks set to continue for a while';
    const [date, time] = rain.changeAt.split('T');
    return `🌤️ Rain should ease ${dayPrefix(date, nowDate)}around ${formatHour12(time)}`;
  }
  // 'start' with a time, or 'none'
  if (rain.type === 'start' && rain.changeAt) {
    const [date, time] = rain.changeAt.split('T');
    return `☔ Rain expected ${dayPrefix(date, nowDate)}around ${formatHour12(time)}`;
  }
  return '🌤️ No rain expected in the next 2 days';
}

/**
 * Build a human-friendly weather message.
 * `format` = 'plain' (Viber/Messenger) or 'markdown' (Telegram).
 */
export function formatMessage(w, format = 'plain') {
  const t = tempUnitSymbol();
  const wu = windUnitSymbol();
  const cur = describeCode(w.current.code);
  const today = describeCode(w.today.code);

  const rl = rainLine(w.rain, w.now);

  // Tomorrow's sun times.
  const tomorrowSun = w.tomorrow
    ? `🌄 Tomorrow: Sunrise ${timeOnly(w.tomorrow.sunrise)} · Sunset ${timeOnly(w.tomorrow.sunset)}`
    : null;

  // Today's rain windows.
  const todaySlots =
    w.today.rainSlots && w.today.rainSlots.length
      ? `☔ Rain today: ${w.today.rainSlots.join(', ')}`
      : null;

  // Driest ranking still considers the full window (up to 12 days).
  const window = (w.days || []).slice(0, 12);
  // ...but the message itself shows only the next 6 days (rest live in the app).
  const upcoming = window.slice(0, 6).map((day) => {
    const e = dailyEmoji(day.code, day.precipProb);
    let line = `${shortDate(day.date)}  ${e} ${Math.round(day.tempMax)}°/${Math.round(day.tempMin)}° · 💧${day.precipProb ?? 0}%`;
    if (day.rainSlots && day.rainSlots.length) {
      line += `\n      ☔ rain ${day.rainSlots.join(', ')}`;
    }
    return line;
  });

  // Top 3 driest days (lowest rain chance) over the forecast window, ranked.
  const driest = [...window]
    .sort((a, b) => (a.precipProb ?? 0) - (b.precipProb ?? 0) || a.date.localeCompare(b.date))
    .slice(0, 3)
    .map((day, i) => `${i + 1}. ${shortDate(day.date)} — 💧${day.precipProb ?? 0}% rain`);

  // PAGASA tropical-cyclone status (PH only). Active = prominent alert at top.
  const tc = w.pagasa;
  const tcAlert =
    tc && tc.active
      ? [
          `🚨 PAGASA WARNING: ${tc.name}${tc.signals && tc.signals.length ? ` — ${tc.signals.join(', ')}` : ''}`,
          'Check pagasa.dost.gov.ph for the latest bulletin.',
          '',
        ]
      : [];
  // Typhoon Watch: a system approaching PAR (or inside, if PAGASA hasn't named
  // it yet). Skip when PAGASA already has an active named cyclone above.
  const tw = w.typhoon;
  const twLine =
    tw && tw.active && (tw.status === 'approaching' || !(tc && tc.active))
      ? typhoonWatchLine(tw)
      : null;

  // Footer bits for PH: clear-status note + the GFS/PAGASA source line.
  const phFooter = [];
  if (tc && !tc.active) phFooter.push('🌀 PAGASA: No active tropical cyclone in PH');
  if (w.gfsModel) phFooter.push('📡 Forecast: GFS + global blend, averaged (GFS = PAGASA\'s 10-day basis)');

  const lines = [
    `${cur.emoji} Weather for ${w.location.name}`,
    '',
    ...tcAlert,
    ...(twLine ? [twLine, ''] : []),
    `${cur.emoji} Now: ${Math.round(w.current.temp)}${t} (feels ${Math.round(w.current.feelsLike)}${t}) — ${cur.label}`,
    `${today.emoji} Today: ${today.label}`,
    `🌡️ High ${Math.round(w.today.tempMax)}${t} / Low ${Math.round(w.today.tempMin)}${t}`,
    `🌧️ Rain chance: ${w.today.precipProb ?? 0}%`,
    ...(rl ? [rl] : []),
    ...(todaySlots ? [todaySlots] : []),
    `💧 Humidity: ${w.current.humidity}%`,
    `💨 Wind: up to ${Math.round(w.today.windMax)} ${wu}`,
    `🌅 Today: Sunrise ${timeOnly(w.today.sunrise)} · Sunset ${timeOnly(w.today.sunset)}`,
    ...(tomorrowSun ? [tomorrowSun] : []),
    ...(upcoming.length
      ? ['', '📅 Next 6 days:', '', upcoming.join('\n\n')]
      : []),
    ...(driest.length
      ? ['', '🌤️ Driest days ahead (least rain):', ...driest]
      : []),
    ...(phFooter.length ? ['', ...phFooter] : []),
    '',
    '📱 See the full 12-day forecast — and switch your location anytime — in the My Daily Weather app.',
  ];

  let body = lines.join('\n');

  if (format === 'markdown') {
    // Telegram MarkdownV2 is fussy; we use plain "Markdown" (legacy) and
    // only bold the header to keep escaping simple.
    body = `*${lines[0]}*\n` + lines.slice(1).join('\n');
  }
  return body;
}
