import { config } from './config.js';

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
export async function getForecast(loc) {
  const params = new URLSearchParams({
    latitude: String(loc.latitude),
    longitude: String(loc.longitude),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,wind_speed_10m_max',
    timezone: config.timezone,
    temperature_unit: config.units.temperature,
    wind_speed_unit: config.units.wind,
    forecast_days: '1',
  });
  const res = await fetch(`${FORECAST_URL}?${params.toString()}`);
  if (!res.ok) throw new Error(`Forecast failed: ${res.status} ${res.statusText}`);
  const data = await res.json();

  const cur = data.current;
  const d = data.daily;
  return {
    location: loc,
    timezone: data.timezone,
    current: {
      temp: cur.temperature_2m,
      feelsLike: cur.apparent_temperature,
      humidity: cur.relative_humidity_2m,
      code: cur.weather_code,
      wind: cur.wind_speed_10m,
    },
    today: {
      code: d.weather_code[0],
      tempMax: d.temperature_2m_max[0],
      tempMin: d.temperature_2m_min[0],
      precipProb: d.precipitation_probability_max[0],
      windMax: d.wind_speed_10m_max[0],
      sunrise: d.sunrise[0],
      sunset: d.sunset[0],
    },
  };
}

/** Convenience: resolve location + fetch forecast in one call. */
export async function getDailyWeather() {
  const loc = await resolveLocation();
  return getForecast(loc);
}

const timeOnly = (iso) => {
  // Open-Meteo returns local ISO like "2026-06-13T05:30"
  const t = iso?.split('T')[1] || '';
  return t.slice(0, 5);
};

/**
 * Build a human-friendly weather message.
 * `format` = 'plain' (Viber/Messenger) or 'markdown' (Telegram).
 */
export function formatMessage(w, format = 'plain') {
  const t = tempUnitSymbol();
  const wu = windUnitSymbol();
  const cur = describeCode(w.current.code);
  const today = describeCode(w.today.code);

  const lines = [
    `${cur.emoji} Good morning! Weather for ${w.location.name}`,
    '',
    `${cur.emoji} Now: ${Math.round(w.current.temp)}${t} (feels ${Math.round(w.current.feelsLike)}${t}) — ${cur.label}`,
    `${today.emoji} Today: ${today.label}`,
    `🌡️ High ${Math.round(w.today.tempMax)}${t} / Low ${Math.round(w.today.tempMin)}${t}`,
    `🌧️ Rain chance: ${w.today.precipProb ?? 0}%`,
    `💧 Humidity: ${w.current.humidity}%`,
    `💨 Wind: up to ${Math.round(w.today.windMax)} ${wu}`,
    `🌅 Sunrise ${timeOnly(w.today.sunrise)} · 🌇 Sunset ${timeOnly(w.today.sunset)}`,
  ];

  let body = lines.join('\n');

  if (format === 'markdown') {
    // Telegram MarkdownV2 is fussy; we use plain "Markdown" (legacy) and
    // only bold the header to keep escaping simple.
    body = `*${lines[0]}*\n` + lines.slice(1).join('\n');
  }
  return body;
}
