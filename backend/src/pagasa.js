/**
 * PAGASA integration — the authoritative Philippine weather agency.
 *
 * PAGASA has no clean public JSON API, so we read its public Tropical Cyclone
 * Bulletin "iframe" page and detect whether a cyclone is active (and, if so,
 * its name and any raised Wind Signals). Result is cached to avoid hammering
 * PAGASA. This is the genuinely unique value PAGASA adds over global models.
 */
const BULLETIN_URL =
  'https://bagong.pagasa.dost.gov.ph/tropical-cyclone-bulletin-iframe';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120 Safari/537.36';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

let cache = { t: 0, value: undefined };

function stripText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns { active: false } when there's no cyclone, or
 * { active: true, name, signals: [...] } when there is. null on fetch error.
 */
export async function getTropicalCyclone() {
  const now = Date.now();
  if (cache.value !== undefined && now - cache.t < CACHE_TTL_MS) {
    return cache.value;
  }
  try {
    const res = await fetch(BULLETIN_URL, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = stripText(await res.text());

    let result;
    if (/no active tropical cyclone/i.test(text)) {
      result = { active: false };
    } else {
      const signals = [
        ...new Set(
          (text.match(/Signal\s*No\.?\s*[1-5]/gi) || []).map((s) =>
            s.replace(/\s+/g, ' ').replace(/no/i, 'No.').replace('No..', 'No.')
          )
        ),
      ];
      const m = text.match(
        /(Super Typhoon|Typhoon|Severe Tropical Storm|Tropical Storm|Tropical Depression)\s+[“"']?([A-Z][A-Za-z-]+)/
      );
      result = {
        active: true,
        name: m ? `${m[1]} ${m[2]}` : 'Active tropical cyclone',
        signals,
      };
    }
    cache = { t: now, value: result };
    return result;
  } catch (err) {
    console.error('[pagasa] bulletin fetch failed:', err.message);
    cache = { t: now, value: null }; // brief negative cache
    return null;
  }
}
