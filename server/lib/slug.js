/**
 * Slug + post-filename helpers following Chirpy's `YYYY-MM-DD-slug.md` convention.
 */

export function slugify(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    // keep unicode letters/numbers; collapse everything else to hyphens
    .replace(/['"]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled';
}

/** Format a Date (or ISO string) as YYYY-MM-DD in the given IANA timezone. */
export function dateStampInTZ(date = new Date(), timeZone = 'Asia/Seoul') {
  const d = typeof date === 'string' ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Full `date:` value Chirpy expects, e.g. 2026-08-15 09:30:00 +0900. */
export function fullDateInTZ(date = new Date(), timeZone = 'Asia/Seoul') {
  const d = typeof date === 'string' ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const offset = tzOffsetString(d, timeZone);
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')} ${offset}`;
}

function tzOffsetString(date, timeZone) {
  // Derive the numeric UTC offset for the zone at this instant.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, timeZoneName: 'longOffset',
  });
  const name = dtf.formatToParts(date).find((p) => p.type === 'timeZoneName')?.value || 'GMT+00:00';
  const m = name.match(/GMT([+-])(\d{2}):?(\d{2})/);
  if (!m) return '+0000';
  return `${m[1]}${m[2]}${m[3]}`;
}

export function postFilename(dateStamp, slug) {
  return `${dateStamp}-${slug}.md`;
}
