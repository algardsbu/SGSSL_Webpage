/** @typedef {{id: string, title: string, date: string, time?: string, location?: string, description?: string, published: boolean}} CalendarEvent */

function utcDate(year, month, day = 1) {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month, day);
  return date;
}

export function todayInOslo(now = new Date()) {
  const parts = new Intl.DateTimeFormat('nb-NO', {
    timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = type => parts.find(entry => entry.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function shiftMonth(year, month, delta) {
  const date = utcDate(year, month + delta);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
}

/** Monday-first, six complete weeks. Empty cells belong to adjacent months. */
export function monthDays(year, month) {
  const first = utcDate(year, month);
  const offset = (first.getUTCDay() + 6) % 7;
  const length = utcDate(year, month + 1, 0).getUTCDate();
  return Array.from({ length: 42 }, (_, index) => {
    const day = index - offset + 1;
    return day < 1 || day > length ? null : utcDate(year, month, day).toISOString().slice(0, 10);
  });
}

export function formatMonth(year, month) {
  return new Intl.DateTimeFormat('nb-NO', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(utcDate(year, month));
}

export function formatDay(date) {
  return new Intl.DateTimeFormat('nb-NO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** @param {CalendarEvent[]} events */
export function upcomingEvents(events, today, limit = 3) {
  return events.filter(event => event.published && event.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '') || a.id.localeCompare(b.id))
    .slice(0, limit);
}

/** @param {CalendarEvent[]} events */
export function eventsOnDate(events, date) {
  return events.filter(event => event.published && event.date === date)
    .sort((a, b) => (a.time || '').localeCompare(b.time || '') || a.id.localeCompare(b.id));
}

/** Validate the entire CMS document before filtering out unpublished events.
 * @param {unknown} input
 * @returns {CalendarEvent[]}
 */
export function validateEvents(input) {
  if (!Array.isArray(input) || input.length > 1000) throw new Error('events.json must contain an array of at most 1000 events');
  const ids = new Set();
  const keys = ['id', 'title', 'date', 'time', 'location', 'description', 'published'];
  return input.map(event => {
    if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('Invalid calendar event');
    for (const key of Object.keys(event)) if (!keys.includes(key)) throw new Error(`Unknown calendar field: ${key}`);
    if (typeof event.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.id)) throw new Error('Calendar event requires a UUID v4');
    const id = event.id.toLowerCase();
    if (ids.has(id)) throw new Error('Duplicate calendar event ID');
    ids.add(id);
    if (typeof event.title !== 'string' || !event.title.trim() || event.title.length > 160) throw new Error('Calendar event requires a title of 1–160 characters');
    if (typeof event.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(event.date) || event.date.startsWith('0000-')) throw new Error('Calendar date must be YYYY-MM-DD, in years 0001–9999');
    const date = new Date(`${event.date}T00:00:00Z`);
    if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== event.date) throw new Error('Invalid calendar date');
    if (event.time !== undefined && (typeof event.time !== 'string' || (event.time !== '' && !/^([01]\d|2[0-3]):[0-5]\d(?:-([01]\d|2[0-3]):[0-5]\d)?$/.test(event.time)))) throw new Error('Calendar time must be HH:mm or HH:mm-HH:mm');
    for (const [name, max] of [['location', 200], ['description', 1000]]) {
      if (event[name] !== undefined && (typeof event[name] !== 'string' || event[name].length > max)) throw new Error(`Invalid calendar ${name}`);
    }
    if (event.published !== undefined && typeof event.published !== 'boolean') throw new Error('Calendar published must be a boolean');
    return { ...event, id, title: event.title.trim(), published: event.published ?? false };
  });
}
